# EcoHarvest Desktop Admin Command Panel Specifications (Phase 3)

**Document File:** `design.md`  
**Document Version:** 1.0.0  
**Target Viewport:** 1440px × 900px minimum desktop grid  
**Theme Palette:** Dark Slate (`#0F172A`), Emerald (`#10B981`), Crimson (`#EF4444`)

---

## 1. System Architecture & Layout Grid

The Desktop Admin Panel uses a 240px fixed sidebar and a fluid main workspace (`calc(100vw - 240px)`). Content bounds are strictly constrained to eliminate horizontal scrolling.

```text
+-------------------------------------------------------------+
| Sidebar (240px) | Main Display Workspace                    |
|                 +-------------------------------------------+
| - Verification  | Screen Content Display Area               |
| - Chat Feed     | (Split view / Data grid / Metric cards)   |
| - Escrow        |                                           |
| - Analytics     +-------------------------------------------+
|                 | Sticky Action Footer Bar                  |
+-----------------+-------------------------------------------+

2. Screen Specifications (Part 1)
```markdown
### Screen A-01: Verification Request Desk (SLSI Certificate Audit)
* **Layout Structure: 240px sidebar, split-screen workspace (600px left pane, 600px right pane).

* **Left Inspection Pane: Raw uploaded SLSI certificate document viewer with zoom, rotation (90°), fit-to-width, and pan controls.

* **Right Profile Pane: Summary data sheet displaying merchant profile details:

  * Legal Name & Registration ID

  * Contact Mobile Number (Verified via OTP)

  * Bank Routing Details (Account No, Bank Code, Branch Code)

  * Farm Geolocation Coordinates with interactive map preview

* **Admin Override Actions (Sticky Footer Bar):

  * [ Approve Verification (Set 2-3% Commission) ] – Green button (#10B981)

  * [ Reject Application (Set 5% Commission) ] – Crimson button (#EF4444)

---

### **PART 2 OF 3: Screens A-02, A-03 & A-04**


### Screen A-02: Moderated Chat Interception Feed
* **Layout Structure:** Full-width desktop admin master-detail table view.
* **Flagged Message Ticket Table:**
  * Columns: Ticket ID (e.g. `TCK-88492`), Timestamp, Buyer ID, Farmer ID, Offending Snippet, and Violation Category.
* **Highlighted Text Renderer:**
  * Visual block highlighting detected blacklisted keywords or contact details in crimson fill (`rgba(239, 68, 68, 0.2)`).
* **Admin Governance Controls:**
  * `[ Allow Message Override ]` – Releases message to recipient.
  * `[ Warn / Suspend Merchant Profile ]` – Triggers account suspension.

---

### Screen A-03: Active Escrow Ledger & Uber Logistics Tracker
* **Layout Structure:** Desktop command data table with expandable drawer.
* **Master Escrow Table:**
  * Columns: Master Stripe Payment Intent ID, Child Supplier Order IDs, Escrow Hold Total (LKR), Uber Sandbox Delivery Status badge, Handshake OTP State.
* **Manual System Override Bar (Sticky Action Bar):**
  * `[ Force Transfer Release ]` – Bypasses stuck transport loops to pay farmer.
  * `[ Trigger Stripe Refund ]` – Executes client refund on failed deliveries.

---

### Screen A-04: Ecosystem Health & Analytics Dashboard
* **Layout Structure:** 4-column metric card summary header above a split 2-column analytics chart grid.
* **Metric Cards Header:**
  1. Total Daily Volume: Real-time LKR turnover processed.
  2. Active Subscriptions: Count of active paid monthly accounts.
  3. AI Freshness Index: Mean YOLOv8 freshness baseline score.
  4. Open Support Tickets: Active escrow disputes & moderation flag queue.
* **Supply & Demand Gap Map:** Regional Sri Lanka map visualization plotting real-time low-stock alerts against customer bulk requirement extraction locations.


## 3. Component Style Tokens & Design Variables

```scss
// Brand & System Palette Tokens
$bg-admin-dark:       #0F172A; // Slate 900
$bg-panel-dark:       #1E293B; // Slate 800
$bg-surface-border:   #334155; // Slate 700
$color-brand-emerald: #10B981; // Success Accent
$color-alert-crimson: #EF4444; // Warning & Rejection
$color-text-main:     #F8FAFC; // Primary Text
$color-text-muted:    #94A3B8; // Secondary Text

// Layout Geometry
$sidebar-width:       240px;
$action-bar-height:   64px;
$card-border-radius:   8px;

##  4. Admin Portal API Contracts

GET /api/admin/verifications — List pending SLSI merchant applications.

POST /api/admin/verifications/:id/approve — Set commission rate (2–3%) and verify account.

POST /api/admin/verifications/:id/reject — Reject application and revert to 5% commission.

GET /api/admin/moderation/chats — Fetch flagged chat interception tickets.

POST /api/admin/moderation/override — Allow message transmission or issue user suspension.

GET /api/admin/escrow/ledger — Fetch active master Stripe payment intents and Uber logistics statuses.

POST /api/admin/escrow/force-release — Bypass delivery triggers and dispatch funds to merchant bank accounts.

POST /api/admin/escrow/refund — Issue full client-side refund via Stripe.

GET /api/admin/analytics/health — Retrieve platform KPI summaries and regional map coordinates.
