// backend/src/routes/aiRoutes.js
const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');

// Configure multer in-memory storage for handling image uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB upload limit
});

const PYTHON_OCR_URL = process.env.PYTHON_OCR_URL || 'http://127.0.0.1:5001';
const PYTHON_AI_BASE_URL = process.env.PYTHON_AI_URL || 'http://127.0.0.1:5002';
const AI_TIMEOUT_MS = 180000; // 3-minute timeout to comfortably accommodate CPU vision generation

// Helper to parse lines of text into structured crop list items
function parseGroceryItems(text) {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.map((line, idx) => {
    const cleaned = line.replace(/^[\-\*\u2022\d\.\)\:\s]+/, '').trim() || line;
    let qty = 10;
    let name = cleaned;

    const m1 = /^(\d+(?:\.\d+)?)\s*(?:kg|g|units?|bundles?|packs?)?\s+(?:of\s+)?(.+)$/i.exec(cleaned);
    const m2 = /^(.+?)\s+(\d+(?:\.\d+)?)\s*(?:kg|g|units?|bundles?|packs?)?$/i.exec(cleaned);

    if (m1) {
      qty = parseFloat(m1[1]);
      name = m1[2].replace(/^(?:of|kg|g|units?|bundles?|packs?)\s+/i, '').trim();
    } else if (m2) {
      qty = parseFloat(m2[2]);
      name = m2[1].trim();
    }

    return {
      id: `item_${idx + 1}`,
      rawText: line,
      cropName: name,
      item: name,
      quantity: qty || 10,
      requestedQtyKg: qty || 10,
      unit: 'kg',
      confidence: 95,
    };
  });
}

// GET /api/ai/health
router.get('/health', async (req, res) => {
  try {
    const response = await axios.get(`${PYTHON_OCR_URL}/health`, {
      timeout: 3000,
    });
    return res.status(200).json({
      success: true,
      service: 'Express AI Proxy Bridge',
      pythonOcrStatus: 'online',
      pythonOcrEndpoint: PYTHON_OCR_URL,
      details: response.data,
    });
  } catch (error) {
    return res.status(200).json({
      success: true,
      service: 'Express AI Proxy Bridge',
      pythonOcrStatus: 'offline',
      pythonOcrEndpoint: PYTHON_OCR_URL,
      message: 'Python Qwen2-VL OCR service on http://127.0.0.1:5001 is offline.',
    });
  }
});

// POST /api/ai/extract-handwritten-list
router.post('/extract-handwritten-list', upload.single('image'), async (req, res) => {
  try {
    let imageBuffer = req.file?.buffer;
    let mimeType = req.file?.mimetype || 'image/jpeg';
    let fileName = req.file?.originalname || 'handwritten_list.jpg';

    // Decode base64 image if uploaded as JSON payload
    if (!imageBuffer && req.body?.imageBase64) {
      const cleanBase64 = req.body.imageBase64.replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = Buffer.from(cleanBase64, 'base64');
    }

    // 1. Forward image buffer to Python OCR Microservice (Port 5001)
    if (imageBuffer) {
      console.log(`[AI Proxy] Processing image (${imageBuffer.length} bytes), forwarding to ${PYTHON_OCR_URL}/extract...`);
      const form = new FormData();
      form.append('image', imageBuffer, {
        filename: fileName,
        contentType: mimeType,
      });

      const pythonResponse = await axios.post(`${PYTHON_OCR_URL}/extract`, form, {
        headers: {
          ...form.getHeaders(),
        },
        timeout: AI_TIMEOUT_MS,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      if (pythonResponse.data && pythonResponse.data.success) {
        const items = pythonResponse.data.extracted_items || [];
        return res.status(200).json({
          success: true,
          source: 'qwen2_vl_ocr_microservice',
          endpoint: `${PYTHON_OCR_URL}/extract`,
          raw_text: pythonResponse.data.raw_text,
          extracted_items: items,
          items: items,
        });
      } else {
        return res.status(500).json({
          success: false,
          message: pythonResponse.data?.error || 'OCR microservice failed to extract text',
        });
      }
    }

    // 2. If raw text was provided in req.body
    const text = req.body?.text || (req.body && typeof req.body === 'string' ? req.body : '');
    if (text) {
      try {
        const pythonResponse = await axios.post(
          `${PYTHON_OCR_URL}/extract`,
          { text },
          { headers: { 'Content-Type': 'application/json' }, timeout: 5000 }
        );
        if (pythonResponse.data && pythonResponse.data.success) {
          const items = pythonResponse.data.extracted_items || [];
          return res.status(200).json({
            success: true,
            source: 'qwen2_vl_ocr_microservice_text',
            raw_text: pythonResponse.data.raw_text,
            extracted_items: items,
            items: items,
          });
        }
      } catch (e) {
        const items = parseGroceryItems(text);
        return res.status(200).json({
          success: true,
          source: 'local_text_parser_fallback',
          raw_text: text,
          extracted_items: items,
          items: items,
        });
      }
    }

    return res.status(400).json({
      success: false,
      message: 'No image file or text provided in request payload',
    });
  } catch (error) {
    console.error('[AI Proxy Error]:', error.message);
    const isConnRefused = error.code === 'ECONNREFUSED';
    return res.status(502).json({
      success: false,
      message: isConnRefused
        ? `Cannot connect to Python OCR microservice on ${PYTHON_OCR_URL}. Please ensure 'python3 qwen_ocr/app.py' is running.`
        : `OCR processing failed: ${error.message}`,
    });
  }
});

// POST /api/ai/assess-freshness
router.post('/assess-freshness', upload.single('image'), async (req, res) => {
  try {
    let imageBuffer = req.file?.buffer;
    let mimeType = req.file?.mimetype || 'image/jpeg';
    let fileName = req.file?.originalname || 'crop_inspection.jpg';
    let cropName = req.body?.cropName || req.body?.cropCategory || 'Organic Produce';

    if (!imageBuffer && req.body?.imageBase64) {
      const cleanBase64 = req.body.imageBase64.replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = Buffer.from(cleanBase64, 'base64');
    }

    try {
      let pythonResponse;
      if (imageBuffer) {
        const form = new FormData();
        form.append('image', imageBuffer, {
          filename: fileName,
          contentType: mimeType,
        });
        form.append('cropName', cropName);

        pythonResponse = await axios.post(`${PYTHON_OCR_URL}/assess-freshness`, form, {
          headers: {
            ...form.getHeaders(),
          },
          timeout: AI_TIMEOUT_MS,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
      } else {
        pythonResponse = await axios.post(
          `${PYTHON_OCR_URL}/assess-freshness`,
          {
            imageUri: req.body?.imageUri,
            imageBase64: req.body?.imageBase64,
            cropName,
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: AI_TIMEOUT_MS,
          }
        );
      }

      if (pythonResponse.data && pythonResponse.data.success) {
        return res.status(200).json({
          success: true,
          source: 'vgg16_trained_model',
          endpoint: `${PYTHON_OCR_URL}/assess-freshness`,
          data: pythonResponse.data.data,
        });
      }
    } catch (proxyErr) {
      console.warn('[AI Proxy]: Python freshness service call failed:', proxyErr.message);
      return res.status(502).json({
        success: false,
        message: `Freshness assessment microservice unavailable: ${proxyErr.message}`,
      });
    }

    return res.status(400).json({
      success: false,
      message: 'No photo provided for freshness inspection',
    });
  } catch (error) {
    console.error('Error in assess-freshness proxy:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
