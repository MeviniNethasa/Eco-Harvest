// backend/src/models/Order.js
const mongoose = require('mongoose');

const OrderItemSchema = new mongoose.Schema(
  {
    cropId: { type: String, required: true },
    name: { type: String, required: true },
    pricePerUnit: { type: Number, required: true },
    unit: { type: String, default: '1kg' },
    quantity: { type: Number, required: true },
    imageUrl: { type: String, default: '' },
    farmName: { type: String, default: '' },
    farmerId: { type: String, default: '' },
    province: { type: String, default: '' },
    district: { type: String, default: '' },
    city: { type: String, default: '' },
  },
  { _id: false }
);

const FarmGroupSchema = new mongoose.Schema(
  {
    farmName: { type: String, required: true },
    items: [OrderItemSchema],
    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, default: 0 },
    farmerId: { type: String, default: '' },
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
    },
    customerId: {
      type: String,
      required: true,
    },
    farmerId: {
      type: String,
      default: '',
    },
    items: [OrderItemSchema],
    farmGroups: [FarmGroupSchema],
    totalAmount: {
      type: Number,
      required: true,
    },
    total: {
      type: Number,
    },
    status: {
      type: String,
      enum: ['PENDING', 'placed', 'CONFIRMED', 'confirmed', 'ESCROW_LOCKED', 'in_transit', 'COMPLETED', 'delivered', 'CANCELLED', 'cancelled'],
      default: 'placed',
    },
    escrowStatus: {
      type: String,
      enum: ['PENDING', 'LOCKED', 'RELEASED', 'REFUNDED'],
      default: 'LOCKED',
    },
    paymentMethod: {
      type: String,
      default: 'CARD',
    },
    deliveryAddress: {
      street: { type: String, default: '' },
      city: { type: String, default: '' },
      district: { type: String, default: '' },
      postalCode: { type: String, default: '' },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Order', OrderSchema);
