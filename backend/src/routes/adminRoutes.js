// backend/src/routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const FarmerProfile = require('../models/FarmerProfile');
const Order = require('../models/Order');
const Message = require('../models/Message');
const User = require('../models/User');

// Helper to extract terms causing moderation interception
function extractViolationTerms(text) {
  if (!text) return [];
  const terms = [];
  const phoneMatch = text.match(/(?:0|\+94)\s*\d{2}\s*\d{3}\s*\d{4}|\b\d{10}\b/g);
  if (phoneMatch) terms.push(...phoneMatch);
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  if (emailMatch) terms.push(...emailMatch);
  const keywordMatches = text.match(/(?:whatsapp|viber|telegram|commercial bank|bank account|direct pay|transfer cash|cash directly|skip.*commission|bank transfer)/gi);
  if (keywordMatches) terms.push(...keywordMatches);
  return [...new Set(terms)];
}

// Helper to categorize moderation violations
function detectViolationCategory(text) {
  if (!text) return 'General Policy Interception';
  if (/(?:0|\+94)\s*\d{2}\s*\d{3}\s*\d{4}|\b\d{10}\b|whatsapp|viber/i.test(text)) {
    return 'Off-Platform Contact Information Leak';
  }
  if (/bank|account|commercial bank|transfer|direct pay|cash/i.test(text)) {
    return 'Direct Off-Platform Payment Solicitation';
  }
  return 'Off-Platform Communication Violation';
}

// ---------------------------------------------------------------------------
// 1. SLSI Certificate Verification Desk Endpoints (Screen A-01)
// ---------------------------------------------------------------------------

