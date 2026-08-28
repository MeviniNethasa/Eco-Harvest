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
      isActive: isActive !== undefined ? !!isActive : true,
      lowStockThreshold: lowStockThreshold !== undefined ? Number(lowStockThreshold) : 10,
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

// PUT /api/products/:id (Update a crop listing - price, isActive switch, stock threshold)
router.put('/:id', async (req, res) => {
  try {
    const {
      name,
      title,
      category,
      pricePerKg,
      pricePerUnit,
      unit,
      availableQuantity,
      availableQtyKg,
      lowStockThreshold,
      imageUrl,
      isActive,
    } = req.body;

    const updateData = {};
    if (name || title) {
      updateData.name = name || title;
      updateData.title = name || title;
    }
    if (category) updateData.category = category;
    if (pricePerUnit !== undefined) {
      updateData.pricePerUnit = Number(pricePerUnit);
      updateData.pricePerKg = Number(pricePerUnit);
    } else if (pricePerKg !== undefined) {
      updateData.pricePerKg = Number(pricePerKg);
      updateData.pricePerUnit = Number(pricePerKg);
    }
    if (unit) updateData.unit = unit;
    if (availableQtyKg !== undefined) {
      updateData.availableQtyKg = Number(availableQtyKg);
      updateData.availableQuantity = Number(availableQtyKg);
    } else if (availableQuantity !== undefined) {
      updateData.availableQuantity = Number(availableQuantity);
      updateData.availableQtyKg = Number(availableQuantity);
    }
    if (lowStockThreshold !== undefined) {
      updateData.lowStockThreshold = Number(lowStockThreshold);
    }
    if (imageUrl) updateData.imageUrl = imageUrl;
    if (isActive !== undefined) {
      updateData.isActive = !!isActive;
    }

    let product = null;
    if (req.params.id && req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      product = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
    }
    if (!product) {
      product = await Product.findOneAndUpdate(
        { $or: [{ _id: req.params.id }, { id: req.params.id }] },
        updateData,
        { new: true }
      );
    }

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    return res.status(200).json({ success: true, message: 'Product updated successfully', data: product });
  } catch (error) {
    console.error('Error updating product:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/products/:id (Delete a crop listing)
router.delete('/:id', async (req, res) => {
  try {
    let product = null;
    if (req.params.id && req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      product = await Product.findByIdAndDelete(req.params.id);
    }
    if (!product) {
      product = await Product.findOneAndDelete({ $or: [{ _id: req.params.id }, { id: req.params.id }] });
    }
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    return res.status(200).json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
