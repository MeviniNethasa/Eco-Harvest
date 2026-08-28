# ECOHARVEST PLATFORM: USER ACCEPTANCE TESTING (UAT) MASTER MANUAL
**Document Reference:** `ECO-UAT-MAN-2026-V1.0`  
**Classification:** Production-Grade / Academic Quality Assurance Standard  
**Lead QA Automation Architect & Principal Systems Auditor:** Antigravity Testing & Verification Office  
**Target Environment:** EcoHarvest Mobile Client (Expo SDK 57 iOS/Android) & Governance Command Center (Expo Web)  
**Backend Services:** Node.js/Express REST Gateway (Port 5000), Python AI Microservices (Port 5001/5002), Google Gemini GenAI Suite, Stripe Escrow API, Uber Direct Logistics Engine, MongoDB Atlas.

---

### Executive Summary & Test Execution Protocol
This User Acceptance Testing (UAT) Case Manual provides the authoritative testing blueprint for certifying the EcoHarvest agri-tech ecosystem. Test cases are structured across five specialized testing suites corresponding to distinct system roles, AI sub-engines, financial escrow mechanisms, and administrative governance modules.

#### Evaluation Scale for Evaluator / QA Auditor:
- **Pass (`P`):** System operates strictly according to the specified technical outcome with zero defects.
- **Fail (`F`):** Deviations in business logic, UI state inconsistency, API failure, or security breach.
- **Blocked (`B`):** Environmental or upstream dependency prevents execution.

---

## Suite 1: Farmer Persona & Producer Operations (Mobile Client)

### 1.1 Single-Screen Farmer Registration, Geolocation, SLSI Certification & Bank Onboarding

| Test ID | Feature Component | Action / Step-by-Step Instructions | Expected Technical Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| **TC-FAR-001** | Profile Screen Entry & Role Selection | 1. Launch EcoHarvest Mobile App.<br>2. Navigate to `ProfileScreen`.<br>3. Locate role selection choices and tap **"Sign Up as a farmer"** (*"Onboard your farm and publish crops to the marketplace"*). | App opens the unified `FarmerOnboardingScreen` displaying all onboarding sections (Main Details, Geolocation Pin, Password, SLSI Certificate, and Bank Details) on a single scrollable interface. | |
| **TC-FAR-002** | Unified Form: Main Identity, Bio & Cover Photo | 1. In Onboarding Screen, enter Full Name (e.g., "Kamal Perera") and Phone Number.<br>2. Enter Farm Name ("Green Horizon Organic Estate") and Farm Bio description.<br>3. Tap "Upload Farm Cover Photo" and pick image from gallery. | System validates required string fields, prepares JPEG asset, and updates local image preview container instantly. | |
| **TC-FAR-003** | Unified Form: Geolocation & Interactive Map Pin | 1. In the same screen, select Province: "Central", District: "Nuwara Eliya", City: "Nanu Oya".<br>2. Tap "Pin Farm on Map".<br>3. Drag the interactive location pin to the precise farm boundary on the map modal.<br>4. Tap "Confirm Location". | `MapLocationPickerModal` captures exact GPS coordinates (`latitude`, `longitude`, formatted address). Onboarding form updates with selected coordinate tags and district mapping. | |
| **TC-FAR-004** | Unified Form: Account Security & Password | 1. Scroll down to Account Security section.<br>2. Enter Password (minimum 6 characters with alphanumeric requirements).<br>3. Confirm password matching. | Password field validates strength in real-time. Password confirmation mismatch triggers immediate inline validation error banner. | |
| **TC-FAR-005** | Unified Form: SLSI Organic Certificate (SLS 1324:2018) | 1. In the Certification section of the same screen, enter SLSI Registration Number (e.g., `SLSI/ORG/2026/0891`).<br>2. Enter Certification Issue Date and Expiry Date.<br>3. Tap "Upload SLSI Certificate Document" and select PDF/JPEG file. | System validates document format and file size (<10MB). Selected certificate preview thumbnail and file metadata appear in the upload card. | |
| **TC-FAR-006** | Unified Form: Bank Settlement Details | 1. Scroll down to Bank Payout Information section.<br>2. Enter Bank Name (e.g., "Bank of Ceylon" / "Commercial Bank of Ceylon").<br>3. Enter Branch Name/Code, Account Number, and Account Holder Name. | System validates numeric account digits and branch code syntax without leaving the screen. | |
| **TC-FAR-007** | Unified Form: Atomic Submission & Pending State Lock | 1. Tap the primary button **"Complete Farm Registration & Submit for Audit"** at bottom of screen.<br>2. Wait for submission response.<br>3. Attempt to publish a produce item immediately after registration. | All sections submit in a single atomic transaction (`POST /api/farmer/onboard` / `authApi.register`). Password is encrypted (bcrypt salt 10), account is created with `verificationStatus: "PENDING_VERIFICATION"`, farmer dashboard loads with yellow pending badge, and produce publishing is blocked until admin approval. | |

