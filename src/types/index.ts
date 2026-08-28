// src/types/index.ts

export type CropCategory = 'Vegetables' | 'Fruits' | 'Grains' | 'Spices';

// The Farmer-First redesign talks about "Products" (a farm's listings)
// rather than a flat crop catalog. `Product` is a plain alias for `Crop` —
// same shape, same storage.ts helpers — so new farm-profile screens can use
// the more natural name without a parallel type or a data migration.
export type Product = Crop;

export interface Crop {
  id: string;
  // Join key back to `FarmerProfile.id` — the source of truth for the
  // Farmer-First marketplace (farm profile pages, `getProductsByFarmerId`
  // in storage.ts). `farmName`/`province`/`district`/`city` below stay as
  // denormalized fields (cart/order screens read them without a farmer
  // lookup), but `farmerId` is what links a listing to its actual farm.
  // Optional (rather than required) so it doesn't break existing call
  // sites that predate the Farmer-First model — e.g. storage.ts's
  // `DEMO_VERIFIED_CROP_POOL`, which represents sandbox listings with no
  // real registered farm behind them. All `MOCK_CROPS` entries and any
  // newly published crop should always set it.
  farmerId?: string;
  name: string;
  category: CropCategory;
  pricePerUnit: number; // LKR
  unit: string; // e.g. "1kg"
  imageUrl: string;
  isSLSIVerified: boolean;
  farmName: string;
  province: string;
  district: string;
  city: string;
  lowStockThreshold?: number;
  isActive?: boolean;
  // Bulk-order stock, in kg, used by Screen M-05's handwritten-list matcher
  // (`matchHandwrittenListToVerifiedFarmers` in storage.ts) to check a
  // requested quantity against what the farmer actually has on hand.
  // Optional because most crops are published without a bulk stock figure
  // (Screen M-02 doesn't collect it yet) — undefined is treated as
  // unconstrained/demo stock rather than "0kg available".
  availableQtyKg?: number;
}

// ---------------------------------------------------------------------------
// Screen M-02: Farmer Profile & SLSI Verification (persisted onboarding)
// ---------------------------------------------------------------------------

/**
 * SLSI verification lifecycle. Uploading a certificate moves a farmer from
 * `UNVERIFIED` to `PENDING_VERIFICATION`. From there, `VERIFIED` or
 * `REJECTED` is set by an admin reviewing the application on Screen A-01
 * (`AdminVerificationDeskScreen` — see `updateVerificationStatus` in
 * storage.ts), which also mirrors its decision onto the on-device
 * `FarmerProfile` so the Farmer Portal (`FarmerOnboardingScreen`) reflects
 * it on next focus. Both `VERIFIED` and `REJECTED` remain reachable from the
 * Screen M-02 Developer Sandbox toolbar too, for testing without going
 * through the admin desk.
 */
export type VerificationStatus =
  | 'UNVERIFIED'
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'REJECTED';

export interface BankDetails {
  bankName: string;
  branchCode: string;
  accountNumber: string;
  accountHolderName: string;
}

/**
 * Persisted farmer identity, payout routing, and SLSI verification state,
 * collected once during Screen M-02 onboarding and reused on every
 * subsequent visit (see `getFarmerProfile` / `hasCompletedFarmerOnboarding`
 * in storage.ts) instead of re-asking for the same details every time.
 *
 * `verificationStatus` is the source of truth for SLSI status.
 * `isSLSIVerified` is a denormalized boolean mirror of
 * `verificationStatus === 'VERIFIED'`, kept so `publishCrop` (storage.ts)
 * and the `Crop`/marketplace UI can keep reading a plain boolean without
 * needing to know about the enum's other states.
 *
 * `commissionRate` is the active EcoHarvest marketplace commission
 * percentage for this farmer (e.g. `5` or `2.5`). It defaults to `5` for
 * any profile that hasn't been through an admin decision yet, and is kept
 * in sync with `verificationStatus` by `updateVerificationStatus`
 * (storage.ts, Screen A-01's admin override) and by the Screen M-02
 * Developer Sandbox toggles: `VERIFIED` -> `2.5`, everything else -> `5`.
 */
