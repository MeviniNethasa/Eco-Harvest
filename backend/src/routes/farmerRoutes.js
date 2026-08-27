// backend/src/routes/farmerRoutes.js
const express = require('express');
const router = express.Router();
const FarmerProfile = require('../models/FarmerProfile');

// GET /api/farmers (List all farmer storefronts / directories)
router.get('/', async (req, res) => {
  try {
    const { verifiedOnly, province, search } = req.query;
    const filter = {};

    if (verifiedOnly === 'true') {
      filter.$or = [{ isSLSIVerified: true }, { slsiStatus: 'VERIFIED' }];
    }
    if (province) {
      filter.province = province;
    }
    if (search) {
      filter.$or = [
        { farmName: { $regex: search, $options: 'i' } },
        { ownerName: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } },
        { district: { $regex: search, $options: 'i' } },
      ];
    }

    const farmers = await FarmerProfile.find(filter).sort({ isSLSIVerified: -1, createdAt: -1 });
    return res.status(200).json({ success: true, count: farmers.length, data: farmers });
  } catch (error) {
    console.error('Error fetching farmers:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/farmers/:id (Get single farm profile by ID, userId, mobileNumber, or farmName)
router.get('/:id', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { id } = req.params;
    let farmer = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      farmer = await FarmerProfile.findById(id);
    }
    if (!farmer) {
      const orConditions = [
        { farmerId: id },
        { mobileNumber: id },
        { farmName: { $regex: `^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
      ];
      if (mongoose.Types.ObjectId.isValid(id)) {
        orConditions.push({ userId: id });
        orConditions.push({ _id: id });
      }
      farmer = await FarmerProfile.findOne({ $or: orConditions });
    }
    if (!farmer) {
      return res.status(404).json({ success: false, message: 'Farm profile not found' });
    }
    return res.status(200).json({ success: true, data: farmer });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/farmers/profile (Create or update farmer profile)
router.post('/profile', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const {
      id,
      farmerId,
      userId,
      ownerName,
      legalName,
      mobileNumber,
      farmName,
      description,
      slsiStatus,
      isSLSIVerified,
      slsiCertificateUrl,
      bankDetails,
      location,
      province,
      district,
      city,
      farmCoverPhotoUrl,
      commissionRate,
    } = req.body;

    const actualOwnerName = ownerName || legalName;
    if (!actualOwnerName || !mobileNumber || !farmName) {
      return res.status(400).json({
        success: false,
        message: 'Owner name, mobile number, and farm name are required',
      });
    }

    const fid = id || farmerId || '';
    let farmer = null;
    if (fid && mongoose.Types.ObjectId.isValid(fid)) {
      farmer = await FarmerProfile.findById(fid);
    }
    if (!farmer && fid) {
      farmer = await FarmerProfile.findOne({ farmerId: fid });
    }
    if (!farmer && userId && mongoose.Types.ObjectId.isValid(userId)) {
      farmer = await FarmerProfile.findOne({ userId });
    }
    if (!farmer && mobileNumber) {
      farmer = await FarmerProfile.findOne({ mobileNumber });
    }
    if (!farmer && farmName) {
      farmer = await FarmerProfile.findOne({
        farmName: { $regex: `^${farmName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      });
    }

    const loc = location || {
      province: province || '',
      district: district || '',
      city: city || '',
    };

    if (farmer) {
      if (fid && !farmer.farmerId) farmer.farmerId = fid;
      farmer.ownerName = actualOwnerName;
      farmer.mobileNumber = mobileNumber;
      farmer.farmName = farmName;
      farmer.description = description !== undefined ? description : farmer.description;
      farmer.slsiStatus = slsiStatus || farmer.slsiStatus;
      farmer.isSLSIVerified = isSLSIVerified !== undefined ? isSLSIVerified : farmer.isSLSIVerified;
      farmer.bankDetails = bankDetails || farmer.bankDetails;
      farmer.location = loc;
      farmer.province = loc.province || farmer.province;
      farmer.district = loc.district || farmer.district;
      farmer.city = loc.city || farmer.city;
      farmer.farmCoverPhotoUrl = farmCoverPhotoUrl || farmer.farmCoverPhotoUrl;
      if (slsiCertificateUrl) farmer.slsiCertificateUrl = slsiCertificateUrl;
      farmer.commissionRate = commissionRate || farmer.commissionRate;
      await farmer.save();
    } else {
      farmer = await FarmerProfile.create({
        farmerId: fid || `farmer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId: userId && mongoose.Types.ObjectId.isValid(userId) ? userId : null,
        ownerName: actualOwnerName,
        mobileNumber,
        farmName,
        description: description || '',
        slsiStatus: slsiStatus || 'UNVERIFIED',
        isSLSIVerified: !!isSLSIVerified,
        bankDetails: bankDetails || {},
        location: loc,
        province: loc.province || '',
        district: loc.district || '',
        city: loc.city || '',
        farmCoverPhotoUrl: farmCoverPhotoUrl || '',
        slsiCertificateUrl: slsiCertificateUrl || null,
        commissionRate: commissionRate || 5.0,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Farm profile saved successfully',
      data: farmer,
    });
  } catch (error) {
    console.error('Error saving farm profile:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