---

### 1.2 Produce Catalog Management & AI Freshness Grading (VGG16 Custom CNN)

| Test ID | Feature Component | Action / Step-by-Step Instructions | Expected Technical Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| **TC-FAR-008** | Produce Creation & Metric Assignment | 1. Open Farmer Dashboard and tap "+ Add Produce".<br>2. Select Category (e.g., Organic Vegetables, Fruits, Spices).<br>3. Enter Produce Name ("Organic Nuwara Eliya Carrots"), Price per Kg (LKR 380), Stock (500 kg), Harvest Date. | Form validates non-negative integers, computes unit metrics, and prepares multipart payload for classification and image storage. | |
| **TC-FAR-009** | Hardware-Restricted AI Freshness Assessment (VGG16) | 1. In Add Produce screen, tap "Assess Freshness via AI Camera".<br>2. Capture a live photo of freshly harvested produce.<br>3. Trigger automated AI inspection (`POST /api/ai/assess-freshness`). | Image is preprocessed (128x128 RGB normalization) and processed by VGG16 CNN. Model returns classification (e.g., `Grade: Fresh (94.8% confidence)`), and app automatically badges listing as "Grade A - Certified Fresh". | |
| **TC-FAR-010** | Low-Grade / Degraded Produce Rejection | 1. Upload/capture an image of spoiled, rotting, or non-vegetable sample.<br>2. Submit for VGG16 CNN assessment. | Microservice classifies sample as `Rotten` / `Low Quality` (<60% freshness score). System blocks submission with warning: *"Produce fails organic quality threshold for direct consumer sale"*. | |
| **TC-FAR-011** | Batch Traceability & Inventory Thresholds | 1. Assign unique Harvest Batch ID (`BATCH-2026-NE-08`).<br>2. Set low-stock warning threshold at 20 kg.<br>3. Save produce item. | Produce document is committed to MongoDB with active stock. Item appears in `MyProductsScreen` with active inventory gauge and batch traceability tag. | |
| **TC-FAR-012** | Live Stock Toggling & Inventory Modification | 1. Open `MyProductsScreen`.<br>2. Toggle "Active Listing" switch to OFF for a listed item.<br>3. Edit unit price from LKR 380 to LKR 360/kg.<br>4. Save changes. | Backend sends `PATCH /api/products/:id`. Public marketplace immediately hides item or displays "Sold Out" without deleting relational historical order data. | |

---

### 1.3 AI Agritech Market Intelligence & Dynamic Forecasting (Gemini 2.5 Flash)

| Test ID | Feature Component | Action / Step-by-Step Instructions | Expected Technical Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| **TC-FAR-013** | Real-Time Market Demand & Price Trend Query | 1. Open "AI Agritech Advisory" tab in Farmer Dashboard.<br>2. Select Crop: "Carrot", Province: "Central", Timeframe: "Next 30 Days".<br>3. Tap "Generate AI Market Forecast". | Backend invokes Gemini 2.5 Flash (`/api/ai/forecast-market`). System returns price trend trajectory (LKR/kg), expected demand surge index (0-100), and institutional buyer demand forecasts. | |
| **TC-FAR-014** | Weather & Seasonality Yield Optimization | 1. Select "Yield & Harvest Window Advisor".<br>2. Trigger localized agro-climatic forecast for Nuwara Eliya district. | AI engine combines historical crop cycle data with seasonal rainfall trends to generate dynamic planting/harvesting recommendations with specific date ranges. | |
| **TC-FAR-015** | Dynamic Price Advisory Adoption | 1. View suggested optimal price point generated by Gemini (e.g., *"Recommended: LKR 375/kg to maximize wholesale volume"*).<br>2. Tap "Apply Suggested Price to Active Listings". | Price field in active produce inventory automatically updates to suggested value. Confirmation toast displayed: *"Price updated according to regional AI market advisory"*. | |

