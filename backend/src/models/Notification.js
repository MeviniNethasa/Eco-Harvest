// backend/src/models/Notification.js
const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    recipientId: {
      type: String,
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['CUSTOMER', 'FARMER', 'ADMIN', 'ALL'],
      default: 'FARMER',
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      trim: true,
    },
    message: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ['ORDER', 'MESSAGE', 'SYSTEM', 'PAYMENT', 'STOCK', 'VERIFICATION', 'GENERAL'],
      default: 'GENERAL',
    },
    readStatus: {
      type: Boolean,
      default: false,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save middleware to keep body/message and readStatus/isRead synced
NotificationSchema.pre('save', function (next) {
  if (this.title && !this.body && this.message) this.body = this.message;
  if (this.title && !this.message && this.body) this.message = this.body;
  if (this.readStatus !== undefined && this.isRead === undefined) this.isRead = this.readStatus;
  if (this.isRead !== undefined && this.readStatus === undefined) this.readStatus = this.isRead;
  next();
});

module.exports = mongoose.model('Notification', NotificationSchema);
