// backend/src/models/HelpTicket.js
const mongoose = require('mongoose');

const HelpMessageSchema = new mongoose.Schema(
  {
    senderRole: {
      type: String,
      enum: ['CUSTOMER', 'FARMER', 'ADMIN', 'SYSTEM'],
      required: true,
      default: 'CUSTOMER',
    },
    senderId: {
      type: String,
      default: '',
    },
    senderName: {
      type: String,
      required: true,
      default: 'User',
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const HelpTicketSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    userName: {
      type: String,
      required: true,
    },
    userRole: {
      type: String,
      enum: ['CUSTOMER', 'FARMER'],
      required: true,
      default: 'CUSTOMER',
    },
    userPhone: {
      type: String,
      default: '',
    },
    orderId: {
      type: String,
      default: '',
    },
    category: {
      type: String,
      enum: [
        'ORDER_DELIVERY',
        'PAYMENT_ESCROW',
        'CROP_QUALITY',
        'SLSI_VERIFICATION',
        'ACCOUNT_SETTINGS',
        'COMMISSION_PAYOUT',
        'APP_FEEDBACK',
        'OTHER',
      ],
      default: 'OTHER',
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM',
    },
    status: {
      type: String,
      enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
      default: 'OPEN',
      index: true,
    },
    messages: [HelpMessageSchema],
    resolutionNotes: {
      type: String,
      default: '',
    },
    resolvedAt: {
      type: Date,
    },
    assignedAdmin: {
      type: String,
      default: 'Admin Support Team',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('HelpTicket', HelpTicketSchema);