---

### 1.4 Order Fulfillment, Logistics Handshake & Escrow Payouts

| Test ID | Feature Component | Action / Step-by-Step Instructions | Expected Technical Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| **TC-FAR-016** | Suborder Intake Notification | 1. Customer places a multi-farm order including this farmer's produce.<br>2. Farmer receives push notification: *"New Escrow Order #ORD-XXXX Received"*.<br>3. Open `FarmerOrdersScreen`. | Order appears in "Pending Acceptance" tab with exact ordered weight, customer delivery district, escrow status (`SUCCEEDED_HELD_IN_ESCROW`), and estimated payout. | |
| **TC-FAR-017** | Order Packing & Dispatch Ready State | 1. Select pending order in `FarmerOrdersScreen`.<br>2. Tap "Mark as Packed & Ready for Pickup".<br>3. Confirm box weight and batch verification. | Backend updates suborder status to `READY_FOR_PICKUP`. Logistics engine is notified to assign delivery vehicle. Customer and Admin dashboards reflect real-time status update. | |
| **TC-FAR-018** | Automated Escrow Settlement Verification | 1. Driver arrives at customer doorstep and enters customer's 4-digit OTP.<br>2. Order updates to `delivered` in system.<br>3. Check Farmer Wallet / Payout ledger. | Order status transitions to `COMPLETED`. Escrow status shifts from `LOCKED` to `RELEASED`. Funds (minus 5% platform commission) are credited to Farmer Stripe balance. | |
| **TC-FAR-019** | Revenue Ledger & Historical Statements | 1. Open "Earnings & Payouts" in Farmer Dashboard.<br>2. Filter ledger by "Last 30 Days".<br>3. Tap "Export Statement (CSV/PDF)". | App calculates Gross Sales, Platform Fee Deductions, Escrow Releases, and Net Bank Transfers. Generates clean downloadable statement matching database records. | |

---

## Suite 2: Retail Customer Persona (Mobile Client)

### 2.1 Discovery, Marketplace Exploration & SLSI Verification Inspection

| Test ID | Feature Component | Action / Step-by-Step Instructions | Expected Technical Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| **TC-CUS-001** | Customer Registration & Preference Setup | 1. Launch EcoHarvest Mobile App.<br>2. Complete Customer Registration with delivery address in Colombo.<br>3. Set dietary preference: "100% Certified Organic". | User record created with role `customer`. Session persisted in `AsyncStorage`. Personalized marketplace view loads with local district routing. | |
| **TC-CUS-002** | Marketplace Search, Category & Region Filter | 1. Open `MarketplaceScreen`.<br>2. Type "Avocado" in search bar.<br>3. Filter by Category: "Fruits", Max Price: "LKR 500", District: "Kandy". | Catalog filters listings in real time (<200ms latency). Matching items render with farmer name, unit price, stock availability, and organic badges. | |
| **TC-CUS-003** | SLSI Organic Verification Badge & Profile Audit | 1. Tap on a certified farm card (e.g., "Green Valley Organic Farm").<br>2. Tap the green "SLSI SLS 1324:2018 Certified" shield badge.<br>3. Inspect the verified certificate modal. | Modal opens displaying SLSI Certificate Number, Valid Period, Audit Agency, and verified farm photos. Unverified farms show no shield badge. | |
| **TC-CUS-004** | Real-Time Farmer Direct Messaging & Inquiries | 1. On `FarmerDetailScreen`, tap "Chat with Farmer".<br>2. Type: *"Is the upcoming harvest ready for dispatch this Friday?"*<br>3. Send message. | Message is sent via Socket.io/REST. Real-time hybrid moderation checks text; message delivers instantly to Farmer's chat tab with notification. | |

---

### 2.2 Dynamic Multi-Farm Cart & Stripe Escrow Checkout

