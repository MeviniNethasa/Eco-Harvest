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
      trim: true,
      index: { unique: true, sparse: true },
    },
    mobile: {
      type: String,
      trim: true,
      index: { unique: true, sparse: true },
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

// Keep phoneNumber and mobile in sync
UserSchema.pre('save', function (next) {
  if (this.phoneNumber && !this.mobile) this.mobile = this.phoneNumber;
  if (this.mobile && !this.phoneNumber) this.phoneNumber = this.mobile;
  next();
});

module.exports = mongoose.model('User', UserSchema);
