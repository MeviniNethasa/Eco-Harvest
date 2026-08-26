// backend/src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const FarmerProfile = require('../models/FarmerProfile');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'ecoharvest_secret_key', {
    expiresIn: '30d',
  });
};

// POST /api/auth/check-phone
router.post('/check-phone', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }
    const cleanPhone = phoneNumber.trim();
    const existing = await User.findOne({
      $or: [{ phoneNumber: cleanPhone }, { mobile: cleanPhone }],
    });
    return res.status(200).json({
      success: true,
      isRegistered: !!existing,
      message: existing ? 'Phone number already registered' : 'Phone number available',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const {
      fullName,
      phoneNumber,
      mobile,
      role,
      city,
      district,
      province,
      subscriptionPlan,
      isBulkBuyer,
      bulkAccessPlan,
      password,
      isNewRegistration,
      userId,
      farmName,
      ownerName,
      legalName,
      slsiCertificateUrl,
      certificateUrl,
      slsiStatus,
      bankDetails,
    } = req.body;

    const phone = (phoneNumber || mobile || '').trim();

    if (!fullName || !phone) {
      return res
        .status(400)
        .json({ success: false, message: 'Full name and phone number are required' });
    }

    // Explicit pre-check for existing phone number
    const existingUser = await User.findOne({
      $or: [{ phoneNumber: phone }, { mobile: phone }],
    });

    if (existingUser && isNewRegistration && (!userId || String(existingUser._id) !== String(userId))) {
      return res.status(400).json({
        success: false,
        message: 'This phone number is already registered. Please log in or use a different number.',
        errorType: 'DUPLICATE_PHONE',
      });
    }

    const assignedRole = (role || (farmName ? 'FARMER' : 'CUSTOMER')).toUpperCase();
    const planToSave =
      subscriptionPlan === 'BULK_ACCESS' || isBulkBuyer === true || bulkAccessPlan === 'BULK_ACCESS'
        ? 'BULK_ACCESS'
        : subscriptionPlan || 'STANDARD';
    const isBulk = isBulkBuyer !== undefined ? !!isBulkBuyer : planToSave === 'BULK_ACCESS';

    let user = existingUser;
    if (user) {
      // Update existing user profile
      user.fullName = fullName || user.fullName;
      user.role = assignedRole || user.role;
      user.city = city !== undefined ? city : user.city;
      user.district = district !== undefined ? district : user.district;
      user.province = province !== undefined ? province : user.province;
      user.subscriptionPlan = planToSave;
      user.isBulkBuyer = isBulk;
      user.bulkAccessPlan = bulkAccessPlan || (isBulk ? 'BULK_ACCESS' : 'STANDARD');
      if (password) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
      }
      await user.save();
    } else {
      let hashedPassword = null;
      if (password) {
        const salt = await bcrypt.genSalt(10);
        hashedPassword = await bcrypt.hash(password, salt);
      }
      user = await User.create({
        fullName,
        phoneNumber: phone,
        mobile: phone,
        role: assignedRole,
        city: city || '',
        district: district || '',
        province: province || '',
        subscriptionPlan: planToSave,
        isBulkBuyer: isBulk,
        bulkAccessPlan: bulkAccessPlan || (isBulk ? 'BULK_ACCESS' : 'STANDARD'),
        password: hashedPassword,
      });
    }

    // If farmer, also create/sync FarmerProfile linked to user._id
    if (user.role === 'FARMER' || assignedRole === 'FARMER' || farmName) {
      const fName = farmName || `${user.fullName}'s Organic Farm`;
      const oName = ownerName || legalName || user.fullName;
      const certUrl = slsiCertificateUrl || certificateUrl || null;
      const certStatus = slsiStatus || (certUrl ? 'PENDING' : 'UNVERIFIED');

      let fp = await FarmerProfile.findOne({ userId: user._id });
      if (!fp) {
        fp = await FarmerProfile.findOne({ mobileNumber: user.phoneNumber });
      }

      if (fp) {
        fp.userId = user._id;
        fp.ownerName = oName;
        fp.farmName = fName;
        fp.mobileNumber = user.phoneNumber;
        fp.province = user.province || fp.province;
        fp.district = user.district || fp.district;
        fp.city = user.city || fp.city;
        if (certUrl) fp.slsiCertificateUrl = certUrl;
        if (slsiStatus) fp.slsiStatus = certStatus;
        if (bankDetails) fp.bankDetails = bankDetails;
        await fp.save();
      } else {
        await FarmerProfile.create({
          userId: user._id,
          ownerName: oName,
          mobileNumber: user.phoneNumber,
          farmName: fName,
          province: user.province || '',
          district: user.district || '',
          city: user.city || '',
          slsiStatus: certStatus,
          slsiCertificateUrl: certUrl,
          bankDetails: bankDetails || {},
        });
      }
    }

    console.log(`REGISTER SUCCESS [${user.role}]: ${user.fullName} (${user.phoneNumber}) - Plan: ${user.subscriptionPlan}${user.isBulkBuyer ? ' [BULK_BUYER]' : ''}`);

    const token = generateToken(user._id);

    return res.status(200).json({
      success: true,
      message: 'User registered/updated successfully',
      data: {
        id: user._id,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        role: user.role,
        city: user.city,
        district: user.district,
        province: user.province,
        subscriptionPlan: user.subscriptionPlan,
        isBulkBuyer: user.isBulkBuyer,
        bulkAccessPlan: user.bulkAccessPlan,
        favoriteFarmerIds: user.favoriteFarmerIds || [],
        token,
      },
    });
  } catch (error) {
    console.error('Registration error details:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'This phone number is already registered. Please log in or use a different number.',
        errorType: 'DUPLICATE_PHONE',
        keyPattern: error.keyPattern,
        keyValue: error.keyValue,
      });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { phoneNumber, fullName, password } = req.body;
    if (!phoneNumber && !fullName) {
      return res.status(400).json({ success: false, message: 'Full name or phone number is required' });
    }
    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required' });
    }

    let user = null;
    if (phoneNumber) {
      const phone = phoneNumber.trim();
      user = await User.findOne({
        $or: [{ phoneNumber: phone }, { mobile: phone }],
      });
    } else if (fullName) {
      const trimmedName = fullName.trim();
      const escaped = trimmedName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      user = await User.findOne({
        fullName: { $regex: new RegExp(`^${escaped}$`, 'i') },
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with these credentials. Please check your full name or sign up.',
      });
    }

    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: 'This account does not have a password set. Please sign up or update your profile.',
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Incorrect password. Please try again.' });
    }

    // Also look up linked FarmerProfile if role is FARMER or if farmer record exists
    let farmerProfile = null;
    if (user.role === 'FARMER' || user.role === 'ADMIN') {
      farmerProfile = await FarmerProfile.findOne({
        $or: [{ userId: user._id }, { mobileNumber: user.phoneNumber }],
      });
    }

    console.log(`LOGIN SUCCESS: ${user.fullName} (${user.phoneNumber}) [Role: ${user.role}]`);

    const token = generateToken(user._id);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        id: user._id,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        role: user.role,
        city: user.city,
        district: user.district,
        province: user.province,
        subscriptionPlan: user.subscriptionPlan,
        isBulkBuyer: !!user.isBulkBuyer || user.subscriptionPlan === 'BULK_ACCESS',
        bulkAccessPlan: user.bulkAccessPlan || (user.subscriptionPlan === 'BULK_ACCESS' ? 'BULK_ACCESS' : 'STANDARD'),
        favoriteFarmerIds: user.favoriteFarmerIds || [],
        farmerProfile: farmerProfile || null,
        token,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/auth/user/:id
router.get('/user/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.status(200).json({ success: true, data: user });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/auth/user/:id/favorites
router.patch('/user/:id/favorites', async (req, res) => {
  try {
    const { farmerId } = req.body;
    if (!farmerId) {
      return res.status(400).json({ success: false, message: 'farmerId is required' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const index = user.favoriteFarmerIds.indexOf(farmerId);
    if (index > -1) {
      user.favoriteFarmerIds.splice(index, 1);
    } else {
      user.favoriteFarmerIds.push(farmerId);
    }

    await user.save();
    return res.status(200).json({
      success: true,
      message: 'Favorites updated',
      favoriteFarmerIds: user.favoriteFarmerIds,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