| Test ID | Feature Component | Action / Step-by-Step Instructions | Expected Technical Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| **TC-CUS-005** | Multi-Farm Cart Dynamic Partitioning | 1. Add 5 kg Carrots from Farm A (Nuwara Eliya).<br>2. Add 2 kg Strawberries from Farm B (Badulla).<br>3. Open `CartScreen`. | Cart engine groups items into two distinct supplier suborders: "Farm A Subtotal" and "Farm B Subtotal", displaying individual item breakdowns. | |
| **TC-CUS-006** | Distance-Based Delivery & Platform Fee Computation | 1. Review summary breakdown in Cart.<br>2. Change delivery address to an alternate province. | System recalculates multi-point logistics delivery fees based on distance (km) and weight (kg). Line items show: Produce Total, Logistics Fee, and Platform Service Fee. | |
| **TC-CUS-007** | Stripe Escrow Payment Intent (`SUCCEEDED_HELD_IN_ESCROW`) | 1. Tap "Proceed to Secure Escrow Checkout".<br>2. Enter test card details (4242...).<br>3. Authorize payment. | Stripe API creates PaymentIntent with capture hold. Backend confirms transaction, creates Order document with `paymentStatus: "ESCROW_LOCKED"`, and deducts product stock. | |
| **TC-CUS-008** | Multi-Party Order Confirmation & Notification | 1. Complete checkout.<br>2. Observe confirmation screen.<br>3. Verify customer notification drawer and farmer order intake. | Customer receives Order Confirmation with tracking link. Separate push notifications dispatch to Farm A, Farm B, and Admin Audit Ledger simultaneously. | |

---

### 2.3 Real-Time Logistics Tracking & Secure Delivery Handshake OTP

| Test ID | Feature Component | Action / Step-by-Step Instructions | Expected Technical Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| **TC-CUS-009** | Live GPS Logistics Tracking & Route Animation | 1. Open `DeliveryTrackingScreen` for active order.<br>2. Observe map interface and delivery timeline milestones. | Map displays animated driver vehicle icon, route polyline between farm hubs and customer address, dynamic ETA countdown, and driver contact card. | |
| **TC-CUS-010** | 4-Digit Handshake OTP Generation | 1. In `DeliveryTrackingScreen`, inspect the "Delivery Verification" card.<br>2. Verify presence of confidential 4-digit code (e.g., `8492`). | Secure 4-digit OTP is rendered prominently with instruction: *"Provide this code to the delivery driver only after inspecting produce quality at doorstep"*. | |
| **TC-CUS-011** | Doorstep OTP Handshake Execution | 1. Provide 4-digit OTP to driver (or enter in simulator).<br>2. Submit OTP verification request. | Backend validates OTP against database hash. On match, suborders transition to `delivered`, driver status clears, and customer screen updates to "Delivered Successfully". | |
| **TC-CUS-012** | Post-Delivery Produce Review & Quality Rating | 1. Tap "Rate Produce & Farmer" on completed order.<br>2. Select 5-Star Rating.<br>3. Enter review: *"Crisp, truly organic carrots, perfectly packaged"*.<br>4. Submit review. | Review is saved to MongoDB. Farmer's aggregate rating recalculates instantly. Feedback appears on public farm profile. | |

---

## Suite 3: Commercial Wholesale Bulk Buyer Persona (Mobile Client)

### 3.1 Bulk Buyer Subscription & Institutional Portal

| Test ID | Feature Component | Action / Step-by-Step Instructions | Expected Technical Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| **TC-BLK-001** | Bulk Buyer Pro Subscription Activation | 1. Log in as a Commercial/Restaurant Buyer.<br>2. Navigate to "Bulk Pro Tier" in Profile.<br>3. Select LKR 500/month recurring plan.<br>4. Complete Stripe subscription checkout. | Stripe creates recurring customer subscription (`/api/stripe/create-subscription`). User role upgrades to `bulk_buyer_pro`. Pro wholesale features unlock immediately. | |
| **TC-BLK-002** | B2B Wholesale Tiered Discount Calculation | 1. Navigate to `BulkOrdersScreen`.<br>2. Select a wholesale certified listing with tiered pricing.<br>3. Set order quantity to 150 kg. | Pricing engine automatically applies 20% institutional volume discount. Order summary reflects wholesale unit rate vs standard retail unit rate. | |