export interface FarmerProfile {
  id: string;
  legalName: string;
  mobileNumber: string;
  farmName: string;
  province: string;
  district: string;
  city: string;
  bankDetails: BankDetails;
  slsiCertificateUri: string | null;
  verificationStatus: VerificationStatus;
  isSLSIVerified: boolean;
  commissionRate?: number;
  rejectionReason?: string;
  // ---- Farmer-First public profile fields (farm profile page header) ----
  // Hero/banner image for the farm's public profile page. Optional because
  // on-device profiles created before this field existed (and any farmer
  // who hasn't uploaded a cover yet) won't have one — screens should fall
  // back to a placeholder image rather than assume it's set.
  farmCoverPhotoUrl?: string;
  // Short "About this farm" blurb shown under the cover photo. Optional for
  // the same reason as `farmCoverPhotoUrl`.
  description?: string;
}

// ---------------------------------------------------------------------------
// Profile Tab: First-Time Onboarding & Registration (Customer side)
// ---------------------------------------------------------------------------

/**
 * The two subscription tiers offered during "Register as Customer"
 * onboarding on the Profile tab. `STANDARD` is the default retail
 * experience; `BULK_ACCESS` additionally unlocks Screen M-05's AI Bulk
 * Orders workspace (BulkOrdersScreen) for restaurants/retailers/processors
 * placing recurring volume orders.
 */
export type SubscriptionPlan = 'STANDARD' | 'BULK_ACCESS';

/**
 * Persisted customer identity + subscription choice, collected once during
 * the Profile tab's first-time "Register as Customer" flow (see
 * `getUserProfile` / `saveUserProfile` in storage.ts) and reused on every
 * subsequent visit instead of re-asking for the same details every time —
 * same pattern as `FarmerProfile` on the farmer side.
 */
export interface CustomerProfile {
  id: string;
  fullName: string;
  phoneNumber: string;
  city: string;
  district: string;
  subscriptionPlan: SubscriptionPlan;
  favoriteFarmerIds?: string[];
  createdAt: string; // ISO timestamp
}

export interface CartItem {
  cropId: string;
  name: string;
  pricePerUnit: number;
  unit: string;
  quantity: number;
  imageUrl: string;
  // Denormalized farm info so Screen M-03 can group line items by farmer
  // without a second lookup against the (possibly changed) crop catalog.
  farmName: string;
  province: string;
  district: string;
  city: string;
  // Join key back to `FarmerProfile.id` (same field as `Crop.farmerId`,
  // copied in at `addToCart` time). Optional for the same reason
  // `Crop.farmerId` is optional — sandbox/demo crops with no real farm
  // behind them won't have one. Lets `ReviewModal` attach a submitted
  // review to the correct farm (`ProductReview.farmerId`) via
  // `order.items[0].farmerId` without a second crop lookup.
  farmerId?: string;
}

/**
 * One farmer's items within the cart, plus the derived routing distance
 * shown in the Farm Group Header ("Nuwara Eliya • 12.4 km routing distance").
 */
export interface FarmGroup {
  farmName: string;
  province: string;
  district: string;
  city: string;
  distanceKm: number;
  items: CartItem[];
  subtotal: number;
  farmerId?: string;
}

/**
 * Non-sensitive payment metadata persisted with the order. The full card
 * number/CVC are validated client-side (Stripe test mode) and are never
 * stored — only a masked last4 + brand guess are kept for order history.
 */
export interface PaymentDetails {
  cardBrand: string;
  cardLast4: string;
  expiry: string; // MM/YY
  postalCode: string;
}

export interface OrderSummary {
  itemsSubtotal: number;
  deliveryFee: number;
  deliveryFeeLabel: string; // e.g. "LKR 250", "Free", "50% Off"
  wholesaleDiscount: number;
  wholesaleDiscountPercent: number; // 0, 10, or 15
  grandTotal: number;
}

