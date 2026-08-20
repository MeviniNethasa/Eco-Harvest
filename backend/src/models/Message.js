// backend/src/models/Message.js
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    senderId: {
      type: String,
      required: true,
    },
    receiverId: {
      type: String,
      default: '',
    },
    orderId: {
      type: String,
      default: '',
    },
    senderRole: {
      type: String,
      enum: ['CUSTOMER', 'FARMER', 'ADMIN', 'SYSTEM'],
      default: 'CUSTOMER',
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    moderationStatus: {
      type: String,
      enum: ['PASSED', 'FLAGGED', 'BLOCKED'],
      default: 'PASSED',
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Message', MessageSchema);