---

### 3.2 Multimodal AI Handwritten Procurement Notebook OCR (Qwen2-VL & Gemini)

| Test ID | Feature Component | Action / Step-by-Step Instructions | Expected Technical Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| **TC-BLK-003** | Handwritten Notebook Capture & Upload | 1. In `BulkOrdersScreen`, tap "Scan Handwritten Procurement List".<br>2. Capture a photo of a handwritten kitchen grocery notebook (e.g., *"Carrot 25kg, Leeks 15kg, Green Chilli 500g, Big Onion 50kg"*).<br>3. Confirm image selection. | Client compresses image, generates base64/multipart stream, and dispatches to `/api/ai/extract-handwritten-list`. | |
| **TC-BLK-004** | Multimodal OCR Extraction (Qwen2-VL / Gemini Vision) | 1. Submit scanned notebook image for processing.<br>2. Wait for AI inference completion. | Vision model parses handwritten text, extracts crop names, standardizes units (`kg`, `g`, `bundles`), and returns structured JSON payload with >90% OCR precision. | |
| **TC-BLK-005** | Parsing Error Handling & Interactive OCR Correction | 1. Review the generated list in the interactive preview table.<br>2. Observe any ambiguous item highlighted in yellow.<br>3. Tap item to manually edit quantity from `50g` to `500g`. | UI permits instantaneous inline editing of extracted crop records before dispatching quotation search to the database. | |
| **TC-BLK-006** | Multi-Farm Inventory Matching & Quotation Synthesis | 1. Tap "Find Certified Organic Suppliers for List".<br>2. System scans all verified farm catalogs in database. | System maps each requested crop to the lowest-price verified organic farm with sufficient stock, generating a single aggregated multi-farm bulk quotation. | |
| **TC-BLK-007** | One-Tap Institutional Escrow Order Placement | 1. Review consolidated multi-farm quotation (Total: LKR 48,500).<br>2. Tap "Confirm & Lock Escrow Payment".<br>3. Authorize via B2B Stripe corporate billing. | Backend creates multi-vendor wholesale order, locks total in Stripe escrow, and alerts each supplier farm with custom packaging slips. | |

---

## Suite 4: System Administrator Governance Command Center (Expo Web Admin)

### 4.1 Screen A-01: Ecosystem Governance & Telemetry Analytics

| Test ID | Feature Component | Action / Step-by-Step Instructions | Expected Technical Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| **TC-ADM-001** | Admin Authentication & RBAC Guard | 1. Access Admin Web Portal at `http://localhost:8081/admin` (or production URL).<br>2. Attempt access without admin token.<br>3. Log in with root administrator credentials. | Unauthenticated requests redirect to login (`401/403`). Valid login generates Admin JWT session and unlocks full Governance Command Center tabs. | |
| **TC-ADM-002** | Real-Time Ecosystem KPI Telemetry | 1. Open `EcosystemAnalyticsTab` (Screen A-01).<br>2. Inspect Total Platform GMV, Active Escrow Balance, Verified Farm Count, and Daily Transaction Volume. | Metrics accurately reflect aggregated MongoDB collections in real time with zero calculation discrepancy against Stripe balances. | |
| **TC-ADM-003** | Multi-District Agricultural Volume Heatmap | 1. Scroll to Regional Distribution Map on Screen A-01.<br>2. Hover over Central, Uva, and Western provinces. | Interactive map highlights supply vs demand density per district, showing top producing and consuming zones with live order tallies. | |

---

### 4.2 Screen A-02: SLSI Organic Farm Verification Desk