export type OrderStatus = 'placed' | 'confirmed' | 'in_transit' | 'delivered' | 'cancelled';

export interface Order {
  id: string;
  items: CartItem[];
  farmGroups: FarmGroup[];
  summary: OrderSummary;
  payment: PaymentDetails;
  status: OrderStatus;
  createdAt: string; // ISO timestamp
  isReviewed?: boolean;
  customerId?: string;
  escrowStatus?: string;
}

export interface LocationFilter {
  province: string | null;
  district: string | null;
  city: string | null;
}

export interface PriceRange {
  min: number;
  max: number;
}

export interface FilterState {
  categories: CropCategory[];
  location: LocationFilter;
  verifiedOnly: boolean;
  priceRange: PriceRange;
}

export const DEFAULT_PRICE_RANGE: PriceRange = { min: 0, max: 2000 };

export const DEFAULT_FILTER_STATE: FilterState = {
  categories: [],
  location: { province: null, district: null, city: null },
  verifiedOnly: false,
  priceRange: { ...DEFAULT_PRICE_RANGE },
};

// ---------------------------------------------------------------------------
// Screen M-04: Uber Developer Sandbox Live Delivery Tracking
// ---------------------------------------------------------------------------

/**
 * Fine-grained delivery state machine driven by the Screen M-04 sandbox
 * simulation controls. This is intentionally more granular than
 * `OrderStatus` above (which the Orders tab / M-03 checkout use) — storage.ts
 * keeps the two in sync via `toOrderStatus` so neither screen has to know
 * about the other's model.
 */
export type DeliveryStatus =
  | 'ORDER_PLACED'
  | 'COURIER_ASSIGNED'
  | 'COURIER_AT_PICKUP'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED';

export interface GeoCoordinate {
  latitude: number;
  longitude: number;
}

export interface CourierInfo {
  name: string;
  vehicleType: string; // e.g. "Cool-Van"
  plateNumber: string; // e.g. "WP CBO-4821"
  rating: number; // 4.0 - 5.0
  phone: string; // E.164-ish string usable with tel:
}

/**
 * Full sandbox tracking state for a single order (Section 4 of
 * `Screen M-04.md`): map coordinates, the 4-digit handshake OTP, courier
 * telemetry, and the current delivery status.
 */
export interface DeliveryTrackingData {
  orderId: string;
  status: DeliveryStatus;
  otp: string; // 4-digit handshake OTP shown to the courier on delivery
  courier: CourierInfo;
  farmCoordinate: GeoCoordinate;
  buyerCoordinate: GeoCoordinate;
  courierCoordinate: GeoCoordinate; // interpolates from farm -> buyer while IN_TRANSIT
  etaMinutes: number;
}

// ---------------------------------------------------------------------------
// Screen M-05: AI Bulk Orders Engine (Subscribed Customer Workspace)
// ---------------------------------------------------------------------------

export type BusinessType = 'RESTAURANT' | 'RETAILER' | 'PROCESSOR';

export type SubscriptionFrequency = 'WEEKLY' | 'BI_WEEKLY' | 'MONTHLY';

export type SubscriptionStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED';

/**
 * A recurring bulk-volume contract created via the Screen M-05 AI Bulk
 * Requirement Predictor + Tiered Volume Pricing Matrix. `selectedTier` /
 * `discountPercentage` are derived by `calculateBulkTier` (storage.ts) from
 * `weeklyVolumeKg` at the moment the contract is locked, then frozen onto
 * the record so historical contracts don't silently reprice if the tier
 * table ever changes.
 */
export interface BulkSubscription {
  id: string;
  businessType: BusinessType;
  cropId: string;
  weeklyVolumeKg: number;
  selectedTier: number; // 1 | 2 | 3
  discountPercentage: number;
  frequency: SubscriptionFrequency;
  contractTermMonths: number;
  totalCostPerCycle: number;
  status: SubscriptionStatus;
}

