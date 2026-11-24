"""Layanan verifikasi wajah server-side (Cloudflare Container): YuNet + AuraFace v1 (512-d) + MiniFASNetV2."""

from __future__ import annotations

import asyncio
import io
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image, ImageOps

MODEL_DIR = Path(os.environ.get("MODEL_DIR", "/app/models"))
YUNET_PATH = MODEL_DIR / "face_detection_yunet_2023mar.onnx"
AURAFACE_PATH = MODEL_DIR / "glintr100.onnx"
SPOOF_PATH = MODEL_DIR / "MiniFASNetV2.onnx"

MODEL_VERSION = "auraface-v1"
FACE_DIM = 512
MAX_SIDE = 1280
MAX_IMAGE_BYTES = 5 * 1024 * 1024

# Titik acuan ArcFace 112x112: mata kiri/kanan di gambar, hidung, sudut mulut kiri/kanan di gambar.
ARCFACE_DST = np.array(
    [
        [38.2946, 51.6963],
        [73.5318, 51.5014],
        [56.0252, 71.7366],
        [41.5493, 92.3655],
        [70.7299, 92.2041],
    ],
    dtype=np.float32,
)

# Ambang kualitas lembut: menolak foto yang memang tak terbaca/ekstrem, tidak menjebak kamera depan HP yang halus.
MIN_FACE_RATIO = 0.14
MIN_FACE_PX = 60.0
MULTI_FACE_AREA_RATIO = 0.45
MULTI_FACE_SCORE = 0.75
MAX_YAW = 0.32
MIN_PITCH = 0.10
MAX_PITCH = 0.95
MIN_LUM = 22.0
MIN_SHARP = 20.0


