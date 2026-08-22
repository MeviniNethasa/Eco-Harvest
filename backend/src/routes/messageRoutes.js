// backend/src/routes/messageRoutes.js
const express = require('express');
const router = express.Router();
const Message = require('../models/Message');

// Filter helper for phone numbers / emails / direct off-platform keywords to detect violations
function checkOffPlatformViolation(text) {
  const phonePattern = /(?:0|\+94)\s*\d{2}\s*\d{3}\s*\d{4}|\b\d{10}\b/;
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const offPlatformKeywords = /(?:whatsapp|viber|telegram|bank account|direct pay|transfer cash|cash directly|skip.*commission|commercial bank|bank transfer)/i;
  return phonePattern.test(text) || emailPattern.test(text) || offPlatformKeywords.test(text);
}

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

    const hasViolation = checkOffPlatformViolation(text);

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

    return res.status(201).json({
      success: true,
      message: hasViolation ? 'Message blocked by moderation filter' : 'Message sent',
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
