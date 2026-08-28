// backend/src/models/Product.js
const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema(
  {
    farmerId: {
      type: String,
      required: [true, 'Farmer ID is required'],
      trim: true,
    },
    title: {
      type: String,
      required: [true, 'Product title is required'],
      trim: true,
    },
    name: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      enum: ['Vegetables', 'Fruits', 'Grains', 'Spices'],
      default: 'Vegetables',
    },
    pricePerKg: {
      type: Number,
      required: [true, 'Price per unit/kg is required'],
    },
    pricePerUnit: {
      type: Number,
    },
    unit: {
      type: String,
      default: '1kg',
    },
    availableQuantity: {
      type: Number,
      default: 100,
    },
    availableQtyKg: {
      type: Number,
      default: 100,
    },
    lowStockThreshold: {
      type: Number,
      default: 10,
    },
    imageUrl: {
      type: String,
      default: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&q=60',
    },
    isSLSIVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    farmName: {
      type: String,
      default: '',
    },
    province: {
      type: String,
      default: '',
    },
    district: {
      type: String,
      default: '',
    },
    city: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save middleware to keep name/title and pricePerKg/pricePerUnit synced
ProductSchema.pre('save', function (next) {
  if (this.title && !this.name) this.name = this.title;
  if (this.name && !this.title) this.title = this.name;
  if (this.pricePerKg && !this.pricePerUnit) this.pricePerUnit = this.pricePerKg;
  if (this.pricePerUnit && !this.pricePerKg) this.pricePerKg = this.pricePerUnit;
  if (this.availableQuantity && !this.availableQtyKg) this.availableQtyKg = this.availableQuantity;
  if (this.availableQtyKg && !this.availableQuantity) this.availableQuantity = this.availableQtyKg;
  next();
});

module.exports = mongoose.model('Product', ProductSchema);
