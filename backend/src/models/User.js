// backend/src/models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      unique: true,
    },
    password: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: ['CUSTOMER', 'FARMER', 'ADMIN'],
      default: 'CUSTOMER',
    },
    city: {
      type: String,
      default: '',
      trim: true,
    },
    district: {
      type: String,
      default: '',
      trim: true,
    },
    province: {
      type: String,
      default: '',
      trim: true,
    },
    subscriptionPlan: {
      type: String,
      enum: ['STANDARD', 'BULK_ACCESS'],
      default: 'STANDARD',
    },
    favoriteFarmerIds: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('User', UserSchema);