/**
 * One row of the Tiered Volume Pricing Matrix (design.md Section 4.2),
 * returned by `calculateBulkTier`. `tier` is `0` for volumes below the
 * 50kg bulk minimum (not yet eligible for a discounted rate).
 */
export interface BulkTierInfo {
  tier: number; // 0 (below minimum) | 1 | 2 | 3
  label: string;
  minKg: number;
  maxKg: number | null; // null = no upper bound (Tier 3, 250kg+)
  pricePerKg: number;
  discountPercentage: number;
}

// ---------------------------------------------------------------------------
// Screen M-05: Handwritten Bulk Requirement List — OCR + Verified Matching
// ---------------------------------------------------------------------------

/**
 * One row of a handwritten crop-requirement list after OCR/vision parsing
 * (Screen M-05's "AI Vision / OCR Parsing Simulation"), before it's been
 * matched against the verified-farmer catalog. `rawText` preserves the
 * original parsed line (e.g. "50kg Carrot") for the editable-list UI;
 * `cropName` / `requestedQtyKg` are the parsed-out, user-editable fields
 * actually used for matching.
 */
export interface ExtractedListItem {
  id: string;
  rawText: string;
  cropName: string;
  requestedQtyKg: number;
  confidence?: number;
}

/**
 * A successfully matched line item — a requested crop that a SLSI-Verified
 * farmer can fulfil in full. Rendered as a green "Matched & Available" card.
 */
export interface BulkMatchItem {
  cropId: string;
  cropName: string;
  requestedQtyKg: number;
  pricePerKg: number;
  totalPrice: number;
  farmerName: string;
  isVerified: boolean;
}

/**
 * A requested line item that could not be fulfilled by any SLSI-Verified
 * farmer — either nobody verified lists it, only unverified listings exist,
 * or verified stock is short of the requested quantity. `reason` is a
 * ready-to-render explanation for the warning callout card.
 */
export interface UnavailableListItem {
  requestedItem: string;
  requestedQtyKg: number;
  reason: string;
}

/**
 * The full output of `matchHandwrittenListToVerifiedFarmers` (storage.ts):
 * every requested line sorted into either `availableItems` or
 * `unavailableItems`, plus the combined checkout total for the available
 * side only.
 */
export interface BulkMatchResult {
  availableItems: BulkMatchItem[];
  unavailableItems: UnavailableListItem[];
  grandTotal: number;
}

// ---------------------------------------------------------------------------
// Screen M-06: Moderated In-App Chat Messenger
// ---------------------------------------------------------------------------

/**
 * A single message in a Screen M-06 chat thread. `isBlocked` is set by the
 * moderation filter (`checkOffPlatformViolation` in storage.ts) at send
 * time when the message text contains off-platform contact info (a phone
 * number, email, or link) — the message is still persisted (so the thread
 * has a record something was attempted/blocked) but the ChatScreen renders
 * it as a crimson "Message Blocked" alert card instead of a normal bubble.
 */
export interface ChatMessage {
  id: string;
  senderId: string;
  senderRole: 'CUSTOMER' | 'FARMER';
  text: string;
  isBlocked: boolean;
  blockedReason?: string;
  timestamp: string; // ISO timestamp
}

/**
 * The Transaction Summary Header + Header Bar context for one chat thread
 * (design.md Sections 3.1 and 3.2). Lazily derived from the matching order
 * (see `getChatThread` in storage.ts) the first time a thread is opened,
 * then persisted so it stays stable across re-visits.
 */
export interface ChatThread {
  id: string;
  orderId: string;
  cropSummary: string; // e.g. "100kg Organic Carrots"
  paymentStatus: string; // e.g. "Escrow Locked" / "Pending Payment"
  recipientName: string;
  isVerified: boolean;
  farmerId?: string;
  customerId?: string;
}

// ---------------------------------------------------------------------------
// Screen M-07: Hardware-Restricted Product Review Modal
// ---------------------------------------------------------------------------

export type ReviewQualityTag = 'FRESH' | 'MINOR_ISSUES' | 'DAMAGED';

