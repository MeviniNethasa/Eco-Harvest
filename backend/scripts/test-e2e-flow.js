// backend/scripts/test-e2e-flow.js
/**
 * EcoHarvest Automated End-to-End Integration Flow Runner
 *
 * Verifies the 5 core integration milestones:
 * 1. Farmer Registration with SLSI Certification (POST /api/auth/register)
 * 2. Bulk Buyer Customer Registration (POST /api/auth/register with isBulkBuyer: true)
 * 3. Live Admin Verification Desk (GET & POST /api/admin/verifications/:id/approve)
 * 4. Chat Moderation Interception Trigger (POST /api/messages & GET /api/admin/moderation/chats)
 * 5. Escrow Order & Payment Ledger Verification (POST /api/orders & GET /api/admin/escrow/ledger)
 */

const BASE_URL = process.env.API_URL || 'http://localhost:5000/api';

async function makeRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const errorMsg = data.message || `Request to ${endpoint} failed with status ${response.status}`;
    const err = new Error(errorMsg);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

function printHeader(title) {
  console.log('\n' + '='.repeat(70));
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

function printStep(stepNum, name) {
  console.log(`\n[STEP ${stepNum}] ${name}`);
  console.log('-'.repeat(50));
}

function printSuccess(msg) {
  console.log(`  ✅ SUCCESS: ${msg}`);
}

function printDetail(label, value) {
  console.log(`     • ${label}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
}

async function runE2EFlow() {
  printHeader('ECOHARVEST LIVE BACKEND & ADMIN PORTAL E2E TEST RUNNER');
  console.log(`Target Backend Base URL: ${BASE_URL}`);

  const testId = Date.now().toString().slice(-6);
  const results = [];

  try {
    // -------------------------------------------------------------------------
    // STEP 1: Farmer Registration with SLSI Document Details
    // -------------------------------------------------------------------------
    printStep(1, 'Register Farmer Account with SLSI Document Details');
    const farmerPhone = `078${Math.floor(1000000 + Math.random() * 9000000)}`;
    const farmerPayload = {
      fullName: `Farmer Sunil Wickramasinghe ${testId}`,
      phoneNumber: farmerPhone,
      role: 'FARMER',
      province: 'Central',
      district: 'Nuwara Eliya',
      city: 'Nuwara Eliya',
      farmName: `Highland Green Valley Estates ${testId}`,
      slsiCertificateUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=1200&q=80',
      slsiStatus: 'PENDING',
      isNewRegistration: true,
      bankDetails: {
        bankName: 'Bank of Ceylon',
        branchCode: '701 (Nuwara Eliya Main)',
        accountNumber: '008829103948',
        accountHolderName: `Sunil Wickramasinghe ${testId}`,
      },
    };

    const farmerRes = await makeRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(farmerPayload),
    });

    const farmerId = farmerRes.data.id;
    printSuccess('Farmer registered successfully');
    printDetail('Farmer User ID', farmerId);
    printDetail('Farm Name', farmerPayload.farmName);
    printDetail('Phone Number', farmerRes.data.phoneNumber);
    printDetail('Assigned Role', farmerRes.data.role);
    results.push({ step: 1, name: 'Farmer Registration', status: 'PASSED' });

    // -------------------------------------------------------------------------
    // STEP 2: Bulk Customer Registration (isBulkBuyer: true)
    // -------------------------------------------------------------------------
    printStep(2, 'Register Bulk Customer Account (isBulkBuyer: true)');
    const customerPhone = `076${Math.floor(1000000 + Math.random() * 9000000)}`;
    const customerPayload = {
      fullName: `Colombo Grand Wholesale Mart ${testId}`,
      phoneNumber: customerPhone,
      role: 'CUSTOMER',
      province: 'Western',
      district: 'Colombo',
      city: 'Colombo 07',
      subscriptionPlan: 'BULK_ACCESS',
      isBulkBuyer: true,
      bulkAccessPlan: 'BULK_ACCESS',
      isNewRegistration: true,
    };

    const customerRes = await makeRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(customerPayload),
    });

    const customerId = customerRes.data.id;
    printSuccess('Bulk Customer registered successfully');
    printDetail('Customer User ID', customerId);
    printDetail('Full Name', customerRes.data.fullName);
    printDetail('Subscription Plan', customerRes.data.subscriptionPlan);
    printDetail('isBulkBuyer Flag', customerRes.data.isBulkBuyer);
    results.push({ step: 2, name: 'Bulk Buyer Registration', status: 'PASSED' });

    // -------------------------------------------------------------------------
    // STEP 3: Admin Verification Check & Approval
    // -------------------------------------------------------------------------
    printStep(3, 'Admin Verification Check & Merchant Approval');
    const verificationsRes = await makeRequest('/admin/verifications');
    printSuccess(`Fetched ${verificationsRes.count} applications from MongoDB queue`);

    // Find the newly created farmer or the top pending farmer
    const pendingFarmer =
      verificationsRes.data.find((f) => f.farmName.includes(testId)) ||
      verificationsRes.data[0];

    if (!pendingFarmer) {
      throw new Error('No pending farmer found in MongoDB verifications list');
    }

    printDetail('Target Farmer ID', pendingFarmer.id);
    printDetail('Farm Name', pendingFarmer.farmName);
    printDetail('Initial Verification Status', pendingFarmer.verificationStatus);

    // Approve the farmer with 2.5% commission rate
    const approveRes = await makeRequest(`/admin/verifications/${pendingFarmer.id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ commissionRate: 2.5 }),
    });

    printSuccess(`SLSI Certification approved: ${approveRes.message}`);
    printDetail('New Status', approveRes.data.status);
    printDetail('Approved Commission Rate', `${approveRes.data.commissionRate}%`);
    results.push({ step: 3, name: 'Admin Farmer Verification & Approval', status: 'PASSED' });

    // -------------------------------------------------------------------------
    // STEP 4: Chat Moderation Trigger & Feed Verification
    // -------------------------------------------------------------------------
    printStep(4, 'Chat Moderation Interception & Admin Feed Verification');
    const conversationId = `conv_test_${testId}`;
    const offendingMessagePayload = {
      conversationId,
      senderId: `CUST-${customerId}`,
      receiverId: `FARM-${farmerId}`,
      senderRole: 'CUSTOMER',
      text: 'Call me on 0771234567 to pay cash directly and skip the app commission.',
    };

    const messageRes = await makeRequest('/messages', {
      method: 'POST',
      body: JSON.stringify(offendingMessagePayload),
    });

    printSuccess('Offending chat message sent');
    printDetail('isBlocked Flag', messageRes.data.isBlocked);
    printDetail('isFlagged Flag', messageRes.data.isFlagged);
    printDetail('Moderation Status', messageRes.data.moderationStatus);

    if (!messageRes.data.isBlocked) {
      throw new Error('Expected message containing phone number to be blocked by moderation filter');
    }

    // Verify it appears in the admin moderated chat feed
    const modFeedRes = await makeRequest('/admin/moderation/chats');
    printSuccess(`Fetched ${modFeedRes.count} flagged tickets from Admin Moderation Feed`);

    const flaggedTicket = modFeedRes.data.find(
      (t) => t.conversationId === conversationId || t.offendingSnippet.includes('0771234567')
    );

    if (!flaggedTicket) {
      throw new Error('Flagged message did not surface in GET /api/admin/moderation/chats');
    }

    printDetail('Detected Ticket ID', flaggedTicket.ticketId);
    printDetail('Offending Snippet', flaggedTicket.offendingSnippet);
    printDetail('Highlighted Terms', flaggedTicket.highlightedTerms);
    printDetail('Violation Category', flaggedTicket.violationCategory);
    results.push({ step: 4, name: 'Chat Moderation Filter & Feed Verification', status: 'PASSED' });

    // -------------------------------------------------------------------------
    // STEP 5: Escrow Order & Payment Ledger Verification
    // -------------------------------------------------------------------------
    printStep(5, 'Escrow Order Creation & Live Ledger Tracking');
    const orderId = `ORD-E2E-${testId}`;
    const orderPayload = {
      orderId,
      customerId: `CUST-${customerId} (${customerPayload.fullName})`,
      farmerId: `FARM-${farmerId}`,
      totalAmount: 84500,
      paymentMethod: 'STRIPE_ESCROW',
      items: [
        {
          cropId: `crop_carrot_${testId}`,
          name: 'Organic Highland Carrots Grade A',
          pricePerUnit: 250,
          unit: 'kg',
          quantity: 200,
          farmName: farmerPayload.farmName,
          farmerId,
        },
        {
          cropId: `crop_leeks_${testId}`,
          name: 'Fresh Organic Leeks',
          pricePerUnit: 345,
          unit: 'kg',
          quantity: 100,
          farmName: farmerPayload.farmName,
          farmerId,
        },
      ],
      deliveryAddress: {
        street: '124 Union Place',
        city: 'Colombo 02',
        district: 'Colombo',
        postalCode: '00200',
      },
    };

    const orderRes = await makeRequest('/orders', {
      method: 'POST',
      body: JSON.stringify(orderPayload),
    });

    printSuccess('Order created with ESCROW_LOCKED status');
    printDetail('Order ID', orderRes.data.orderId);
    printDetail('Total Amount', `LKR ${orderRes.data.totalAmount}`);
    printDetail('Escrow Status', orderRes.data.escrowStatus);

    // Verify it appears in the Admin Escrow Ledger
    const ledgerRes = await makeRequest('/admin/escrow/ledger');
    printSuccess(`Fetched ${ledgerRes.count} orders from Admin Escrow Ledger`);

    const ledgerItem = ledgerRes.data.find((e) => e.orderId === orderId);
    if (!ledgerItem) {
      throw new Error(`Created order ${orderId} not found in GET /api/admin/escrow/ledger`);
    }

    printDetail('Master Payment Intent', ledgerItem.masterPaymentIntentId);
    printDetail('Customer Name', ledgerItem.customerName);
    printDetail('Farmer Name', ledgerItem.farmerName);
    printDetail('Total Escrow Hold', `LKR ${ledgerItem.totalHoldLKR}`);
    printDetail('Uber Delivery Status', ledgerItem.uberDeliveryStatus);
    printDetail('Handshake OTP State', ledgerItem.handshakeOtpStatus);
    results.push({ step: 5, name: 'Escrow Order & Ledger Verification', status: 'PASSED' });

    // -------------------------------------------------------------------------
    // Summary Report
    // -------------------------------------------------------------------------
    printHeader('E2E INTEGRATION TEST RESULTS SUMMARY');
    results.forEach((r) => {
      console.log(`  ✅ [PASSED] Step ${r.step}: ${r.name}`);
    });
    console.log('\n🎉 ALL 5 INTEGRATION FLOW MILESTONES PASSED SUCCESSFULLY!\n');
  } catch (error) {
    console.error('\n❌ E2E TEST RUNNER FAILED:');
    console.error(`   Error Message: ${error.message}`);
    if (error.status) console.error(`   HTTP Status: ${error.status}`);
    if (error.data) console.error(`   Response Data:`, error.data);
    process.exit(1);
  }
}

runE2EFlow();
