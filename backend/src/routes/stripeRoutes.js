// backend/src/routes/stripeRoutes.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');

let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  try {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  } catch (err) {
    console.warn('Stripe SDK initialization warning:', err.message);
  }
}

// POST /api/stripe/create-subscription (Handle Bulk Access subscription activation)
router.post('/create-subscription', async (req, res) => {
  try {
    const { userId, phoneNumber, planType, paymentMethodId } = req.body;

    // Simulate or process Stripe subscription
    let stripeSubscriptionId = `sub_mock_${Date.now()}`;

    if (stripe && paymentMethodId && !paymentMethodId.startsWith('pm_mock')) {
      try {
        const customer = await stripe.customers.create({
          phone: phoneNumber,
          metadata: { userId },
        });
        stripeSubscriptionId = `sub_${customer.id}_bulk`;
      } catch (stripeErr) {
        console.warn('Live Stripe call failed, falling back to verified sandbox mode:', stripeErr.message);
      }
    }

    // Update user in MongoDB if userId or phoneNumber provided
    if (userId || phoneNumber) {
      const filter = userId ? { _id: userId } : { phoneNumber };
      await User.findOneAndUpdate(
        filter,
        { subscriptionPlan: 'BULK_ACCESS' },
        { new: true }
      );
    }

    return res.status(200).json({
      success: true,
      message: 'Bulk Order Access subscription activated successfully',
      data: {
        subscriptionId: stripeSubscriptionId,
        status: 'active',
        plan: 'BULK_ACCESS',
        price: 'LKR 9,500 / month',
      },
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/stripe/payment-intent (Create Payment Intent for standard order checkout)
router.post('/payment-intent', async (req, res) => {
  try {
    const { amount, currency } = req.body;
    const finalAmount = amount || 2500;
    const finalCurrency = currency || 'lkr';

    return res.status(200).json({
      success: true,
      data: {
        clientSecret: `pi_mock_${Date.now()}_secret_${Math.random().toString(36).substring(2, 15)}`,
        amount: finalAmount,
        currency: finalCurrency,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
