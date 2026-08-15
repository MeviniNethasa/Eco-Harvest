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

// Navigation param lists
export type RootTabParamList = {
  Marketplace: undefined;
  Orders: undefined;
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