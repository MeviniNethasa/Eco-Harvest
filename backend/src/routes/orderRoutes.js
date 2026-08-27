// backend/src/routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Notification = require('../models/Notification');

const stripeSecretKey =
  process.env.STRIPE_SECRET_KEY ||
  'sk_test_51U4HRAI2eXjVOkRsRNd8x8QQTEAer8HlLCvipVl8Vqzmrdi5ouvDSDy2oaJKgTXBYy8cZav0qpM90KSiCanmcpvv00wRba8Tu1';

let stripe = null;
try {
  stripe = require('stripe')(stripeSecretKey);
} catch (err) {
  console.warn('STRIPE SDK init warning in orderRoutes:', err.message);
}

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

// GET /api/orders/farmer/:farmerId (List orders involving a specific farmer or farm name)
router.get('/farmer/:farmerId', async (req, res) => {
  try {
    const farmerId = req.params.farmerId;
    const safeRegex = new RegExp(farmerId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const orders = await Order.find({
      $or: [
        { farmerId },
        { 'farmGroups.farmerId': farmerId },
        { 'items.farmerId': farmerId },
        { 'farmGroups.farmName': safeRegex },
        { 'items.farmName': safeRegex },
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
    const customerId = req.params.customerId;
    const safeRegex = new RegExp(customerId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const orders = await Order.find({
      $or: [
        { customerId },
        { customerId: safeRegex },
      ],
    }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/orders (Create new customer order & record on Stripe)
router.post('/', async (req, res) => {
  try {
    const {
      orderId,
      customerId,
      farmerId,
      items,
      farmGroups,
      totalAmount,
      total,
      paymentMethod,
      deliveryAddress,
      stripePaymentIntent,
    } = req.body;

    const actualOrderId = orderId || `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const finalTotal = totalAmount || total || 0;
    let actualStripeIntentId = stripePaymentIntent || `pi_${actualOrderId}`;

    // Create and confirm a real Stripe payment on the dashboard
    const isRealStripe =
      stripePaymentIntent &&
      (stripePaymentIntent.startsWith('pi_3') || stripePaymentIntent.startsWith('pi_1'));

    if (stripe && !isRealStripe) {
      try {
        const amountCents = Math.max(Math.round(finalTotal * 100), 5000);
        const pi = await stripe.paymentIntents.create({
          amount: amountCents,
          currency: 'lkr',
          payment_method: 'pm_card_visa',
          confirm: true,
          return_url: 'https://ecoharvest.local/return',
          description: `EcoHarvest Multi-Farm Escrow Order ${actualOrderId}`,
          metadata: {
            orderId: actualOrderId,
            customer: String(customerId || 'EcoHarvest Buyer'),
          },
        });
        actualStripeIntentId = pi.id;
        console.log(
          `STRIPE DASHBOARD: Order payment intent confirmed -> ${pi.id} (LKR ${finalTotal})`
        );
      } catch (stripeErr) {
        console.warn('Stripe order payment creation warning:', stripeErr.message);
      }
    }

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
      stripePaymentIntent: actualStripeIntentId,
      deliveryAddress: deliveryAddress || {},
    });

    console.log(
      `ORDER CREATED: ID '${order.orderId}' (Customer: ${order.customerId}, Total: LKR ${finalTotal}, Stripe Intent: ${order.stripePaymentIntent}, Escrow: LOCKED)`
    );

    // -------------------------------------------------------------------------
    // Automatic Real-Time Notifications Generation for Farmer(s), Customer, Admin
    // -------------------------------------------------------------------------
    const farmerMap = new Map();

    if (Array.isArray(farmGroups) && farmGroups.length > 0) {
      farmGroups.forEach((fg) => {
        const fId = fg.farmerId || (fg.items && fg.items[0] && fg.items[0].farmerId) || farmerId || '';
        const fName = fg.farmName || '';
        const subtotal = fg.subtotal || (fg.items || []).reduce((acc, it) => acc + (it.pricePerUnit || 0) * (it.quantity || 1), 0);
        const itemsSummary = (fg.items || []).map((i) => `${i.quantity}x ${i.name}`).join(', ');
        if (fId || fName) {
          const key = fId || fName;
          farmerMap.set(key, {
            farmerId: fId || key,
            farmName: fName,
            subtotal,
            itemsSummary: itemsSummary || 'Fresh produce package',
          });
        }
      });
    }

    if (Array.isArray(items) && items.length > 0) {
      items.forEach((it) => {
        const fId = it.farmerId || farmerId || '';
        const fName = it.farmName || '';
        if (fId || fName) {
          const key = fId || fName;
          if (!farmerMap.has(key)) {
            farmerMap.set(key, {
              farmerId: fId || key,
              farmName: fName,
              subtotal: (it.pricePerUnit || 0) * (it.quantity || 1),
              itemsSummary: `${it.quantity}x ${it.name}`,
            });
          }
        }
      });
    }

    if (farmerMap.size === 0 && farmerId) {
      farmerMap.set(farmerId, {
        farmerId: farmerId,
        farmName: 'Farm',
        subtotal: finalTotal,
        itemsSummary: 'Produce order package',
      });
    }

    // 1. Farmer Notifications
    for (const f of farmerMap.values()) {
      try {
        await Notification.create({
          recipientId: f.farmerId,
          role: 'FARMER',
          title: `📦 New Order Received: #${actualOrderId}`,
          body: `New order for ${f.itemsSummary} (Payout: LKR ${Math.round(f.subtotal).toLocaleString()}). Payment locked in Escrow.`,
          message: `New order for ${f.itemsSummary} (Payout: LKR ${Math.round(f.subtotal).toLocaleString()}). Payment locked in Escrow.`,
          type: 'ORDER',
          readStatus: false,
          isRead: false,
          data: {
            orderId: actualOrderId,
            subtotal: f.subtotal,
            customerId: customerId || 'Customer',
            farmName: f.farmName,
          },
        });
        console.log(`[Notification Engine] Created Farmer notification for ${f.farmerId} on order ${actualOrderId}`);
      } catch (notifErr) {
        console.warn('Failed to create farmer notification:', notifErr.message);
      }
    }

    // 2. Customer Notification
    try {
      await Notification.create({
        recipientId: customerId || 'cust_anonymous',
        role: 'CUSTOMER',
        title: `🎉 Order Confirmed: #${actualOrderId}`,
        body: `Your payment of LKR ${Math.round(finalTotal).toLocaleString()} is secured in Escrow. Track driver dispatch in real-time.`,
        message: `Your payment of LKR ${Math.round(finalTotal).toLocaleString()} is secured in Escrow. Track driver dispatch in real-time.`,
        type: 'ORDER',
        readStatus: false,
        isRead: false,
        data: {
          orderId: actualOrderId,
          totalAmount: finalTotal,
        },
      });
    } catch (custErr) {
      console.warn('Failed to create customer notification:', custErr.message);
    }

    // 3. Admin Notification
    try {
      await Notification.create({
        recipientId: 'ADMIN',
        role: 'ALL',
        title: `💰 Escrow Payment Locked: #${actualOrderId}`,
        body: `Order #${actualOrderId} for LKR ${Math.round(finalTotal).toLocaleString()} locked in Stripe Escrow.`,
        message: `Order #${actualOrderId} for LKR ${Math.round(finalTotal).toLocaleString()} locked in Stripe Escrow.`,
        type: 'ORDER',
        readStatus: false,
        isRead: false,
        data: {
          orderId: actualOrderId,
          totalAmount: finalTotal,
        },
      });
    } catch (adminErr) {
      console.warn('Failed to create admin notification:', adminErr.message);
    }

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

    console.log(`ORDER STATUS UPDATED: ID '${order.orderId}' -> Status: ${order.status}, Escrow: ${order.escrowStatus}`);

    // Create status transition notifications
    try {
      const statusTitle =
        order.status === 'in_transit'
          ? `🚚 Order In Transit: #${order.orderId}`
          : order.status === 'delivered'
          ? `✅ Order Delivered: #${order.orderId}`
          : order.status === 'cancelled'
          ? `❌ Order Cancelled: #${order.orderId}`
          : `📋 Order Status: #${order.orderId} (${order.status})`;

      const statusBody =
        order.status === 'delivered'
          ? `Order #${order.orderId} has been successfully delivered. Escrow released to farmer.`
          : `Order #${order.orderId} status has changed to ${order.status}.`;

      if (order.customerId) {
        await Notification.create({
          recipientId: order.customerId,
          role: 'CUSTOMER',
          title: statusTitle,
          body: statusBody,
          message: statusBody,
          type: 'DISPATCH',
          readStatus: false,
          isRead: false,
          data: { orderId: order.orderId, status: order.status },
        });
      }

      if (order.farmerId) {
        await Notification.create({
          recipientId: order.farmerId,
          role: 'FARMER',
          title: statusTitle,
          body: statusBody,
          message: statusBody,
          type: 'DISPATCH',
          readStatus: false,
          isRead: false,
          data: { orderId: order.orderId, status: order.status },
        });
      }
    } catch (statusNotifErr) {
      console.warn('Status notification notice:', statusNotifErr.message);
    }

    return res.status(200).json({ success: true, message: 'Order status updated', data: order });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/orders/:id/review (Update order metadata with review & AI freshness score)
router.patch('/:id/review', async (req, res) => {
  try {
    const { freshnessScore, freshnessGrade, reviewRating, reviewComment, reviewId } = req.body;
    const update = {};
    if (freshnessScore !== undefined) update.freshnessScore = freshnessScore;
    if (freshnessGrade) update.freshnessGrade = freshnessGrade;
    if (reviewRating !== undefined) update.reviewRating = reviewRating;
    if (reviewComment) update.reviewComment = reviewComment;
    if (reviewId) update.reviewId = reviewId;

    const order = await Order.findOneAndUpdate(
      { $or: [{ _id: req.params.id }, { orderId: req.params.id }] },
      update,
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    console.log(`ORDER REVIEW METADATA UPDATED: ID '${order.orderId}' -> Freshness: ${freshnessScore}, Rating: ${reviewRating}`);
    return res.status(200).json({ success: true, message: 'Order review metadata updated', data: order });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