// Plain alias — `ProductReview` already covers everything a per-farm
// "Review" needs (farmerId, rating, comment, createdAt). Same relationship
// as `Product = Crop` above: same shape, same storage.ts helpers, just the
// more natural name for code (like the farm-rating helpers below) that
// talks about "reviews" in general rather than Screen M-07 specifically.
export type Review = ProductReview;

/**
 * A single customer review of a delivered order (design.md Screen M-07).
 * Requires a hardware-captured `photoUri` and a derived `aiFreshnessScore`
 * before it can be submitted (enforced by ReviewModal's submit-button
 * guardrail, Section 4.5) — `submitProductReview` (storage.ts) persists the
 * review and flips the matching `Order.isReviewed` to `true`.
 */
export interface ProductReview {
  id: string;
  orderId: string;
  cropId: string;
  // Join key back to `FarmerProfile.id`, copied from
  // `order.items[0].farmerId` when the review is submitted (see
  // ReviewModal.tsx). Lets `getReviewsByFarmerId`/`getFarmerRating`
  // (storage.ts) aggregate a farm's average star rating for
  // FarmerDetailScreen. Optional — reviews submitted before this field
  // existed, or against orders whose crops had no `farmerId` (e.g. the
  // sandbox demo crop pool), won't have one and are simply excluded from
  // any single farm's rating.
  farmerId?: string;
  rating: number; // 1-5
  qualityTag: ReviewQualityTag;
  photoUri: string;
  aiFreshnessScore: number; // 0-100, mock YOLOv8 pipeline output
  comment?: string;
  createdAt: string; // ISO timestamp
}

// ---------------------------------------------------------------------------
// System Notification Push Matrix (design.md — role-based push alerts)
// ---------------------------------------------------------------------------

/**
 * Which viewport/channel a notification belongs to (design.md Section 2:
 * "Notifications are dynamically routed based on the active viewport
 * context"). Drives both storage filtering (`getNotifications(role)` in
 * storage.ts) and the Role Viewport Switcher tab in `NotificationModal`.
 */
export type NotificationRole = 'CUSTOMER' | 'FARMER';

/**
 * Coarse notification type, used to pick an icon/color in
 * `NotificationModal` and to distinguish the six push events called out in
 * design.md Section 2 (Order Accepted, Dispatch, Recommendation, Low Stock,
 * Bulk Match, and Review Receipt).
 */
export type NotificationCategory =
  | 'ORDER'
  | 'DISPATCH'
  | 'RECOMMENDATION'
  | 'INVENTORY'
  | 'REVIEW'
  | 'BULK_MATCH';

/**
 * A single push notification (design.md Section 3.2, `NotificationModal.tsx`).
 * Persisted centrally (see storage.ts's `@ecoharvest/notifications` key) and
 * shared across both the Customer and Farmer viewports — `role` is what
 * separates the two channels, not two separate storage keys, so the
 * Developer Sandbox toolbar can simulate either channel from one screen.
 */
export interface AppNotification {
  id: string;
  role: NotificationRole;
  title: string;
  message: string;
  body?: string;
  category: NotificationCategory;
  isRead: boolean;
  timestamp: string; // ISO timestamp
}

// ---------------------------------------------------------------------------
// Screen A-01: Verification Request Desk (SLSI Certificate Audit)
// Web-only Desktop Admin Command Panel — architecturally isolated from the
// mobile app's `TabNavigator.tsx` and mobile mode switchers (see design.md
// Section 2). Reuses `BankDetails` and `GeoCoordinate` from above rather
// than redefining bank/coordinate shapes.
// ---------------------------------------------------------------------------

/**
 * Admin-facing decision states for a submitted SLSI application (design.md
 * Section 3). Intentionally a separate, narrower union from the farmer-side
 * `VerificationStatus` above (no `UNVERIFIED` state — a request only exists
 * once a certificate has actually been submitted for review).
 */
export type AdminVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

