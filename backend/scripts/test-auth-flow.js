// backend/scripts/test-auth-flow.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

dotenv.config({ path: __dirname + '/../.env' });

const User = require('../src/models/User');
const FarmerProfile = require('../src/models/FarmerProfile');

async function runAuthTests() {
  console.log('--- Starting EcoHarvest Auth & Persistence Test ---');
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MONGO_URI not found in backend/.env');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB Atlas');

  const testCustomerPhone = `077${Math.floor(1000000 + Math.random() * 9000000)}`;
  const testCustomerName = `Test Customer ${Date.now()}`;
  const testPassword = 'Password123!';

  // 1. Test Customer Registration with Password
  console.log(`1. Testing Customer Registration: ${testCustomerName} (${testCustomerPhone})`);
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(testPassword, salt);

  const customerUser = await User.create({
    fullName: testCustomerName,
    phoneNumber: testCustomerPhone,
    mobile: testCustomerPhone,
    role: 'CUSTOMER',
    city: 'Colombo',
    district: 'Colombo',
    province: 'Western',
    subscriptionPlan: 'STANDARD',
    password: hashedPassword,
  });

  console.log(`   ✅ Customer created in DB with ID: ${customerUser._id}`);

  // 2. Test Customer Login by Full Name + Password
  console.log(`2. Testing Customer Login by Full Name: "${testCustomerName}"`);
  const foundUser = await User.findOne({
    fullName: { $regex: new RegExp(`^${testCustomerName}$`, 'i') },
  });
  if (!foundUser) throw new Error('Customer user not found by full name');

  const isPasswordValid = await bcrypt.compare(testPassword, foundUser.password);
  if (!isPasswordValid) throw new Error('Password verification failed for valid password');
  console.log('   ✅ Customer password verified successfully');

  // Test wrong password
  const isWrongPasswordValid = await bcrypt.compare('WrongPass123', foundUser.password);
  if (isWrongPasswordValid) throw new Error('Wrong password was incorrectly accepted');
  console.log('   ✅ Incorrect password correctly rejected');

  // 3. Test Farmer Registration with Password & FarmerProfile Link
  const testFarmerPhone = `071${Math.floor(1000000 + Math.random() * 9000000)}`;
  const testFarmerName = `Farmer Bandara ${Date.now()}`;
  const testFarmName = `Green Valley Farm ${Date.now()}`;

  console.log(`3. Testing Farmer Registration: ${testFarmerName} (${testFarmerPhone})`);
  const farmerUser = await User.create({
    fullName: testFarmerName,
    phoneNumber: testFarmerPhone,
    mobile: testFarmerPhone,
    role: 'FARMER',
    city: 'Kandy',
    district: 'Kandy',
    province: 'Central',
    password: hashedPassword,
  });

  const farmerProfile = await FarmerProfile.create({
    userId: farmerUser._id,
    ownerName: testFarmerName,
    mobileNumber: testFarmerPhone,
    farmName: testFarmName,
    province: 'Central',
    district: 'Kandy',
    city: 'Kandy',
    slsiStatus: 'UNVERIFIED',
    bankDetails: {
      bankName: 'Bank of Ceylon',
      branchCode: '001',
      accountNumber: '123456789',
      accountHolderName: testFarmerName,
    },
  });

  console.log(`   ✅ Farmer user created in DB: ${farmerUser._id}`);
  console.log(`   ✅ FarmerProfile created in DB: ${farmerProfile._id}`);

  // 4. Test Farmer Login by Full Name & Retrieve Farmer Profile
  console.log(`4. Testing Farmer Login by Full Name: "${testFarmerName}"`);
  const foundFarmerUser = await User.findOne({
    fullName: { $regex: new RegExp(`^${testFarmerName}$`, 'i') },
  });
  if (!foundFarmerUser) throw new Error('Farmer user not found by full name');

  const linkedProfile = await FarmerProfile.findOne({
    $or: [{ userId: foundFarmerUser._id }, { mobileNumber: foundFarmerUser.phoneNumber }],
  });
  if (!linkedProfile) throw new Error('Farmer profile not linked');
  console.log(`   ✅ Farmer login verified, retrieved linked farm: "${linkedProfile.farmName}"`);

  // Clean up test data
  await User.deleteMany({ _id: { $in: [customerUser._id, farmerUser._id] } });
  await FarmerProfile.deleteMany({ _id: farmerProfile._id });
  console.log('   🧹 Test data cleaned up successfully');

  await mongoose.disconnect();
  console.log('--- All Auth & DB Persistence Tests Passed Successfully! ---');
}

runAuthTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