| Test ID | Feature Component | Action / Step-by-Step Instructions | Expected Technical Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| **TC-ADM-004** | Pending Certification Queue Triage | 1. Open `VerificationDeskTab` (Screen A-02).<br>2. Filter queue by status: "Pending Audit". | Displays all farmer onboarding applications awaiting SLSI verification with submission timestamps, farm names, and certificate previews. | |
| **TC-ADM-005** | SLSI Document Audit & Expiry Validation | 1. Click on pending applicant "Highland Organic Ltd".<br>2. Inspect uploaded SLS 1324:2018 PDF certificate in high-resolution viewer.<br>3. Cross-reference Certificate Registration Number against SLSI registry date. | Document viewer displays clear scan. Verification controls allow zooming, metadata inspection, and validity date confirmation. | |
| **TC-ADM-006** | Farm Approval & Storefront Activation | 1. Click "Approve SLSI Certificate & Activate Farm".<br>2. Confirm action in modal dialog. | Backend executes `PATCH /api/admin/verify-farmer/:id` with `{ status: "APPROVED" }`. Farmer receives push notification; public storefront unlocks immediately with organic shield badge. | |
| **TC-ADM-007** | Certificate Rejection & Deficiency Notice | 1. Click "Reject Application" for an invalid/expired submission.<br>2. Select Reason: "Expired SLSI Certificate" and type note: *"Please upload valid 2026 renewal document"*.<br>3. Confirm rejection. | Status updates to `REJECTED`. Audit log records rejection reason. Farmer receives actionable alert with link to re-upload documents. | |

---

### 4.3 Screen A-03: Escrow Ledger & Logistics Real-Time Pipeline

| Test ID | Feature Component | Action / Step-by-Step Instructions | Expected Technical Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| **TC-ADM-008** | Escrow Funds Ledger Audit | 1. Open `EscrowLogisticsTab` (Screen A-03).<br>2. Inspect Live Escrow Ledger table.<br>3. Filter by Status: `LOCKED`, `RELEASED`, `REFUNDED`. | Every active escrow hold is listed with Order ID, Customer Name, Farmer Name, Escrow Amount (LKR), Stripe PaymentIntent ID, and current lock status. | |
| **TC-ADM-009** | Live Logistics Simulator Fleet Inspection | 1. In Screen A-03, navigate to "Live Deliveries & Simulator Pipeline".<br>2. Click on an active in-transit delivery route. | Modal displays live driver coordinates, speed, route progression %, destination address, and real-time status (`ASSIGNED` -> `PICKED_UP` -> `IN_TRANSIT`). | |
| **TC-ADM-010** | Emergency Escrow Fund Freeze | 1. Identify an order flagged for suspected fraud or major quality dispute.<br>2. Click "Emergency Freeze Escrow".<br>3. Enter audit reason. | Backend locks Stripe PaymentIntent capture, flags Order as `ESCROW_FROZEN`, and prevents automated payout release even upon OTP entry. | |
| **TC-ADM-011** | Administrative Handshake OTP Override | 1. For a driver experiencing network failure at doorstep with verified physical delivery, click "Admin Manual Delivery Override".<br>2. Enter supervisor credentials and confirm. | Order transitions to `delivered`, escrow releases to farmer bank account, and an immutable entry is written to the Admin Audit Log. | |

---

### 4.4 Screen A-04: Hybrid Real-Time Content Moderation Engine

| Test ID | Feature Component | Action / Step-by-Step Instructions | Expected Technical Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| **TC-ADM-012** | Regex Rule-Based Prohibited Keyword Filtering | 1. In customer-to-farmer chat, post message with off-platform transaction attempt (e.g., *"Call my personal number 0771234567 to pay cash off-platform"*). | Regex filter intercepts message instantly. Message is blocked or masked with `[BLOCKED BY POLICY]`, and flagged in Admin Moderation queue. | |
| **TC-ADM-013** | Gemini Content Policy Engine Toxicity & Harassment Detection | 1. Post a review or message containing abusive or non-compliant content.<br>2. System executes deep AI evaluation via Gemini moderation engine. | Gemini flags message with high toxicity score (`toxicity: 0.96`, `category: harassment`). Message is automatically quarantined. | |
| **TC-ADM-014** | Flagged Message Quarantine & Strike Issuance | 1. Open `ModeratedChatTab` (Screen A-04).<br>2. Inspect flagged message in quarantine table.<br>3. Click "Confirm Violation & Issue Warning Strike". | Offending user's profile receives an administrative strike (`strikeCount + 1`). Warning notification is dispatched to user's device. | |
| **TC-ADM-015** | User / Farmer Temporary Account Suspension | 1. For a user with 3 active strikes, click "Suspend Account for 7 Days".<br>2. Confirm suspension. | User session is revoked; JWT blacklist entry created. Login attempts return `403 Account Suspended until [Date]`. | |

