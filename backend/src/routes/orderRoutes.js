// backend/src/routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const Order = require('../models/Order');

// GET /api/orders (List all orders)
router.get('/', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/orders/farmer/:farmerId (List orders involving a specific farmer)
router.get('/farmer/:farmerId', async (req, res) => {
  try {
    const farmerId = req.params.farmerId;
    const orders = await Order.find({
      $or: [
        { farmerId },
        { 'farmGroups.farmerId': farmerId },
        { 'items.farmerId': farmerId },
      ],
    }).sort({ createdAt: -1 });

    return res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/orders/customer/:customerId (List orders placed by a customer)
router.get('/customer/:customerId', async (req, res) => {
  try {
    const orders = await Order.find({ customerId: req.params.customerId }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/orders (Create new customer order)
router.post('/', async (req, res) => {
  try {
    const { orderId, customerId, farmerId, items, farmGroups, totalAmount, total, paymentMethod, deliveryAddress } =
      req.body;

    const actualOrderId = orderId || `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const finalTotal = totalAmount || total || 0;

    const order = await Order.create({
      orderId: actualOrderId,
      customerId: customerId || 'cust_anonymous',
      farmerId: farmerId || '',
      items: items || [],
      farmGroups: farmGroups || [],
      totalAmount: finalTotal,
      total: finalTotal,
      status: 'placed',
      escrowStatus: 'LOCKED',
      paymentMethod: paymentMethod || 'CARD',
      deliveryAddress: deliveryAddress || {},
    });

    return res.status(201).json({ success: true, message: 'Order created', data: order });
  } catch (error) {
    console.error('Error creating order:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/orders/:id/status (Update order lifecycle status)
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, escrowStatus } = req.body;
    const update = {};
    if (status) update.status = status;
    if (escrowStatus) update.escrowStatus = escrowStatus;

    const order = await Order.findOneAndUpdate(
      { $or: [{ _id: req.params.id }, { orderId: req.params.id }] },
      update,
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    return res.status(200).json({ success: true, message: 'Order status updated', data: order });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
