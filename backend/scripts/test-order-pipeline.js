// backend/scripts/test-order-pipeline.js
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: __dirname + '/../.env' });
const connectDB = require('../src/config/db');
const Order = require('../src/models/Order');
const Notification = require('../src/models/Notification');
const { app, server } = require('../src/server');

async function runTest() {
  console.log('--- Testing EcoHarvest Real-Time Order & Notification Pipeline ---');

  // Wait for mongo connection if needed
  if (mongoose.connection.readyState !== 1) {
    await connectDB();
  }

  const testOrderId = `ORD-TEST-${Date.now()}`;
  const testFarmerId = `farmer_test_${Date.now()}`;
  const testCustomerId = `customer_test_${Date.now()}`;

  console.log(`Creating order ${testOrderId} for farmer ${testFarmerId}...`);

  // 1. Post order via fetch to http://localhost:5000/api/orders
  const orderPayload = {
    orderId: testOrderId,
    customerId: testCustomerId,
    farmerId: testFarmerId,
    items: [
      {
        cropId: 'crop_001',
        name: 'Organic Nuwara Eliya Carrots',
        quantity: 3,
        pricePerUnit: 450,
        unit: '1kg',
        farmerId: testFarmerId,
        farmName: 'Green Valley Organic Farms',
      },
    ],
    farmGroups: [
      {
        farmName: 'Green Valley Organic Farms',
        farmerId: testFarmerId,
        items: [
          {
            cropId: 'crop_001',
            name: 'Organic Nuwara Eliya Carrots',
            quantity: 3,
            pricePerUnit: 450,
            unit: '1kg',
            farmerId: testFarmerId,
            farmName: 'Green Valley Organic Farms',
          },
        ],
        subtotal: 1350,
        deliveryFee: 0,
      },
    ],
    totalAmount: 1350,
    total: 1350,
    paymentMethod: 'STRIPE_ESCROW',
  };

  const createRes = await fetch('http://localhost:5000/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderPayload),
  });

  const createData = await createRes.json();
  console.log('Order creation status:', createRes.status, createData.success);
  if (!createData.success) {
    throw new Error(`Order creation failed: ${createData.message}`);
  }

  // 2. Verify Farmer Notification was created in MongoDB
  const farmerNotifs = await Notification.find({ recipientId: testFarmerId });
  console.log(`Farmer Notifications found for ${testFarmerId}: ${farmerNotifs.length}`);
  if (farmerNotifs.length === 0) {
    throw new Error('Farmer notification was not created in database!');
  }
  console.log('Farmer notification title:', farmerNotifs[0].title);
  console.log('Farmer notification body:', farmerNotifs[0].body);

  // 3. Verify Customer Notification was created in MongoDB
  const customerNotifs = await Notification.find({ recipientId: testCustomerId });
  console.log(`Customer Notifications found: ${customerNotifs.length}`);
  if (customerNotifs.length === 0) {
    throw new Error('Customer notification was not created in database!');
  }

  // 4. Test GET /api/orders/farmer/:farmerId
  const farmerOrdersRes = await fetch(`http://localhost:5000/api/orders/farmer/${testFarmerId}`);
  const farmerOrdersData = await farmerOrdersRes.json();
  console.log(`Farmer orders endpoint count: ${farmerOrdersData.count}`);
  if (farmerOrdersData.count === 0) {
    throw new Error('Farmer orders endpoint did not return the new order!');
  }

  // 5. Test GET /api/admin/escrow/ledger
  const escrowRes = await fetch('http://localhost:5000/api/admin/escrow/ledger');
  const escrowData = await escrowRes.json();
  const matchedEscrow = (escrowData.data || []).find((e) => e.orderId === testOrderId);
  console.log('Admin Escrow Ledger contains new order:', !!matchedEscrow);
  if (!matchedEscrow) {
    throw new Error('Admin Escrow ledger did not contain the new order!');
  }

  // 6. Clean up test records
  await Order.deleteMany({ orderId: testOrderId });
  await Notification.deleteMany({
    $or: [{ recipientId: testFarmerId }, { recipientId: testCustomerId }],
  });

  console.log('--- ALL ORDER & NOTIFICATION PIPELINE TESTS PASSED ---');
  server.close();
  await mongoose.disconnect();
  process.exit(0);
}

runTest().catch((err) => {
  console.error('Test failed with error:', err);
  if (server) server.close();
  mongoose.disconnect();
  process.exit(1);
});