---

### 4.5 Screen A-05: Support Help Desk & Dispute Resolution Desk

| Test ID | Feature Component | Action / Step-by-Step Instructions | Expected Technical Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| **TC-ADM-016** | Support Ticket Intake & Severity Triage | 1. Open `HelpDeskTab` (Screen A-05).<br>2. Review incoming ticket queue.<br>3. Sort by priority (`Critical`, `High`, `Medium`, `Low`). | Tickets display ticket number, requester role, affected Order ID, issue category (Produce Quality, Delayed Delivery, Billing), and SLA timer. | |
| **TC-ADM-017** | Multi-Party Dispute Evidence Audit | 1. Open Dispute Ticket: *"Customer claims damaged strawberries on Order #ORD-9912"*.<br>2. Inspect attached customer photo evidence alongside farmer's harvest VGG16 grading report. | Split-screen interface renders customer doorstep claim photos against original pre-dispatch AI freshness audit logs for fair evaluation. | |
| **TC-ADM-018** | Escrow Refund / Settlement Execution | 1. Admin determines 50% partial refund is warranted for damaged portion.<br>2. Enter partial refund amount (LKR 1,200) and click "Execute Escrow Settlement". | Stripe executes partial refund to customer card and releases remaining balance to farmer. Order status updates to `DISPUTE_RESOLVED`. | |
| **TC-ADM-019** | Audit Trail & Resolution Logging | 1. View Ticket Resolution Log.<br>2. Verify generated report. | System generates tamper-evident audit record with Admin ID, timestamp, refund transaction ID, and full justification notes. | |

---

## Suite 5: Non-Functional, Resilience & Security Edge Cases

| Test ID | Feature Component | Action / Step-by-Step Instructions | Expected Technical Outcome | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| **TC-NFR-001** | Offline State Graceful Degradation | 1. Enable Airplane Mode on mobile device while browsing marketplace.<br>2. Navigate between previously loaded farmer profiles. | App smoothly falls back to cached data in `AsyncStorage`. Displays subtle banner: *"Offline Mode - Showing cached farm data"*; prevents checkout with clear error. | |
| **TC-NFR-002** | Stripe Payment Webhook Timeout Resilience | 1. Simulate network drop during Stripe checkout payment processing.<br>2. Re-establish network after 30 seconds. | Idempotency key on Stripe payment prevents duplicate charges. Webhook listener catches payment confirmation and synchronizes order status correctly. | |
| **TC-NFR-003** | AI Microservice Failover (Qwen2-VL -> Gemini Vision) | 1. Temporarily disconnect local Python Flask microservice (Port 5001).<br>2. Submit a handwritten notebook image in `BulkOrdersScreen`. | Backend detects Python service timeout, automatically triggers fallback route to Google Gemini Flash Vision API, and returns parsed items without user-facing crash. | |
| **TC-NFR-004** | Concurrent Checkout Inventory Race Condition | 1. Two separate customer devices attempt to purchase the remaining 10 kg of an avocado batch at the exact same millisecond. | MongoDB atomic decrement transaction (`$inc: { stock: -qty }` with `{ stock: { $gte: qty } }`) allows first buyer to succeed; second buyer receives *"Insufficient stock available"*. | |
| **TC-NFR-005** | Security Audit: Unauthorized Route Interception | 1. As a regular customer, attempt direct `POST` to `/api/admin/verify-farmer/123` or `/api/orders/payout/release`. | API Gateway intercepts request with RBAC middleware, rejects with `403 Forbidden: Insufficient administrative privileges`, and logs IP security alert. | |

---

### Verification Sign-Off Table

| Role | Name & Title | Signature | Date (DD/MM/YYYY) |
| :--- | :--- | :--- | :--- |
| **Lead QA Architect** | ___________________________ | ___________________________ | _____ / _____ / 2026 |
| **Lead Full-Stack Engineer** | ___________________________ | ___________________________ | _____ / _____ / 2026 |
| **System Auditor / Evaluator**| ___________________________ | ___________________________ | _____ / _____ / 2026 |