/**
 * Farm GPS location shown in the Right Profile Pane (design.md Section 2:
 * "Farm GPS Coordinates (Latitude / Longitude) & District"). Extends the
 * plain `GeoCoordinate` used by Screen M-04's delivery tracking with the
 * district label the admin profile sheet also needs.
 */
export interface FarmCoordinates extends GeoCoordinate {
  district: string;
}

/**
 * One row in the Screen A-01 Verification Request queue — a merchant's
 * submitted SLSI certificate application as seen from the Admin Command
 * Panel. `farmerId` is the join key back to the on-device `FarmerProfile.id`
 * (Screen M-02): when `updateVerificationStatus` (storage.ts) resolves an
 * application whose `farmerId` matches the currently-onboarded farmer, it
 * also patches that `FarmerProfile` in place so the Farmer Portal reflects
 * the same `verificationStatus` / `commissionRate` on next focus (design.md
 * Section 3, "Farmer Portal Sync"). For requests seeded by the Developer
 * Sandbox toolbar (`Load Valid SLSI App` / `Load Suspicious App`) that don't
 * correspond to a real on-device profile, that sync step is simply a no-op.
 */
export interface VerificationRequest {
  farmerId: string;
  legalName: string;
  businessRegistrationNo: string;
  mobileNumber: string;
  bankDetails: BankDetails;
  farmCoordinates: FarmCoordinates;
  slsiCertificateUrl: string;
  verificationStatus: AdminVerificationStatus;
  commissionRate: number; // 5 while PENDING/REJECTED, 2.5 once VERIFIED
  rejectionReason?: string;
  submittedAt: string; // ISO timestamp
}

// ---------------------------------------------------------------------------
// Role-based dynamic bottom tab navigation (Customer Mode vs Farmer Mode)
// ---------------------------------------------------------------------------

/**
 * Which bottom-tab layout `TabNavigator` renders. Persisted on-device (see
 * `getActiveMode` / `setActiveMode` / `subscribeToActiveMode` in storage.ts)
 * so a farmer who switches into Farmer Mode from the Profile tab's toggle
 * stays in Farmer Mode across app restarts, the same way `FarmerProfile`
 * itself persists.
 *
 * Intentionally independent of `FarmerProfile.verificationStatus` — an
 * unverified (or not-yet-onboarded) farmer never reaches `'farmer'` mode in
 * the first place (`ProfileScreen` routes them through
 * `FarmerOnboardingScreen` first), but once onboarded, gating individual
 * actions (e.g. publishing while `PENDING_VERIFICATION`) is each Farmer
 * Mode screen's responsibility, not the tab bar's.
 */
export type AppMode = 'customer' | 'farmer';

// Navigation param lists

// The Customer Mode bottom bar (default on first install / for anyone who
// hasn't switched into Farmer Mode).
export type RootTabParamList = {
  Marketplace: undefined;
  Orders: undefined;
  Bulk: undefined;
  Cart: undefined;
  Profile: undefined;
  // Screen M-06: reachable directly from the root tab navigator (e.g. a
  // "Message Farmer" action on Marketplace) in addition to being nested in
  // the Orders stack below. `threadId`, `recipientName`, and `userRole` are
  // all optional — if `threadId` is omitted, ChatScreen/getChatThread
  // (storage.ts) generates a new one and seeds it from `recipientName` and
  // the most recent order. `userRole` picks which side of the conversation
  // ChatScreen renders as (defaults to `'CUSTOMER'`) — the Farmer Portal
  // dashboard (FarmerOnboardingScreen) passes `'FARMER'` when a farmer taps
  // "Reply to Customer" on an inbound inquiry.
  Chat: { threadId?: string; recipientName?: string; userRole?: 'CUSTOMER' | 'FARMER' };
};

