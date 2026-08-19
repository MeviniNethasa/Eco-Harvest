"""
backend/app.py

FastAPI server wrapping the Qwen2-VL-OCR handwriting transcription pipeline.

Run with:
    pip install fastapi uvicorn python-multipart torch transformers pillow accelerate
    uvicorn app:app --host 0.0.0.0 --port 8000 --reload

The server loads the vision-language model once at startup and exposes a
POST /extract-handwriting endpoint that accepts an uploaded image and returns
transcribed text plus a best-effort split into individual item strings.
"""

import io
import re
import traceback
from contextlib import asynccontextmanager
from typing import List

import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from transformers import AutoProcessor, Qwen2VLForConditionalGeneration

MODEL_ID = "prithivMLmods/Qwen2-VL-OCR-2B-Instruct"
MAX_IMAGE_DIMENSION = 768

# --- FIX MAC BUS ERROR / CRASH ---
# bfloat16 on CPU triggers native memory bus crashes on some macOS setups.
# Use float16 on Apple Silicon's MPS backend when available, otherwise fall
# back to plain float32 on CPU (bfloat16 avoided entirely on CPU).
device = "mps" if torch.backends.mps.is_available() else "cpu"
dtype = torch.float16 if device == "mps" else torch.float32

# Populated at startup by the lifespan handler below.
model = None
processor = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model, processor
    print(f"--> Target Framework Initialized: {device.upper()} (dtype={dtype})")
    print("--> Loading processor and model...")
    processor = AutoProcessor.from_pretrained(MODEL_ID, trust_remote_code=True)
    model = Qwen2VLForConditionalGeneration.from_pretrained(
        MODEL_ID,
        trust_remote_code=True,
        torch_dtype=dtype,
    ).to(device).eval()
    print("--> Model loaded and ready.")
    yield
    print("--> Shutting down.")


app = FastAPI(title="Handwriting OCR Backend", lifespan=lifespan)

# CORS enabled broadly so the Expo/React Native app (running from any LAN IP
# or the Expo Go client) can reach this server during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def parse_items(clean_text: str) -> List[str]:
    """
    Best-effort split of the transcribed text into individual grocery/produce
    line items. Each non-empty line becomes one item; leading bullet/dash
    markers and stray numbering are stripped.
    """
    items: List[str] = []
    for line in clean_text.splitlines():
        line = line.strip()
        if not line:
            continue
        # Strip leading bullets, dashes, or "1." / "1)" style numbering.
        line = re.sub(r"^[\-\*\u2022]+\s*", "", line)
        line = re.sub(r"^\d+[\.\)]\s*", "", line)
        line = line.strip()
        if line:
            items.append(line)
    return items


@app.get("/health")
async def health():
    return {"status": "ok", "device": device, "dtype": str(dtype)}


@app.post("/extract-handwriting")
async def extract_handwriting(file: UploadFile = File(...)):
    if model is None or processor is None:
        raise HTTPException(status_code=503, detail="Model is still loading, try again shortly.")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image.")

    try:
        raw_bytes = await file.read()
        image = Image.open(io.BytesIO(raw_bytes)).convert("RGB")

        # --- RESOLUTION REDUCTION CRITICAL FIX ---
        # Resize image to a maximum height/width of 768 pixels to reduce
        # processing load significantly.
        image.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION), Image.Resampling.LANCZOS)
        print(f"--> Image downsampled to optimized dimensions: {image.size}")

        messages = [{
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text", "text": "Transcribe all text from this handwritten image accurately. Maintain line breaks."},
            ],
        }]
        prompt = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)

        # Min/Max pixel hints force the inner Qwen patch processing pipeline
        # to stay compressed.
        inputs = processor(
            text=[prompt],
            images=[image],
            min_pixels=256 * 256,
            max_pixels=768 * 768,
            return_tensors="pt",
        ).to(device)

        print("--> Running inference...")
        with torch.no_grad():
            generated_ids = model.generate(**inputs, max_new_tokens=512)

        output_text = processor.batch_decode(generated_ids, skip_special_tokens=True)
        clean_text = output_text[0].split("assistant\n")[-1].replace("<|im_end|>", "").strip()

        extracted_items = parse_items(clean_text)

        print("\n=================== EXTRACTED TEXT RESULT ===================")
        print(clean_text)
        print("=============================================================\n")

        return {
            "success": True,
            "raw_text": clean_text,
            "extracted_items": extracted_items,
        }

    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Inference failed: {exc}")