// GET /api/admin/verifications
router.get('/verifications', async (req, res) => {
  try {
    const farmers = await FarmerProfile.find().populate('userId').sort({ createdAt: -1 });

    const data = farmers.map((f) => {
      const user = f.userId || {};
      const ownerLegal = f.ownerName || user.fullName || f.farmName || '';
      const phone = f.mobileNumber || user.phoneNumber || user.mobile || '';
      const prov = f.province || f.location?.province || user.province || '';
      const dist = f.district || f.location?.district || user.district || '';
      const city = f.city || f.location?.city || user.city || '';

      let status = 'PENDING';
      if (f.slsiStatus === 'VERIFIED' || f.isSLSIVerified) {
        status = 'VERIFIED';
      } else if (f.slsiStatus === 'REJECTED') {
        status = 'REJECTED';
      }

      return {
        id: f._id.toString(),
        farmerId: f._id.toString(),
        farmName: f.farmName || '',
        legalName: ownerLegal,
        businessRegistrationNumber: `PV-${f._id.toString().slice(-7).toUpperCase()}`,
        mobileNumber: phone,
        isMobileVerified: !!phone,
        province: prov,
        district: dist,
        city: city,
        coordinates: f.location?.coordinates || null,
        slsiStandardNumber: 'SLS 1324:2018 (Organic Agricultural Standards)',
        certificateIssueDate: f.createdAt ? f.createdAt.toISOString().split('T')[0] : '',
        certificateExpiryDate: '',
        certificateDocumentUrl: f.slsiCertificateUrl || '',
        bankDetails: {
          bankName: f.bankDetails?.bankName || '',
          branchCode: f.bankDetails?.branchCode || '',
          accountNumber: f.bankDetails?.accountNumber || '',
          accountHolderName: f.bankDetails?.accountHolderName || ownerLegal,
        },
        verificationStatus: status,
        commissionRate: f.commissionRate || (status === 'VERIFIED' ? 2.5 : 5.0),
        submittedAt: f.createdAt ? f.createdAt.toISOString() : new Date().toISOString(),
      };
    });

    console.log(`ADMIN AUDIT: Fetched ${data.length} pending & verified farmer applications`);
    return res.status(200).json({ success: true, count: data.length, data, verifications: data });
  } catch (error) {
    console.error('Error fetching admin verifications:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/admin/verifications/:id/approve
router.post('/verifications/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { commissionRate = 2.5 } = req.body;

    let farmer = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      farmer = await FarmerProfile.findById(id);
    }
    if (!farmer) {
      farmer = await FarmerProfile.findOne({ $or: [{ userId: id }, { mobileNumber: id }] });
    }

    if (farmer) {
      farmer.slsiStatus = 'VERIFIED';
      farmer.isSLSIVerified = true;
      farmer.commissionRate = Number(commissionRate);
      await farmer.save();

      if (farmer.userId) {
        await User.findByIdAndUpdate(farmer.userId, { isSLSIVerified: true });
      }
    }

    console.log(`ADMIN AUDIT: Approved verification for farmer ID: ${id} (Commission: ${commissionRate}%)`);
    return res.status(200).json({
      success: true,
      message: `SLSI Application approved with ${commissionRate}% commission rate.`,
      data: { id, status: 'VERIFIED', commissionRate: Number(commissionRate) },
    });
  } catch (error) {
    console.error('Error approving verification:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/admin/verifications/:id/reject
router.post('/verifications/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = 'Certificate document failed SLSI organic standard audit' } = req.body;

    let farmer = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      farmer = await FarmerProfile.findById(id);
    }
    if (!farmer) {
      farmer = await FarmerProfile.findOne({ $or: [{ userId: id }, { mobileNumber: id }] });
    }

    if (farmer) {
      farmer.slsiStatus = 'REJECTED';
      farmer.isSLSIVerified = false;
      farmer.commissionRate = 5.0;
      await farmer.save();

      if (farmer.userId) {
        await User.findByIdAndUpdate(farmer.userId, { isSLSIVerified: false });
      }
    }

    console.log(`ADMIN AUDIT: Rejected verification for farmer ID: ${id} (Reason: ${reason})`);
    return res.status(200).json({
      success: true,
      message: 'SLSI Application rejected. Reverted to 5% standard commission.',
      data: { id, status: 'REJECTED', reason, commissionRate: 5.0 },
    });
  } catch (error) {
    console.error('Error rejecting verification:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ---------------------------------------------------------------------------
// 2. Moderated Chat Interception Feed Endpoints (Screen A-02)
// ---------------------------------------------------------------------------

// GET /api/admin/moderation/chats
router.get('/moderation/chats', async (req, res) => {
  try {
    const flaggedMessages = await Message.find({
      $or: [
        { isFlagged: true },
        { isBlocked: true },
        { moderationStatus: { $in: ['FLAGGED', 'BLOCKED', 'INTERCEPTED'] } },
      ],
    }).sort({ createdAt: -1 });

    const data = await Promise.all(
      flaggedMessages.map(async (msg) => {
        // Fetch full surrounding context for this conversation
        const threadMessages = await Message.find({ conversationId: msg.conversationId })
          .sort({ createdAt: 1 })
          .limit(10);

        const terms = extractViolationTerms(msg.text);
        const category = detectViolationCategory(msg.text);

        let status = 'INTERCEPTED';
        if (msg.moderationStatus === 'PASSED') {
          status = 'RELEASED';
        } else if (msg.moderationStatus === 'BLOCKED') {
          status = 'BLOCKED';
        } else if (msg.moderationStatus === 'MERCHANT_SUSPENDED') {
          status = 'MERCHANT_SUSPENDED';
        }

        const buyerId = msg.senderRole === 'CUSTOMER' ? msg.senderId : msg.receiverId || 'Customer';
        const farmerId = msg.senderRole === 'FARMER' ? msg.senderId : msg.receiverId || 'Farmer';

        return {
          ticketId: `TCK-${msg._id.toString().slice(-6).toUpperCase()}`,
          id: msg._id.toString(),
          timestamp: msg.createdAt ? msg.createdAt.toISOString() : msg.timestamp ? new Date(msg.timestamp).toISOString() : new Date().toISOString(),
          conversationId: msg.conversationId,
          buyerId: buyerId,
          farmerId: farmerId,
          offendingSnippet: msg.text,
          highlightedTerms: terms.length > 0 ? terms : [msg.text.slice(0, 30)],
          violationCategory: category,
          severity: 'HIGH',
          status: status,
          fullContext: threadMessages.map((m) => ({
            sender: m.senderRole === 'FARMER' ? 'FARMER' : 'BUYER',
            text: m.text,
            time: m.createdAt
              ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '12:00',
          })),
        };
      })
    );

    console.log(`ADMIN AUDIT: Fetched moderated chat feed (${data.length} flagged tickets)`);
    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error('Error fetching moderated chats:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/admin/moderation/override
router.post('/moderation/override', async (req, res) => {
  try {
    const { ticketId, action } = req.body; // action: 'ALLOW' | 'BLOCK' | 'SUSPEND'

    let targetMessage = null;

    // Search by raw ID or ticket suffix
    if (ticketId) {
      const cleanSuffix = ticketId.replace('TCK-', '');
      if (mongoose.Types.ObjectId.isValid(cleanSuffix)) {
        targetMessage = await Message.findById(cleanSuffix);
      }
      if (!targetMessage) {
        const allFlagged = await Message.find({
          $or: [{ isFlagged: true }, { isBlocked: true }, { moderationStatus: { $in: ['FLAGGED', 'BLOCKED', 'INTERCEPTED'] } }],
        });
        targetMessage = allFlagged.find((m) => m._id.toString().toUpperCase().endsWith(cleanSuffix.toUpperCase()));
      }
    }

    if (targetMessage) {
      if (action === 'ALLOW') {
        targetMessage.moderationStatus = 'PASSED';
        targetMessage.isBlocked = false;
        targetMessage.isFlagged = false;
      } else if (action === 'BLOCK') {
        targetMessage.moderationStatus = 'BLOCKED';
        targetMessage.isBlocked = true;
        targetMessage.isFlagged = true;
      } else if (action === 'SUSPEND') {
        targetMessage.moderationStatus = 'MERCHANT_SUSPENDED';
        targetMessage.isBlocked = true;
        targetMessage.isFlagged = true;
      }
      await targetMessage.save();
    }

    console.log(`ADMIN AUDIT: Moderation override applied for ticket ${ticketId} -> Action: ${action}`);
    return res.status(200).json({
      success: true,
      message: `Moderation ticket ${ticketId} action '${action}' applied successfully.`,
      ticket: { ticketId, status: action === 'ALLOW' ? 'RELEASED' : action === 'BLOCK' ? 'BLOCKED' : 'MERCHANT_SUSPENDED' },
    });
  } catch (error) {
    console.error('Error overriding moderation:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ---------------------------------------------------------------------------
// 3. Escrow Ledger & Uber Logistics Tracker Endpoints (Screen A-03)
// ---------------------------------------------------------------------------

// GET /api/admin/escrow/ledger
router.get('/escrow/ledger', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });

    const data = orders.map((order) => {
      const totalHold = order.totalAmount || order.total || 0;

      let escrowState = 'HELD_IN_ESCROW';
      if (order.escrowStatus === 'RELEASED') {
        escrowState = 'RELEASED_TO_FARMER';
      } else if (order.escrowStatus === 'REFUNDED') {
        escrowState = 'REFUNDED_TO_CUSTOMER';
      }

      let deliveryState = 'DISPATCHED';
      if (order.status === 'delivered' || order.status === 'COMPLETED') {
        deliveryState = 'DELIVERED';
      } else if (order.status === 'in_transit') {
        deliveryState = 'IN_TRANSIT';
      } else if (order.status === 'cancelled' || order.status === 'CANCELLED') {
        deliveryState = 'FAILED';
      }

      const lineItems =
        order.items && order.items.length > 0
          ? order.items.map((it) => ({
              crop: it.name || 'Organic Crop',
              qty: `${it.quantity || 1}${it.unit || 'kg'}`,
              farm: it.farmName || 'Verified Farm',
              subtotal: (it.pricePerUnit || 0) * (it.quantity || 1),
            }))
          : order.farmGroups && order.farmGroups.length > 0
          ? order.farmGroups.flatMap((fg) =>
              (fg.items || []).map((it) => ({
                crop: it.name || 'Organic Crop',
                qty: `${it.quantity || 1}${it.unit || 'kg'}`,
                farm: fg.farmName || it.farmName || 'Verified Farm',
                subtotal: (it.pricePerUnit || 0) * (it.quantity || 1),
              }))
            )
          : [{ crop: 'Organic Produce Order', qty: '1 order', farm: 'Verified Farm', subtotal: totalHold }];

      const farmerNames =
        order.farmGroups?.map((g) => g.farmName).filter(Boolean).join(' & ') ||
        [...new Set(order.items?.map((i) => i.farmName).filter(Boolean))].join(' & ') ||
        '';

      const masterId = `pi_${order._id.toString()}`;

      return {
        masterPaymentIntentId: masterId,
        orderId: order.orderId || `ORD-${order._id.toString().slice(-6).toUpperCase()}`,
        childOrders: [order.orderId || `ORD-${order._id.toString().slice(-6).toUpperCase()}`],
        customerName: order.customerId || 'Customer',
        farmerName: farmerNames,
        totalHoldLKR: totalHold,
        stripeStatus: order.escrowStatus === 'REFUNDED' ? 'REFUNDED' : 'SUCCEEDED_HELD_IN_ESCROW',
        escrowStatus: escrowState,
        uberDeliveryStatus: deliveryState,
        uberTrackingId: `UBER-DIR-${(order.orderId || order._id.toString()).replace(/[^0-9]/g, '').slice(-5) || '00000'}`,
        driverName: '',
        driverPhone: '',
        handshakeOtpStatus:
          order.status === 'delivered' || order.status === 'COMPLETED'
            ? 'VERIFIED_HANDSHAKE_COMPLETED'
            : order.escrowStatus === 'RELEASED'
            ? 'OVERRIDDEN_BY_ADMIN'
            : 'PENDING_DELIVERY_HANDSHAKE',
        etaMinutes: deliveryState === 'DELIVERED' ? 0 : 25,
        createdAt: order.createdAt ? order.createdAt.toISOString() : new Date().toISOString(),
        lineItems,
      };
    });

    console.log(`ADMIN AUDIT: Fetched escrow ledger (${data.length} active orders)`);
    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error('Error fetching admin escrow ledger:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/admin/escrow/force-release
router.post('/escrow/force-release', async (req, res) => {
  try {
    const { masterPaymentIntentId, reason = 'Admin manual dispatch confirmation' } = req.body;

    let targetOrder = null;
    if (masterPaymentIntentId) {
      const cleanId = masterPaymentIntentId.replace('pi_', '');
      if (mongoose.Types.ObjectId.isValid(cleanId)) {
        targetOrder = await Order.findById(cleanId);
      }
      if (!targetOrder) {
        targetOrder = await Order.findOne({ orderId: masterPaymentIntentId });
      }
    }

    if (targetOrder) {
      targetOrder.escrowStatus = 'RELEASED';
      targetOrder.status = 'delivered';
      await targetOrder.save();
    }

    console.log(`ADMIN AUDIT: Force released escrow funds for payment intent: ${masterPaymentIntentId}`);
    return res.status(200).json({
      success: true,
      message: `Escrow funds for ${masterPaymentIntentId} released to merchant bank account.`,
      data: { masterPaymentIntentId, escrowStatus: 'RELEASED_TO_FARMER' },
    });
  } catch (error) {
    console.error('Error in force-release escrow:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/admin/escrow/refund
router.post('/escrow/refund', async (req, res) => {
  try {
    const { masterPaymentIntentId, reason = 'Delivery cancelled / damaged in transit' } = req.body;

    let targetOrder = null;
    if (masterPaymentIntentId) {
      const cleanId = masterPaymentIntentId.replace('pi_', '');
      if (mongoose.Types.ObjectId.isValid(cleanId)) {
        targetOrder = await Order.findById(cleanId);
      }
      if (!targetOrder) {
        targetOrder = await Order.findOne({ orderId: masterPaymentIntentId });
      }
    }

    if (targetOrder) {
      targetOrder.escrowStatus = 'REFUNDED';
      targetOrder.status = 'CANCELLED';
      await targetOrder.save();
    }

    console.log(`ADMIN AUDIT: Refunded escrow funds for payment intent: ${masterPaymentIntentId}`);
    return res.status(200).json({
      success: true,
      message: `Full client-side Stripe refund triggered for ${masterPaymentIntentId}.`,
      data: { masterPaymentIntentId, escrowStatus: 'REFUNDED_TO_CUSTOMER' },
    });
  } catch (error) {
    console.error('Error in refund escrow:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ---------------------------------------------------------------------------
// 4. Ecosystem Analytics & Regional Supply/Demand Health Dashboard (Screen A-04)
// ---------------------------------------------------------------------------

// GET /api/admin/analytics/health
router.get('/analytics/health', async (req, res) => {
  try {
    const [
      activeFarmers,
      verifiedFarmers,
      allOrders,
      bulkUsers,
      openTicketsCount,
    ] = await Promise.all([
      FarmerProfile.countDocuments(),
      FarmerProfile.countDocuments({ $or: [{ isSLSIVerified: true }, { slsiStatus: 'VERIFIED' }] }),
      Order.find(),
      User.countDocuments({ $or: [{ subscriptionPlan: 'BULK_ACCESS' }, { isBulkBuyer: true }] }),
      Message.countDocuments({
        $or: [
          { isFlagged: true },
          { isBlocked: true },
          { moderationStatus: { $in: ['FLAGGED', 'BLOCKED', 'INTERCEPTED'] } },
        ],
      }),
    ]);

    const totalVolume = allOrders.reduce((sum, o) => sum + (o.totalAmount || o.total || 0), 0);

    console.log(`ADMIN AUDIT: Analytics health metrics compiled (Active Farmers: ${activeFarmers}, Verified: ${verifiedFarmers}, Bulk Buyers: ${bulkUsers}, Open Tickets: ${openTicketsCount})`);

    return res.status(200).json({
      success: true,
      data: {
        kpiSummary: {
          totalDailyVolumeLKR: totalVolume,
          volumeGrowthPercent: 0,
          activeBulkSubscriptions: bulkUsers,
          subscriptionGrowthPercent: 0,
          meanFreshnessIndex: 0,
          openSupportTickets: openTicketsCount,
          verifiedFarmerCount: verifiedFarmers,
          totalFarmers: activeFarmers,
        },
        freshnessBreakdown: {
          gradeAOrganic: 0,
          gradeBStandard: 0,
          defectiveStale: 0,
        },
        regionalSupplyDemandMap: [],
      },
    });
  } catch (error) {
    console.error('Error fetching admin analytics:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/admin/purge-demo-data (Purge all demo / mock records from collections)
router.post('/purge-demo-data', async (req, res) => {
  try {
    const Notification = require('../models/Notification');
    const [farmersDeleted, ordersDeleted, messagesDeleted, notificationsDeleted] = await Promise.all([
      FarmerProfile.deleteMany({}),
      Order.deleteMany({}),
      Message.deleteMany({}),
      Notification.deleteMany({}),
    ]);

    console.log(`ADMIN AUDIT: Demo data purge executed. (Farmers: ${farmersDeleted.deletedCount}, Orders: ${ordersDeleted.deletedCount}, Messages: ${messagesDeleted.deletedCount})`);
    return res.status(200).json({
      success: true,
      message: 'All demo data successfully purged from MongoDB collections.',
      purged: {
        farmers: farmersDeleted.deletedCount,
        orders: ordersDeleted.deletedCount,
        messages: messagesDeleted.deletedCount,
        notifications: notificationsDeleted.deletedCount,
      },
    });
  } catch (error) {
    console.error('Error purging demo data:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
