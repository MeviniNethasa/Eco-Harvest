// backend/src/routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');

// GET /api/notifications/:userId (Get all notifications for a user/role)
router.get('/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const { role } = req.query;

    const conditions = [
      { recipientId: userId },
      { recipientId: 'ALL' },
      { role: 'ALL' },
    ];
    if (role) {
      conditions.push({ role });
      if (role === 'FARMER') conditions.push({ recipientId: 'ALL_FARMERS' });
      if (role === 'CUSTOMER') conditions.push({ recipientId: 'ALL_CUSTOMERS' });
    }

    const notifications = await Notification.find({ $or: conditions }).sort({ createdAt: -1 });
    const unreadCount = notifications.filter((n) => !n.isRead && !n.readStatus).length;

    return res.status(200).json({
      success: true,
      count: notifications.length,
      unreadCount,
      data: notifications,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/notifications (Create a new notification alert)
router.post('/', async (req, res) => {
  try {
    const { recipientId, role, title, body, message, type, data } = req.body;

    if (!recipientId || !title) {
      return res.status(400).json({
        success: false,
        message: 'recipientId and title are required',
      });
    }

    const content = body || message || '';

    const notification = await Notification.create({
      recipientId,
      role: role || 'FARMER',
      title,
      body: content,
      message: content,
      type: type || 'GENERAL',
      readStatus: false,
      isRead: false,
      data: data || {},
    });

    return res.status(201).json({
      success: true,
      message: 'Notification created',
      data: notification,
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/notifications/:id/read (Mark a single notification as read)
router.patch('/:id/read', async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { readStatus: true, isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: notification,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/notifications/read-all/:userId (Mark all notifications for a user as read)
router.patch('/read-all/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const { role } = req.body;

    const filter = {
      $or: [{ recipientId: userId }, { role: 'ALL' }],
    };
    if (role) {
      filter.$or.push({ role });
    }

    await Notification.updateMany(filter, { readStatus: true, isRead: true });

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
