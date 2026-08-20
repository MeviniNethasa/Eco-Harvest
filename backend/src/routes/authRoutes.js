// backend/src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'ecoharvest_secret_key', {
    expiresIn: '30d',
  });
};

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { fullName, phoneNumber, role, city, district, province, subscriptionPlan, password } =
      req.body;

    if (!fullName || !phoneNumber) {
      return res.status(400).json({ success: false, message: 'Full name and phone number are required' });
    }

    let user = await User.findOne({ phoneNumber });
    if (user) {
      // Update existing user profile
      user.fullName = fullName || user.fullName;
      user.role = role || user.role;
      user.city = city !== undefined ? city : user.city;
      user.district = district !== undefined ? district : user.district;
      user.province = province !== undefined ? province : user.province;
      user.subscriptionPlan = subscriptionPlan || user.subscriptionPlan;
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
        phoneNumber,
        role: role || 'CUSTOMER',
        city: city || '',
        district: district || '',
        province: province || '',
        subscriptionPlan: subscriptionPlan || 'STANDARD',
        password: hashedPassword,
      });
    }

    const token = generateToken(user._id);

    return res.status(200).json({
      success: true,
      message: 'User registered/updated successfully',
      data: {
        id: user._id.toString(),
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        role: user.role,
        city: user.city,
        district: user.district,
        province: user.province,
        subscriptionPlan: user.subscriptionPlan,
        favoriteFarmerIds: user.favoriteFarmerIds || [],
        token,
      },
    });
  } catch (error) {
    console.error('Error registering user:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    const user = await User.findOne({ phoneNumber });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (password && user.password) {
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }
    }

    const token = generateToken(user._id);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        id: user._id.toString(),
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        role: user.role,
        city: user.city,
        district: user.district,
        province: user.province,
        subscriptionPlan: user.subscriptionPlan,
        favoriteFarmerIds: user.favoriteFarmerIds || [],
        token,
      },
    });
  } catch (error) {
    console.error('Error logging in:', error);
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

// PATCH /api/auth/user/:id/favorites (Toggle or update favorite farmers)
router.patch('/user/:id/favorites', async (req, res) => {
  try {
    const { farmerId, favoriteFarmerIds } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (Array.isArray(favoriteFarmerIds)) {
      user.favoriteFarmerIds = favoriteFarmerIds;
    } else if (farmerId) {
      const exists = user.favoriteFarmerIds.includes(farmerId);
      if (exists) {
        user.favoriteFarmerIds = user.favoriteFarmerIds.filter((id) => id !== farmerId);
      } else {
        user.favoriteFarmerIds.push(farmerId);
      }
    }

    await user.save();
    return res.status(200).json({
      success: true,
      message: 'Favorites updated',
      data: user.favoriteFarmerIds,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