// Farmer Mode's five-tab bottom bar (Dashboard / My Products / Orders
// / Messages / Profile).
export type FarmerTabParamList = {
  Dashboard: undefined;
  MyProducts: undefined;
  FarmerOrders: undefined;
  // Reuses ChatScreen (same as `RootTabParamList.Chat` / `OrdersStackParamList.Chat`),
  // just surfaced as its own always-visible tab instead of a hidden root
  // route, since a farmer's primary reason to open Chat *is* to answer
  // customer inquiries rather than an occasional cross-tab action.
  Messages: { userRole?: 'FARMER' | 'CUSTOMER'; chatId?: string } | undefined;
  Profile: undefined;
};

export type MyProductsStackParamList = {
  MyProductsHome: undefined;
  AddProduct: undefined;
};

// Union of both bars' route names, used as the single generic type
// parameter for the one `createBottomTabNavigator` instance in
// TabNavigator.tsx.
export type CombinedTabParamList = RootTabParamList & FarmerTabParamList;

// Marketplace tab is its own stack (same pattern as Cart/Orders/Profile
// below) so the Farmer-First farm directory (MarketplaceScreen) can push
// into a single farm's storefront (FarmerDetailScreen) when a Farm Card is
// tapped, keyed by the farmer's id.
export type MarketplaceStackParamList = {
  MarketplaceHome: undefined;
  FarmerDetailScreen: { farmerId: string; farmName: string };
};

// Cart tab is its own stack so Screen M-03 (cart/checkout) can push into
// Screen M-04 (Uber Sandbox live delivery tracking) after a successful
// Stripe test payment, the same pattern used for the Profile tab's stack.
export type CartStackParamList = {
  CartHome: undefined;
  OrderTracking: { orderId: string };
};

// Orders tab also gets its own stack (same pattern as Cart/Profile) so a
// "Track Delivery" action on an active order in the Orders tab can push
// into the same Screen M-04 implementation without cross-tab navigation
// hacks. "Message Farmer"/"Message Buyer" on an order works the same way,
// pushing into Screen M-06 with the order's context.
export type OrdersStackParamList = {
  OrdersHome: undefined;
  OrderTracking: { orderId: string };
  Chat: { threadId?: string; recipientName?: string; userRole?: 'CUSTOMER' | 'FARMER' };
};

// ---------------------------------------------------------------------------
// Help Desk & Support Ticket System (Customer, Farmer & Admin)
// ---------------------------------------------------------------------------

export type HelpTicketCategory =
  | 'ORDER_DELIVERY'
  | 'PAYMENT_ESCROW'
  | 'CROP_QUALITY'
  | 'SLSI_VERIFICATION'
  | 'ACCOUNT_SETTINGS'
  | 'COMMISSION_PAYOUT'
  | 'APP_FEEDBACK'
  | 'OTHER';

export type HelpTicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type HelpTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface HelpTicketMessage {
  _id?: string;
  senderRole: 'CUSTOMER' | 'FARMER' | 'ADMIN' | 'SYSTEM';
  senderId?: string;
  senderName: string;
  text: string;
  timestamp: string | Date;
}

export interface HelpTicket {
  _id?: string;
  ticketId: string;
  userId: string;
  userName: string;
  userRole: 'CUSTOMER' | 'FARMER';
  userPhone?: string;
  orderId?: string;
  category: HelpTicketCategory;
  subject: string;
  priority: HelpTicketPriority;
  status: HelpTicketStatus;
  messages: HelpTicketMessage[];
  resolutionNotes?: string;
  resolvedAt?: string | Date;
  assignedAdmin?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

// ---------------------------------------------------------------------------
// Bulk Order Process & Chat History
// ---------------------------------------------------------------------------

export interface BulkChatMessage {
  id: string;
  sender: 'AGENT' | 'USER';
  timestamp: string;
  text?: string;
  imageUri?: string;
  isExtractionCard?: boolean;
  isMatchCard?: boolean;
  isConfirmedCard?: boolean;
  items?: ExtractedListItem[];
  matchResult?: BulkMatchResult;
}

export interface BulkOrderSession {
  id: string;
  customerId: string;
  customerName?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: BulkChatMessage[];
  itemsCount: number;
  grandTotal?: number;
  status: 'PENDING' | 'MATCHED' | 'ORDERED';
}