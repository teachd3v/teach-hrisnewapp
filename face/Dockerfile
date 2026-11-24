FROM --platform=linux/amd64 python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MODEL_DIR=/app/models

# Pustaka sistem minimal untuk opencv-python-headless & curl pengunduh model saat build.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Model dibundel ke dalam image agar tidak perlu internet saat runtime (enableInternet: false).
RUN mkdir -p /app/models \
    && curl -fsSL "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx" \
       -o /app/models/face_detection_yunet_2023mar.onnx \
    && curl -fsSL "https://huggingface.co/fal/AuraFace-v1/resolve/main/glintr100.onnx" \
       -o /app/models/glintr100.onnx \
    && test $(stat -c%s /app/models/face_detection_yunet_2023mar.onnx) -gt 200000 \
    && test $(stat -c%s /app/models/glintr100.onnx) -gt 250000000

COPY models/MiniFASNetV2.onnx /app/models/MiniFASNetV2.onnx
COPY app.py .

EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--log-level", "warning"]
