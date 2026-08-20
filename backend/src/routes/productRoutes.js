// backend/src/routes/productRoutes.js
const express = require('express');
const router = express.Router();
const Product = require('../models/Product');

// GET /api/products (List all products / filter by category or farmer)
router.get('/', async (req, res) => {
  try {
    const { category, farmerId, verifiedOnly } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (farmerId) filter.farmerId = farmerId;
    if (verifiedOnly === 'true') filter.isSLSIVerified = true;

    const products = await Product.find(filter).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: products.length, data: products });
  } catch (error) {
    console.error('Error fetching products:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/products/farmer/:farmerId (List products published by a specific farmer)
router.get('/farmer/:farmerId', async (req, res) => {
  try {
    const products = await Product.find({ farmerId: req.params.farmerId }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: products.length, data: products });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/products/:id (Get single product by ID)
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    return res.status(200).json({ success: true, data: product });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/products (Publish a new crop listing)
router.post('/', async (req, res) => {
  try {
    const {
      farmerId,
      name,
      title,
      category,
      pricePerKg,
      pricePerUnit,
      unit,
      availableQuantity,
      availableQtyKg,
      imageUrl,
      isSLSIVerified,
      farmName,
      province,
      district,
      city,
    } = req.body;

    const cropName = name || title;
    const price = pricePerKg || pricePerUnit;

    if (!farmerId || !cropName || !price) {
      return res.status(400).json({
        success: false,
        message: 'farmerId, product name/title, and price are required',
      });
    }

    const product = await Product.create({
      farmerId,
      title: cropName,
      name: cropName,
      category: category || 'Vegetables',
      pricePerKg: Number(price),
      pricePerUnit: Number(price),
      unit: unit || '1kg',
      availableQuantity: availableQuantity || availableQtyKg || 100,
      availableQtyKg: availableQtyKg || availableQuantity || 100,
      imageUrl:
        imageUrl || 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&q=60',
      isSLSIVerified: !!isSLSIVerified,
      farmName: farmName || '',
      province: province || '',
      district: district || '',
      city: city || '',
    });

    return res.status(201).json({ success: true, message: 'Product published', data: product });
  } catch (error) {
    console.error('Error creating product:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/products/:id (Delete a crop listing)
router.delete('/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    return res.status(200).json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
