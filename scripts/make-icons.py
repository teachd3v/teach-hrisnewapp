"""Membuat seluruh ikon aplikasi dari design/logo-source.png (logo hitam di atas latar putih keabu-abuan).

Jalankan dari akar repo:  python scripts/make-icons.py      (butuh Pillow)

Cara kerja: luminans logo diubah menjadi mask tinta (0..1), dipotong rapat ke batas logo, diperbesar dengan LANCZOS lalu
ditajamkan dengan kurva kontras supaya tepi tetap bersih di ukuran besar. Mask itulah yang ditempel ke kanvas tiap ikon,
jadi tidak ada sisa warna latar abu-abu dari berkas sumber.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "design" / "logo-source.png"
ICONS = ROOT / "web" / "public" / "icons"
PUBLIC = ROOT / "web" / "public"
INK = (17, 24, 39)  # #111827: sama dengan warna utama aplikasi (hampir hitam), selaras dengan tombol dan teks
BG_SRC, INK_SRC = 253, 21  # nilai luminans latar dan tinta pada berkas sumber
NOISE_FLOOR = 0.25  # alfa di bawah ini dianggap derau/bayangan tipis pada sumber (mis. garis samar di tepi) dan dibuang


def ink_mask() -> Image.Image:
    g = Image.open(SRC).convert("L")
    # alfa = seberapa gelap piksel antara latar dan tinta, dibatasi 0..255
    def alpha(v: int) -> int:
        a = max(0.0, min(1.0, (BG_SRC - v) / (BG_SRC - INK_SRC)))
        return 0 if a < NOISE_FLOOR else round((a - NOISE_FLOOR) / (1 - NOISE_FLOOR) * 255)

    lut = [alpha(v) for v in range(256)]
    return g.point(lut)


def crop_tight(mask: Image.Image) -> Image.Image:
    box = mask.point(lambda v: 255 if v > 60 else 0).getbbox()
    pad = 4  # ujung tipis (mis. sudut balok) punya alfa rendah; margin kecil menjaganya tidak terpotong
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(mask.width, box[2] + pad), min(mask.height, box[3] + pad))
    return mask.crop(box)


def sharpen(alpha: Image.Image, k: float = 2.4) -> Image.Image:
    """Kurva kontras di sekitar 50% agar tepi hasil pembesaran tidak berbayang."""
    return alpha.point(lambda v: max(0, min(255, round((v / 255 - 0.5) * k * 255 + 127.5))))


def scaled(mask: Image.Image, height: int) -> Image.Image:
    w = round(mask.width * height / mask.height)
    big = mask.resize((w, height), Image.LANCZOS)
    return sharpen(big) if height > mask.height * 0.9 else big


def canvas(size: int, height_ratio: float, bg=(255, 255, 255, 255), ink=INK) -> Image.Image:
    m = scaled(MASK, round(size * height_ratio))
    img = Image.new("RGBA", (size, size), bg)
    layer = Image.new("RGBA", m.size, ink + (255,))
    layer.putalpha(m)
    img.alpha_composite(layer, ((size - m.width) // 2, (size - m.height) // 2))
    return img


MASK = crop_tight(ink_mask())
ICONS.mkdir(parents=True, exist_ok=True)
(ROOT / "design").mkdir(exist_ok=True)

# Ikon aplikasi (latar putih, opak: iOS/Android tidak memakai transparansi di ikon layar utama).
for s in (192, 512):
    canvas(s, 0.64).convert("RGB").save(ICONS / f"icon-{s}.png", optimize=True)
canvas(180, 0.64).convert("RGB").save(ICONS / "apple-touch-icon.png", optimize=True)
# Maskable: logo di dalam zona aman (lingkaran 80%), sisanya boleh terpotong oleh bentuk ikon perangkat.
canvas(512, 0.56).convert("RGB").save(ICONS / "icon-maskable-512.png", optimize=True)
# Master untuk generator ikon Tauri (Android/iOS/Windows/macOS).
canvas(1024, 0.62).convert("RGB").save(ROOT / "design" / "icon-master-1024.png", optimize=True)

# Lambang saja, latar transparan dan dipotong rapat (rata kiri dengan teks di layar login, dsb.).
m = scaled(MASK, 256)
mark = Image.new("RGBA", m.size, INK + (255,))
mark.putalpha(m)
mark.save(ICONS / "logo-mark-256.png", optimize=True)

# Lencana notifikasi Android: siluet putih di atas transparan (sistem hanya membaca kanal alfa).
bm = scaled(MASK, 76)
badge = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
bl = Image.new("RGBA", bm.size, (255, 255, 255, 255))
bl.putalpha(bm)
badge.alpha_composite(bl, ((96 - bm.width) // 2, (96 - bm.height) // 2))
badge.save(ICONS / "badge-96.png", optimize=True)

# Favicon: latar putih agar terbaca di tab gelap maupun terang.
fav = {s: canvas(s, 0.78).convert("RGB") for s in (16, 32, 48)}
fav[32].save(ICONS / "favicon-32.png", optimize=True)
fav[48].save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

print("logo (dipotong rapat):", MASK.size)
for p in sorted(list(ICONS.glob("*.png")) + [PUBLIC / "favicon.ico", ROOT / "design" / "icon-master-1024.png"]):
    with Image.open(p) as im:
        print(f"  {p.relative_to(ROOT)}  {im.size[0]}x{im.size[1]}  {p.stat().st_size} B")
