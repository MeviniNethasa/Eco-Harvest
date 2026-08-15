// src/types/index.ts

export type CropCategory = 'Vegetables' | 'Fruits' | 'Grains' | 'Spices';

export interface Crop {
  id: string;
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
  // Bulk-order stock, in kg, used by Screen M-05's handwritten-list matcher
  // (`matchHandwrittenListToVerifiedFarmers` in storage.ts) to check a
  // requested quantity against what the farmer actually has on hand.
  // Optional because most crops are published without a bulk stock figure
  // (Screen M-02 doesn't collect it yet) — undefined is treated as
  // unconstrained/demo stock rather than "0kg available".
  availableQtyKg?: number;
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

// Navigation param lists
export type RootTabParamList = {
  Marketplace: undefined;
  Orders: undefined;
  Bulk: undefined;
  Cart: undefined;
  Profile: undefined;
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
// hacks.
export type OrdersStackParamList = {
  OrdersHome: undefined;
  OrderTracking: { orderId: string };
};