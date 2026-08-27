// backend/src/models/FarmerProfile.js
const mongoose = require('mongoose');

const BankDetailsSchema = new mongoose.Schema(
  {
    bankName: { type: String, default: '' },
    branchCode: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    accountHolderName: { type: String, default: '' },
  },
  { _id: false }
);

const LocationSchema = new mongoose.Schema(
  {
    province: { type: String, default: '' },
    district: { type: String, default: '' },
    city: { type: String, default: '' },
  },
  { _id: false }
);

const FarmerProfileSchema = new mongoose.Schema(
  {
    farmerId: {
      type: String,
      default: '',
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    ownerName: {
      type: String,
      required: [true, 'Owner/legal name is required'],
      trim: true,
    },
    mobileNumber: {
      type: String,
      required: [true, 'Mobile number is required'],
      trim: true,
    },
    farmName: {
      type: String,
      required: [true, 'Farm name is required'],
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    slsiStatus: {
      type: String,
      enum: ['UNVERIFIED', 'PENDING', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED'],
      default: 'UNVERIFIED',
    },
    isSLSIVerified: {
      type: Boolean,
      default: false,
    },
    slsiCertificateUrl: {
      type: String,
      default: null,
    },
    farmCoverPhotoUrl: {
      type: String,
      default: '',
    },
    bankDetails: {
      type: BankDetailsSchema,
      default: () => ({}),
    },
    location: {
      type: LocationSchema,
      default: () => ({}),
    },
    province: { type: String, default: '' },
    district: { type: String, default: '' },
    city: { type: String, default: '' },
    commissionRate: {
      type: Number,
      default: 5.0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('FarmerProfile', FarmerProfileSchema);