class FacePipeline:
    def __init__(self) -> None:
        if not YUNET_PATH.is_file():
            raise RuntimeError(f"YuNet model missing: {YUNET_PATH}")
        if not AURAFACE_PATH.is_file():
            raise RuntimeError(f"AuraFace model missing: {AURAFACE_PATH}")

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = max(1, min(4, os.cpu_count() or 1))
        opts.inter_op_num_threads = 1
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        self.detector = cv2.FaceDetectorYN.create(
            str(YUNET_PATH),
            "",
            (320, 320),
            score_threshold=0.65,
            nms_threshold=0.3,
            top_k=10,
        )
        self.aura = ort.InferenceSession(
            str(AURAFACE_PATH), sess_options=opts, providers=["CPUExecutionProvider"]
        )
        self.aura_in = self.aura.get_inputs()[0].name
        self.aura_out = self.aura.get_outputs()[0].name

        self.spoof: ort.InferenceSession | None = None
        if SPOOF_PATH.is_file():
            self.spoof = ort.InferenceSession(
                str(SPOOF_PATH), sess_options=opts, providers=["CPUExecutionProvider"]
            )
            self.spoof_in = self.spoof.get_inputs()[0].name
            self.spoof_out = self.spoof.get_outputs()[0].name

    def analyze_bytes(self, raw: bytes) -> dict[str, Any]:
        t0 = time.perf_counter()
        if not raw or len(raw) > MAX_IMAGE_BYTES:
            return _fail("invalid_image", "Berkas foto tidak valid atau terlalu besar.")

        try:
            with Image.open(io.BytesIO(raw)) as pil_img:
                pil_img = ImageOps.exif_transpose(pil_img).convert("RGB")
                rgb = np.asarray(pil_img, dtype=np.uint8)
        except Exception:
            return _fail("invalid_image", "Foto tidak dapat dibaca. Coba ambil foto ulang.")

        h, w = rgb.shape[:2]
        if w < 80 or h < 80:
            return _fail("invalid_image", "Resolusi foto terlalu kecil.")

        if max(w, h) > MAX_SIDE:
            scale = MAX_SIDE / float(max(w, h))
            nw, nh = int(round(w * scale)), int(round(h * scale))
            rgb = cv2.resize(rgb, (nw, nh), interpolation=cv2.INTER_AREA)
            h, w = nh, nw

        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        self.detector.setInputSize((w, h))
        _, faces = self.detector.detect(bgr)
        if faces is None or len(faces) == 0:
            return _fail("no_face", "Wajah tidak terdeteksi. Posisikan wajah di dalam bingkai dengan cahaya cukup.")

        # Urutkan wajah berdasarkan luas kotak (wajah utama paling besar).
        ranked = sorted(faces, key=lambda f: float(f[2]) * float(f[3]), reverse=True)
        primary = ranked[0]
        x, y, bw, bh = float(primary[0]), float(primary[1]), float(primary[2]), float(primary[3])
        det_score = float(primary[14])
        primary_area = max(1.0, bw * bh)

        # Tolak hanya jika ada wajah kedua yang cukup besar (orang di sebelah), bukan orang jauh di latar belakang.
        for other in ranked[1:]:
            if float(other[14]) >= MULTI_FACE_SCORE and (float(other[2]) * float(other[3])) >= primary_area * MULTI_FACE_AREA_RATIO:
                return _fail("multi_face", "Terdeteksi lebih dari satu wajah. Pastikan hanya wajah Anda di foto.")

        min_dim = float(min(w, h))
        face_ratio = bw / min_dim
        if bw < MIN_FACE_PX or face_ratio < MIN_FACE_RATIO:
            return _fail("too_small", "Wajah terlalu jauh. Dekatkan wajah ke kamera.")

        # Landmark YuNet: mata1, mata2, hidung, mulut1, mulut2 -> urutkan kiri/kanan di gambar.
        eyes = sorted([(float(primary[4]), float(primary[5])), (float(primary[6]), float(primary[7]))], key=lambda p: p[0])
        nose = (float(primary[8]), float(primary[9]))
        mouth = sorted([(float(primary[10]), float(primary[11])), (float(primary[12]), float(primary[13]))], key=lambda p: p[0])

        yaw, pitch = _head_pose(eyes[0], eyes[1], nose, mouth[0], mouth[1])
        if abs(yaw) > MAX_YAW or pitch < MIN_PITCH or pitch > MAX_PITCH:
            return _fail("turned", "Hadap lurus ke kamera, jangan menoleh atau terlalu menunduk.")

        src_pts = np.array([eyes[0], eyes[1], nose, mouth[0], mouth[1]], dtype=np.float32)
        matrix, _ = cv2.estimateAffinePartial2D(src_pts, ARCFACE_DST, method=cv2.LMEDS)
        if matrix is None:
            return _fail("no_face", "Wajah tidak dapat diselaraskan. Coba ambil foto ulang.")

        aligned_rgb = cv2.warpAffine(rgb, matrix, (112, 112), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0))
        lum, sharp = _image_quality(aligned_rgb)
        if lum < MIN_LUM:
            return _fail("too_dark", "Foto terlalu gelap. Pindah ke tempat yang lebih terang.")
        if sharp < MIN_SHARP:
            return _fail("too_blurry", "Foto terlalu buram. Tahan HP stabil lalu ambil ulang.")

        # AuraFace v1 (glintr100): RGB, normalisasi [-1, 1], NCHW [1, 3, 112, 112].
        blob = (aligned_rgb.astype(np.float32) - 127.5) / 127.5
        blob = np.transpose(blob, (2, 0, 1))[np.newaxis, ...]
        vec = np.asarray(self.aura.run([self.aura_out], {self.aura_in: blob})[0], dtype=np.float32).reshape(-1)
        if vec.shape[0] != FACE_DIM:
            raise RuntimeError(f"Unexpected AuraFace dim: {vec.shape}")
        norm = float(np.linalg.norm(vec))
        if norm <= 1e-9 or not np.isfinite(norm):
            return _fail("invalid_image", "Ekstraksi fitur wajah gagal. Coba ambil foto ulang.")
        vec = vec / norm

        live = self._run_spoof(bgr, x, y, bw, bh, w, h)
        ms = round((time.perf_counter() - t0) * 1000, 1)
        return {
            "ok": True,
            "model": MODEL_VERSION,
            "embedding": [round(float(v), 6) for v in vec],
            "live": None if live is None else round(float(live), 4),
            "stats": {
                "lum": round(lum, 1),
                "sharp": round(sharp, 1),
                "yaw": round(yaw, 3),
                "pitch": round(pitch, 3),
                "faceRatio": round(face_ratio, 3),
                "detScore": round(det_score, 3),
                "ms": ms,
            },
        }

    def _run_spoof(self, bgr: np.ndarray, x: float, y: float, bw: float, bh: float, w: int, h: int) -> float | None:
        if self.spoof is None or bw <= 1 or bh <= 1:
            return None
        scale = min((h - 1) / bh, (w - 1) / bw, 2.7)
        nw, nh = bw * scale, bh * scale
        cx, cy = x + bw / 2.0, y + bh / 2.0
        x0, y0, x1, y1 = cx - nw / 2.0, cy - nh / 2.0, cx + nw / 2.0, cy + nh / 2.0
        if x0 < 0:
            x1 -= x0
            x0 = 0.0
        if y0 < 0:
            y1 -= y0
            y0 = 0.0
        if x1 > w - 1:
            x0 -= x1 - (w - 1)
            x1 = float(w - 1)
        if y1 > h - 1:
            y0 -= y1 - (h - 1)
            y1 = float(h - 1)
        ix0, iy0 = max(0, int(np.floor(x0))), max(0, int(np.floor(y0)))
        ix1, iy1 = min(w - 1, int(np.floor(x1))), min(h - 1, int(np.floor(y1)))
        if ix1 <= ix0 or iy1 <= iy0:
            return None
        crop = bgr[iy0 : iy1 + 1, ix0 : ix1 + 1]
        resized = cv2.resize(crop, (80, 80), interpolation=cv2.INTER_AREA)
        inp = np.transpose(resized.astype(np.float32), (2, 0, 1))[np.newaxis, ...]  # BGR 0..255 NCHW
        logits = np.asarray(self.spoof.run([self.spoof_out], {self.spoof_in: inp})[0], dtype=np.float32).reshape(-1)
        logits = logits - float(np.max(logits))
        exps = np.exp(logits)
        probs = exps / float(np.sum(exps))
        return float(probs[1]) if probs.shape[0] > 1 else None


