// backend/src/routes/messageRoutes.js
const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const { moderateContent } = require('./aiRoutes');

// GET /api/messages/:conversationId (Get all messages for a thread)
router.get('/:conversationId', async (req, res) => {
  try {
    const messages = await Message.find({ conversationId: req.params.conversationId }).sort({
      createdAt: 1,
    });
    return res.status(200).json({ success: true, count: messages.length, data: messages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/messages (Send a message with moderation check)
router.post('/', async (req, res) => {
  try {
    const { conversationId, senderId, receiverId, orderId, senderRole, text } = req.body;

    if (!conversationId || !senderId || !text) {
      return res.status(400).json({
        success: false,
        message: 'conversationId, senderId, and text are required',
      });
    }

    const modResult = moderateContent ? await moderateContent(text, 'chat') : { allowed: true };
    const hasViolation = !modResult.allowed;

    const message = await Message.create({
      conversationId,
      senderId,
      receiverId: receiverId || '',
      orderId: orderId || '',
      senderRole: senderRole || 'CUSTOMER',
      text,
      isBlocked: hasViolation,
      isFlagged: hasViolation,
      moderationStatus: hasViolation ? 'BLOCKED' : 'PASSED',
      timestamp: new Date(),
    });

    if (hasViolation) {
      console.log(`MODERATION ALERT: Flagged message detected from '${senderId}' (Conversation: ${conversationId}) -> [${modResult.category}] Offending text: "${text}" (${modResult.reason})`);
    } else {
      console.log(`MESSAGE PROCESSED [PASSED]: From '${senderId}' (Conversation: ${conversationId})`);
    }

    return res.status(201).json({
      success: true,
      allowed: !hasViolation,
      category: modResult.category || 'NONE',
      reason: modResult.reason || '',
      message: hasViolation ? (modResult.reason || 'Message blocked by moderation filter') : 'Message sent',
      data: message,
    });
  } catch (error) {
    console.error('Error sending message:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/messages/threads/:userId (Get active conversations for a user)
router.get('/threads/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const conversations = await Message.distinct('conversationId', {
      $or: [{ senderId: userId }, { receiverId: userId }],
    });

    return res.status(200).json({ success: true, data: conversations });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
