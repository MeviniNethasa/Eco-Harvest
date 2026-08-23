import os
import io
import re
import sys
from flask import Flask, request, jsonify
from flask_cors import CORS
import torch
from PIL import Image
from transformers import Qwen2VLForConditionalGeneration, AutoProcessor

# Prevent fork / tokenizers parallelism deadlocks and MPS memory mapping issues on macOS
os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"

# --- APPLE SILICON / MACOS CPU OPTIMIZATION ---
device = "cpu"
print(f"--> Target Framework Initialized: {device.upper()} (Apple Silicon AMX Matrix Engine)")

model_id = "prithivMLmods/Qwen2-VL-OCR-2B-Instruct"

print("--> Loading processor and model...")
processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)
try:
    model = Qwen2VLForConditionalGeneration.from_pretrained(
        model_id, 
        trust_remote_code=True, 
        torch_dtype=torch.bfloat16,
        low_cpu_mem_usage=True,
    ).to(device).eval()
    print("--> Model loaded successfully in bfloat16")
except Exception as e:
    print(f"--> Notice: bfloat16 load exception ({e}), falling back to float32...")
    model = Qwen2VLForConditionalGeneration.from_pretrained(
        model_id, 
        trust_remote_code=True, 
        torch_dtype=torch.float32,
        low_cpu_mem_usage=True,
    ).to(device).eval()

app = Flask(__name__)
CORS(app)

def parse_items_from_text(text):
    """
    Parses raw transcribed text lines into structured crop list items:
    cropName, requestedQtyKg, quantity, unit, confidence.
    """
    items = []
    lines = text.strip().split("\n")
    for idx, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue
        # Strip list prefixes like "1. ", "10. ", "- ", "• ", "1) "
        cleaned = re.sub(r"^\s*(?:[\-\*\u2022]|\d+[\.\)\:\-]?)\s*", "", line).strip()
        if not cleaned:
            # If line was purely numeric or bullet point, fallback to line
            cleaned = line

        # Match formats like: "3 kg of Carrots", "3kg Carrots", "Carrots 3kg", "Carrots 3"
        match = re.match(r"^(\d+(?:\.\d+)?)\s*(?:kg|g|units?|bundles?|packs?|boxes?)?\s*(?:of\s+)?(.+)$", cleaned, re.IGNORECASE) or \
                re.match(r"^(.+?)\s+(\d+(?:\.\d+)?)\s*(?:kg|g|units?|bundles?|packs?|boxes?)?$", cleaned, re.IGNORECASE)

        if match:
            v1 = match.group(1).replace(".", "")
            if v1.isdigit():
                qty = float(match.group(1))
                crop = match.group(2).strip()
            else:
                qty = float(match.group(2))
                crop = match.group(1).strip()
        else:
            qty = 10.0
            crop = cleaned

        # Clean unit prefix or preposition prefix like "of", "kg", "g" from crop name
        crop = re.sub(r"^(?:of|kg|g|units?|bundles?|packs?|boxes?)\s+", "", crop, flags=re.IGNORECASE).strip()
        crop = re.sub(r"^[\.\-\:\s]+", "", crop).strip()

        items.append({
            "id": f"item_{idx + 1}",
            "rawText": line,
            "cropName": crop,
            "item": crop,
            "requestedQtyKg": qty,
            "quantity": qty,
            "unit": "kg",
            "confidence": 95,
        })
    return items

def run_ocr(image_pil, max_size=600):
    """
    Runs Qwen2-VL OCR inference with optimized resolution and patch pixel constraints.
    """
    image_pil.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    print(f"--> Image downsampled to optimized dimensions: {image_pil.size}")

    messages = [{
        "role": "user",
        "content": [
            {"type": "image", "image": image_pil},
            {"type": "text", "text": "Transcribe all text from this handwritten image accurately. Maintain line breaks."},
        ],
    }]
    prompt = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)

    # Min/Max pixel hints optimize inner patch compression for ultra-fast CPU inference
    inputs = processor(
        text=[prompt], 
        images=[image_pil], 
        min_pixels=256 * 256,
        max_pixels=512 * 512,
        return_tensors="pt"
    ).to(device)

    print("--> Running optimized local inference on Apple Silicon AMX Core Matrix...")
    with torch.no_grad():
        generated_ids = model.generate(**inputs, max_new_tokens=256)

    output_text = processor.batch_decode(generated_ids, skip_special_tokens=True)
    clean_text = output_text[0].split("assistant\n")[-1].replace("<|im_end|>", "").strip()
    return clean_text

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "online",
        "service": "Qwen2-VL-OCR-Microservice",
        "model": model_id,
        "port": 5001
    }), 200

@app.route("/extract", methods=["POST"])
def extract():
    try:
        image_file = None
        if "image" in request.files:
            image_file = request.files["image"]
        elif "file" in request.files:
            image_file = request.files["file"]

        if not image_file:
            json_data = request.get_json(silent=True) or {}
            raw_text = json_data.get("text", "")
            if not raw_text:
                return jsonify({"success": False, "error": "No image file or text provided"}), 400
            
            extracted_items = parse_items_from_text(raw_text)
            return jsonify({
                "success": True,
                "raw_text": raw_text,
                "extracted_items": extracted_items
            }), 200

        image = Image.open(image_file.stream).convert("RGB")
        clean_text = run_ocr(image)
        extracted_items = parse_items_from_text(clean_text)

        print("\n=================== EXTRACTED TEXT RESULT ===================")
        print(clean_text)
        print("=============================================================\n")

        return jsonify({
            "success": True,
            "raw_text": clean_text,
            "extracted_items": extracted_items
        }), 200

    except Exception as e:
        print(f"Error during OCR extraction: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    print(f"--> Starting Qwen2-VL OCR Microservice on http://127.0.0.1:{port}...")
    app.run(host="127.0.0.1", port=port, debug=False)