def _head_pose(
    eye_l: tuple[float, float],
    eye_r: tuple[float, float],
    nose: tuple[float, float],
    mouth_l: tuple[float, float],
    mouth_r: tuple[float, float],
) -> tuple[float, float]:
    """Hitung yaw & pitch terkompensasi kemiringan (roll) dengan memproyeksikan hidung ke sumbu garis mata."""
    el = np.array(eye_l, dtype=np.float64)
    er = np.array(eye_r, dtype=np.float64)
    n = np.array(nose, dtype=np.float64)
    mid_e = (el + er) / 2.0
    mid_m = (np.array(mouth_l, dtype=np.float64) + np.array(mouth_r, dtype=np.float64)) / 2.0
    diff = er - el
    d = float(np.hypot(diff[0], diff[1])) or 1.0
    ex = diff / d
    ey = np.array([-ex[1], ex[0]], dtype=np.float64)
    v = n - mid_e
    yaw = float(np.dot(v, ex)) / d
    face_h = max(1.0, float(np.dot(mid_m - mid_e, ey)))
    pitch = float(np.dot(v, ey)) / face_h
    return yaw, pitch


def _image_quality(aligned_rgb: np.ndarray) -> tuple[float, float]:
    gray = cv2.cvtColor(aligned_rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
    lum = float(np.mean(gray[24:96, 24:88]))
    lap = cv2.Laplacian(gray, cv2.CV_32F)
    sharp = float(np.var(lap))
    return lum, sharp


def _fail(reason: str, message: str) -> dict[str, Any]:
    return {"ok": False, "reason": reason, "message": message}


pipeline: FacePipeline | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global pipeline
    pipeline = FacePipeline()
    yield
    pipeline = None


app = FastAPI(title="HRIS Face Service", lifespan=lifespan)


@app.get("/health")
def health():
    if pipeline is None:
        return JSONResponse({"ok": False}, status_code=503)
    return {"ok": True, "model": MODEL_VERSION, "dim": FACE_DIM, "spoof": pipeline.spoof is not None}


@app.post("/analyze")
async def analyze(photo: UploadFile = File(...)):
    if pipeline is None:
        return JSONResponse(_fail("service_unavailable", "Layanan verifikasi wajah belum siap."), status_code=503)
    raw = await photo.read(MAX_IMAGE_BYTES + 1)
    if len(raw) > MAX_IMAGE_BYTES:
        return JSONResponse(_fail("invalid_image", "Ukuran foto terlalu besar."), status_code=413)
    return await asyncio.to_thread(pipeline.analyze_bytes, raw)
