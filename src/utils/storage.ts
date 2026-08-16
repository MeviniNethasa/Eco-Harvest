// src/utils/storage.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AppNotification,
  BulkMatchItem,
  BulkMatchResult,
  BulkSubscription,
  BulkTierInfo,
  CartItem,
  ChatMessage,
  ChatThread,
  CourierInfo,
  Crop,
  DeliveryStatus,
  DeliveryTrackingData,
  ExtractedListItem,
  FarmerProfile,
  FarmGroup,
  GeoCoordinate,
  NotificationRole,
  Order,
  OrderStatus,
  OrderSummary,
  PaymentDetails,
  ProductReview,
  UnavailableListItem,
} from '../types';

const CART_STORAGE_KEY = '@ecoharvest/cart';
const CROPS_STORAGE_KEY = '@ecoharvest/crops';
const FARMER_PROFILE_STORAGE_KEY = '@ecoharvest/farmer-profile';
const ORDERS_STORAGE_KEY = '@ecoharvest/orders';
const TRACKING_STORAGE_KEY = '@ecoharvest/delivery-tracking';
const SUBSCRIPTIONS_STORAGE_KEY = '@ecoharvest/bulk-subscriptions';
const CHAT_MESSAGES_STORAGE_KEY = '@ecoharvest/chat-messages';
const CHAT_THREADS_STORAGE_KEY = '@ecoharvest/chat-threads';
const REVIEWS_STORAGE_KEY = '@ecoharvest/product-reviews';
const NOTIFICATIONS_STORAGE_KEY = '@ecoharvest/notifications';

/**
 * Simple pub/sub (same pattern as the crop listeners further down) so the
 * bottom tab bar badge can update immediately whenever the cart changes,
 * even when the change happens from a screen nested deeper in the Cart
 * stack (e.g. checkout clearing the cart) rather than the Cart tab itself
 * regaining focus.
 */
type CartListener = (cart: CartItem[]) => void;
const cartListeners = new Set<CartListener>();

function notifyCartListeners(cart: CartItem[]): void {
  cartListeners.forEach((listener) => listener(cart));
}

/**
 * Subscribe to real-time cart updates. Returns an unsubscribe function.
 */
export function subscribeToCart(listener: CartListener): () => void {
  cartListeners.add(listener);
  return () => cartListeners.delete(listener);
}

/**
 * Retrieve the full cart from AsyncStorage.
 */
export async function getCart(): Promise<CartItem[]> {
  try {
    const raw = await AsyncStorage.getItem(CART_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch (error) {
    console.error('Failed to read cart from storage:', error);
    return [];
  }
}

/**
 * Persist the full cart array to AsyncStorage.
 */
async function saveCart(cart: CartItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    notifyCartListeners(cart);
  } catch (error) {
    console.error('Failed to save cart to storage:', error);
  }
}

/**
 * Add a crop to the cart, or increment its quantity if it already exists.
 */
export async function addToCart(crop: Crop, quantity: number): Promise<CartItem[]> {
  const cart = await getCart();
  const existingIndex = cart.findIndex((item) => item.cropId === crop.id);

  if (existingIndex >= 0) {
    cart[existingIndex] = {
      ...cart[existingIndex],
      quantity: cart[existingIndex].quantity + quantity,
    };
  } else {
    cart.push({
      cropId: crop.id,
      name: crop.name,
      pricePerUnit: crop.pricePerUnit,
      unit: crop.unit,
      quantity,
      imageUrl: crop.imageUrl,
      farmName: crop.farmName,
      province: crop.province,
      district: crop.district,
      city: crop.city,
    });
  }

  await saveCart(cart);
  return cart;
}

/**
 * Update the quantity of a specific cart item. Removes the item if quantity <= 0.
 */
export async function updateCartQuantity(
  cropId: string,
  quantity: number
): Promise<CartItem[]> {
  let cart = await getCart();

  if (quantity <= 0) {
    cart = cart.filter((item) => item.cropId !== cropId);
  } else {
    cart = cart.map((item) =>
      item.cropId === cropId ? { ...item, quantity } : item
    );
  }

  await saveCart(cart);
  return cart;
}

/**
 * Remove a single item from the cart entirely.
 */
export async function removeFromCart(cropId: string): Promise<CartItem[]> {
  const cart = await getCart();
  const updated = cart.filter((item) => item.cropId !== cropId);
  await saveCart(updated);
  return updated;
}

/**
 * Clear the entire cart.
 */
export async function clearCart(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CART_STORAGE_KEY);
    notifyCartListeners([]);
  } catch (error) {
    console.error('Failed to clear cart:', error);
  }
}

/**
 * Get the total number of items (sum of quantities) in the cart — used for the tab badge.
 */
export async function getCartCount(): Promise<number> {
  const cart = await getCart();
  return cart.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Get the total price of all items in the cart.
 */
export async function getCartTotal(): Promise<number> {
  const cart = await getCart();
  return cart.reduce((sum, item) => sum + item.pricePerUnit * item.quantity, 0);
}

// ---------------------------------------------------------------------------
// Crops (Screen M-02 publisher -> Screen M-01 marketplace)
// ---------------------------------------------------------------------------

/**
 * Simple pub/sub so any mounted screen (e.g. MarketplaceScreen / Screen M-01)
 * can react immediately when a crop is published/updated/removed, without a
 * global state library. Screens call `subscribeToCrops` in a `useEffect` (or
 * pair it with `useFocusEffect` — see the usage note below `subscribeToCrops`)
 * and get the full, current crop list pushed to them on every change.
 */
type CropListener = (crops: Crop[]) => void;
const cropListeners = new Set<CropListener>();

function notifyCropListeners(crops: Crop[]): void {
  cropListeners.forEach((listener) => listener(crops));
}

/**
 * Subscribe to real-time crop list updates. Returns an unsubscribe function.
 *
 * Typical usage in MarketplaceScreen (Screen M-01):
 *
 *   import { useFocusEffect } from '@react-navigation/native';
 *   import { getCrops, subscribeToCrops } from '../utils/storage';
 *
 *   const [crops, setCrops] = useState<Crop[]>([]);
 *
 *   // Catch up whenever the tab regains focus (e.g. right after publishing).
 *   useFocusEffect(
 *     useCallback(() => {
 *       getCrops().then(setCrops);
 *     }, [])
 *   );
 *
 *   // Stay live while mounted too, in case a crop changes without a focus
 *   // event in between (e.g. a future background sync).
 *   useEffect(() => {
 *     const unsubscribe = subscribeToCrops(setCrops);
 *     return unsubscribe;
 *   }, []);
 */
export function subscribeToCrops(listener: CropListener): () => void {
  cropListeners.add(listener);
  return () => cropListeners.delete(listener);
}

/**
 * Retrieve the full crop catalog from AsyncStorage.
 */
export async function getCrops(): Promise<Crop[]> {
  try {
    const raw = await AsyncStorage.getItem(CROPS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Crop[]) : [];
  } catch (error) {
    console.error('Failed to read crops from storage:', error);
    return [];
  }
}

/**
 * Persist the full crop array and notify all live subscribers.
 * Throws on failure — callers (e.g. publishCrop) must not treat a failed
 * write as success, since that would leave listeners un-notified while the
 * UI still reports "published".
 */
async function saveCrops(crops: Crop[]): Promise<void> {
  await AsyncStorage.setItem(CROPS_STORAGE_KEY, JSON.stringify(crops));
  notifyCropListeners(crops);
}

/**
 * Publishing entry point for Screen M-02's "Publish Crop Listing" action.
 * Generates a guaranteed-unique id itself (ignoring/overwriting any `id`
 * the caller may have set) so ID assignment has one source of truth,
 * prepends the new crop, persists it, and pushes the updated list to every
 * subscriber (e.g. MarketplaceScreen) so it shows up immediately.
 *
 * Throws if the save fails — callers should catch this and inform the user
 * rather than assuming success.
 */
/**
 * Publishing entry point for Screen M-02's "Publish Crop Listing" action.
 * Generates a guaranteed-unique id itself (single source of truth for IDs),
 * and — critically — derives `isSLSIVerified` from the farmer's *saved*
 * `FarmerProfile.verificationStatus` rather than trusting a caller-supplied
 * flag. This is why `isSLSIVerified` isn't part of `cropInput`'s type at
 * all: a crop can only ever be flagged verified because the farmer's
 * profile is actually `'VERIFIED'`, never because a screen happened to pass
 * `true`. Prepends the new crop, persists it, and pushes the updated list
 * to every subscriber (e.g. MarketplaceScreen) so it shows up immediately.
 *
 * Throws if the save fails — callers should catch this and inform the user
 * rather than assuming success.
 */
export async function publishCrop(
  cropInput: Omit<Crop, 'id' | 'isSLSIVerified'>
): Promise<Crop[]> {
  const profile = await getFarmerProfile();
  const isSLSIVerified = profile?.verificationStatus === 'VERIFIED';
  const crop: Crop = { ...cropInput, id: generateCropId(), isSLSIVerified };
  const existing = await getCrops();
  const updated = [crop, ...existing];
  await saveCrops(updated);
  return updated;
}

/**
 * Update an existing crop (e.g. price or stock-threshold edits) in place.
 * Throws on failure — see saveCrops.
 */
export async function updateCrop(cropId: string, patch: Partial<Crop>): Promise<Crop[]> {
  const existing = await getCrops();
  const updated = existing.map((c) => (c.id === cropId ? { ...c, ...patch } : c));
  await saveCrops(updated);
  return updated;
}

/**
 * Remove a crop from the catalog (e.g. delisting).
 * Throws on failure — see saveCrops.
 */
export async function removeCrop(cropId: string): Promise<Crop[]> {
  const existing = await getCrops();
  const updated = existing.filter((c) => c.id !== cropId);
  await saveCrops(updated);
  return updated;
}

/**
 * Clear the entire crop catalog (useful for resetting demo data).
 */
export async function clearCrops(): Promise<void> {
  await AsyncStorage.removeItem(CROPS_STORAGE_KEY);
  notifyCropListeners([]);
}

/**
 * Generates a reasonably unique id without pulling in a uuid dependency.
 * Good enough for local-storage-backed demo/mock data.
 */
export function generateCropId(): string {
  return `crop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Generates a reasonably unique order id, same approach as generateCropId.
 */
export function generateOrderId(): string {
  return `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Farmer Profile (Screen M-02 onboarding, persisted so it's only done once)
// ---------------------------------------------------------------------------

/**
 * Generates a reasonably unique farmer-profile id, same approach as
 * generateCropId.
 */
export function generateFarmerId(): string {
  return `farmer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Retrieve the persisted farmer profile, or `null` if the farmer has never
 * completed onboarding. `null` is the signal Screen M-02 uses to decide
 * between rendering the Onboarding Form vs. the Farmer Dashboard.
 */
export async function getFarmerProfile(): Promise<FarmerProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(FARMER_PROFILE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FarmerProfile) : null;
  } catch (error) {
    console.error('Failed to read farmer profile from storage:', error);
    return null;
  }
}

/**
 * Persist the farmer profile (creation on first-time onboarding, or an
 * update via "Edit Profile Details"). Always re-derives `isSLSIVerified`
 * from `verificationStatus` before saving, so the two fields can never end
 * up out of sync no matter what the caller passed in.
 *
 * Throws on failure — callers should catch this and inform the user rather
 * than assuming success (same convention as saveCrops/publishCrop).
 */
export async function saveFarmerProfile(profile: FarmerProfile): Promise<FarmerProfile> {
  const normalized: FarmerProfile = {
    ...profile,
    isSLSIVerified: profile.verificationStatus === 'VERIFIED',
  };
  await AsyncStorage.setItem(FARMER_PROFILE_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

/**
 * Convenience check for "has this farmer finished onboarding at least
 * once?" — used by Screen M-02 to decide whether to skip straight to the
 * Farmer Dashboard.
 */
export async function hasCompletedFarmerOnboarding(): Promise<boolean> {
  const profile = await getFarmerProfile();
  return profile !== null;
}

/**
 * Clears the saved farmer profile entirely. Backs the Developer Sandbox's
 * "Reset Onboarding" control so the first-time onboarding flow can be
 * re-tested without reinstalling the app.
 */
export async function clearFarmerProfile(): Promise<void> {
  await AsyncStorage.removeItem(FARMER_PROFILE_STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Cart grouping, pricing, and order creation (Screen M-03)
// ---------------------------------------------------------------------------

/**
 * Fallback routing distance (km) used whenever a cart item is missing
 * farm/location data — e.g. items persisted before `farmName` etc. were
 * added to `CartItem`, or malformed AsyncStorage data.
 */
const FALLBACK_DISTANCE_KM = 10.0;
const FALLBACK_FARM_NAME = 'Unknown Farm';
const FALLBACK_LOCATION = 'Unknown';

/**
 * Deterministically derives a mock routing distance (km) for a farm from its
 * name, so the same farm always shows the same distance in the UI without
 * needing real geocoding/routing data wired up yet. Range: ~2.0–24.9 km.
 *
 * Defensive: if `farmName` is missing, not a string, or empty, this returns
 * `FALLBACK_DISTANCE_KM` instead of touching `.length` on a bad value.
 */
function computeDistanceKm(farmName: string | undefined | null): number {
  if (typeof farmName !== 'string' || farmName.trim().length === 0) {
    return FALLBACK_DISTANCE_KM;
  }

  let hash = 0;
  for (let i = 0; i < farmName.length; i++) {
    hash = (hash * 31 + farmName.charCodeAt(i)) >>> 0;
  }
  const km = 2 + (hash % 230) / 10; // 2.0 - 24.9
  return Math.round(km * 10) / 10;
}

/**
 * Groups the flat cart array into per-farmer sections (Section 4.1 of
 * design.md: "line items explicitly grouped by farmer_id / farmName"),
 * each carrying its own subtotal and routing distance.
 *
 * Defensive: tolerates a null/undefined `cart`, null/undefined entries
 * within it, and items missing `farmName`/`province`/`district`/`city`
 * (e.g. carts saved before those fields existed on `CartItem`). Anything
 * missing falls back to "Unknown Farm" / "Unknown" / 10.0 km rather than
 * throwing, so a stale AsyncStorage payload can never crash this screen.
 */
export function groupCartByFarm(cart: CartItem[] | null | undefined): FarmGroup[] {
  const groups = new Map<string, FarmGroup>();

  if (!Array.isArray(cart)) {
    return [];
  }

  for (const item of cart) {
    if (!item) continue;

    const farmName =
      typeof item.farmName === 'string' && item.farmName.trim().length > 0
        ? item.farmName
        : FALLBACK_FARM_NAME;
    const province =
      typeof item.province === 'string' && item.province.trim().length > 0
        ? item.province
        : FALLBACK_LOCATION;
    const district =
      typeof item.district === 'string' && item.district.trim().length > 0
        ? item.district
        : FALLBACK_LOCATION;
    const city =
      typeof item.city === 'string' && item.city.trim().length > 0
        ? item.city
        : FALLBACK_LOCATION;

    const pricePerUnit = typeof item.pricePerUnit === 'number' ? item.pricePerUnit : 0;
    const quantity = typeof item.quantity === 'number' ? item.quantity : 0;
    const lineTotal = pricePerUnit * quantity;

    // Group unmatched/missing-farm items together under the same fallback
    // key rather than each becoming its own "Unknown Farm" group.
    const key = farmName;

    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      existing.subtotal += lineTotal;
    } else {
      groups.set(key, {
        farmName,
        province,
        district,
        city,
        distanceKm:
          farmName === FALLBACK_FARM_NAME
            ? FALLBACK_DISTANCE_KM
            : computeDistanceKm(farmName),
        items: [item],
        subtotal: lineTotal,
      });
    }
  }

  return Array.from(groups.values());
}

/**
 * Computes the Order Summary card figures (Section 4.2 of design.md):
 * items subtotal, distance-aware delivery fee (with Free / 50% Off
 * subscription-style discount tagging), wholesale volume discount
 * (10%-15% bulk deduction), and the final grand total.
 *
 * Delivery fee: LKR 100 per farm group actually being routed to, scaled by
 * that group's routing distance. Free above LKR 3,000 subtotal, 50% off
 * above LKR 1,500 subtotal.
 *
 * Wholesale discount: 15% at/above LKR 5,000 subtotal, 10% at/above
 * LKR 2,000, otherwise none — matching the "10%-15% bulk deduction" range
 * called out in the spec.
 */
export function calculateOrderSummary(cart: CartItem[]): OrderSummary {
  const farmGroups = groupCartByFarm(cart);
  const itemsSubtotal = farmGroups.reduce((sum, g) => sum + g.subtotal, 0);

  const baseDeliveryFee = farmGroups.reduce(
    (sum, g) => sum + Math.round(20 * g.distanceKm) / 10,
    0
  );

  let deliveryFee = Math.round(baseDeliveryFee);
  let deliveryFeeLabel = `LKR ${deliveryFee.toLocaleString()}`;

  if (itemsSubtotal >= 3000) {
    deliveryFee = 0;
    deliveryFeeLabel = 'Free';
  } else if (itemsSubtotal >= 1500) {
    deliveryFee = Math.round(deliveryFee / 2);
    deliveryFeeLabel = `LKR ${deliveryFee.toLocaleString()} [50% Off]`;
  }

  let wholesaleDiscountPercent = 0;
  if (itemsSubtotal >= 5000) {
    wholesaleDiscountPercent = 15;
  } else if (itemsSubtotal >= 2000) {
    wholesaleDiscountPercent = 10;
  }
  const wholesaleDiscount = Math.round(
    (itemsSubtotal * wholesaleDiscountPercent) / 100
  );

  const grandTotal = itemsSubtotal + deliveryFee - wholesaleDiscount;

  return {
    itemsSubtotal,
    deliveryFee,
    deliveryFeeLabel,
    wholesaleDiscount,
    wholesaleDiscountPercent,
    grandTotal,
  };
}

// ---------------------------------------------------------------------------
// Orders (Screen M-03 checkout -> Screen M-04/Orders tab)
// ---------------------------------------------------------------------------

/**
 * Simple pub/sub (same pattern as crops/cart) so the Orders tab can update
 * live the moment an order is placed, without needing a focus event.
 */
type OrderListener = (orders: Order[]) => void;
const orderListeners = new Set<OrderListener>();

function notifyOrderListeners(orders: Order[]): void {
  orderListeners.forEach((listener) => listener(orders));
}

/**
 * Subscribe to real-time order list updates. Returns an unsubscribe function.
 *
 * Typical usage in OrdersScreen:
 *
 *   useFocusEffect(useCallback(() => { getOrders().then(setOrders); }, []));
 *   useEffect(() => subscribeToOrders(setOrders), []);
 */
export function subscribeToOrders(listener: OrderListener): () => void {
  orderListeners.add(listener);
  return () => orderListeners.delete(listener);
}

/**
 * Retrieve all past orders from AsyncStorage, most recent first.
 */
export async function getOrders(): Promise<Order[]> {
  try {
    const raw = await AsyncStorage.getItem(ORDERS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Order[]) : [];
  } catch (error) {
    console.error('Failed to read orders from storage:', error);
    return [];
  }
}

/**
 * Persist the full orders array and notify all live subscribers.
 * Throws on failure — see saveCrops for the same rationale.
 */
async function saveOrders(orders: Order[]): Promise<void> {
  await AsyncStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
  notifyOrderListeners(orders);
}

/**
 * Fetch a single order by id (used by Screen M-04 to load what it's
 * tracking).
 */
export async function getOrderById(orderId: string): Promise<Order | null> {
  const orders = await getOrders();
  return orders.find((o) => o.id === orderId) ?? null;
}

/**
 * Execution trigger for the Screen M-03 sticky "[ Pay LKR <GrandTotal> via
 * Stripe ]" button: snapshots the current cart into an Order, persists it,
 * clears the cart, and returns the new order so the caller can navigate
 * into Screen M-04 with its id.
 *
 * Throws if the cart is empty or if persisting fails — callers should
 * catch this and keep the user on the checkout screen rather than
 * navigating forward on a failed/empty order.
 */
export async function createOrder(payment: PaymentDetails): Promise<Order> {
  const cart = await getCart();
  if (!Array.isArray(cart) || cart.length === 0) {
    throw new Error('Cannot create an order from an empty cart.');
  }

  const summary = calculateOrderSummary(cart);
  const farmGroups = groupCartByFarm(cart);

  const order: Order = {
    id: generateOrderId(),
    items: cart,
    farmGroups,
    summary,
    payment,
    status: 'placed',
    createdAt: new Date().toISOString(),
  };

  const existingOrders = await getOrders();
  const updatedOrders = [order, ...existingOrders];

  await saveOrders(updatedOrders);
  await clearCart();

  return order;
}

// ---------------------------------------------------------------------------
// Product Reviews (Screen M-07: Hardware-Restricted Product Review Modal)
// ---------------------------------------------------------------------------

/**
 * Simple pub/sub (same pattern as orders/cart/crops above) so any mounted
 * screen can react immediately when a review is submitted, without a
 * global state library.
 */
type ReviewListener = (reviews: ProductReview[]) => void;
const reviewListeners = new Set<ReviewListener>();

function notifyReviewListeners(reviews: ProductReview[]): void {
  reviewListeners.forEach((listener) => listener(reviews));
}

/**
 * Subscribe to real-time review updates. Returns an unsubscribe function.
 */
export function subscribeToReviews(listener: ReviewListener): () => void {
  reviewListeners.add(listener);
  return () => reviewListeners.delete(listener);
}

/**
 * Generates a reasonably unique review id, same approach as
 * generateCropId/generateOrderId.
 */
export function generateReviewId(): string {
  return `review_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Retrieve every persisted product review, regardless of order.
 */
export async function getProductReviews(): Promise<ProductReview[]> {
  try {
    const raw = await AsyncStorage.getItem(REVIEWS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ProductReview[]) : [];
  } catch (error) {
    console.error('Failed to read product reviews from storage:', error);
    return [];
  }
}

async function saveProductReviews(reviews: ProductReview[]): Promise<void> {
  await AsyncStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(reviews));
  notifyReviewListeners(reviews);
}

/**
 * Fetch the review already submitted for an order, if any — used by
 * OrdersScreen to decide between rendering "[ Write Review ]" and
 * "[ Reviewed ✓ ]" without relying solely on the denormalized
 * `Order.isReviewed` flag.
 */
export async function getReviewByOrderId(orderId: string): Promise<ProductReview | null> {
  const reviews = await getProductReviews();
  return reviews.find((r) => r.orderId === orderId) ?? null;
}

/**
 * Persists a Screen M-07 review (replacing any prior review with the same
 * `id`, so a caller can safely retry) and flips the matching order's
 * `isReviewed` to `true` so OrdersScreen's button swaps to
 * "[ Reviewed ✓ ]" on next render without a separate round trip.
 *
 * Throws if `orderId` doesn't match a persisted order, or if either
 * storage write fails — callers should catch this and keep the modal open
 * rather than assuming success.
 */
export async function submitProductReview(review: ProductReview): Promise<ProductReview> {
  const order = await getOrderById(review.orderId);
  if (!order) {
    throw new Error(`submitProductReview: no order found with id "${review.orderId}".`);
  }

  const reviews = await getProductReviews();
  const updatedReviews = [review, ...reviews.filter((r) => r.id !== review.id)];
  await saveProductReviews(updatedReviews);

  const orders = await getOrders();
  const updatedOrders = orders.map((o) =>
    o.id === review.orderId ? { ...o, isReviewed: true } : o
  );
  await saveOrders(updatedOrders);

  return review;
}

// ---------------------------------------------------------------------------
// Delivery tracking (Screen M-04: Uber Developer Sandbox Live Delivery Tracking)
// ---------------------------------------------------------------------------

type TrackingMap = Record<string, DeliveryTrackingData>;

/**
 * Per-order pub/sub (rather than one global listener set like cart/crops/
 * orders above) since DeliveryTrackingScreen only ever cares about a single
 * `orderId` at a time and re-rendering on unrelated orders' sandbox
 * transitions would be wasted work.
 */
type TrackingListener = (tracking: DeliveryTrackingData) => void;
const trackingListeners = new Map<string, Set<TrackingListener>>();

function notifyTrackingListeners(orderId: string, tracking: DeliveryTrackingData): void {
  trackingListeners.get(orderId)?.forEach((listener) => listener(tracking));
}

/**
 * Subscribe to live sandbox tracking updates for one order. Returns an
 * unsubscribe function.
 */
export function subscribeToTracking(
  orderId: string,
  listener: TrackingListener
): () => void {
  if (!trackingListeners.has(orderId)) {
    trackingListeners.set(orderId, new Set());
  }
  trackingListeners.get(orderId)!.add(listener);
  return () => {
    trackingListeners.get(orderId)?.delete(listener);
  };
}

async function getAllTracking(): Promise<TrackingMap> {
  try {
    const raw = await AsyncStorage.getItem(TRACKING_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TrackingMap) : {};
  } catch (error) {
    console.error('Failed to read delivery tracking from storage:', error);
    return {};
  }
}

async function saveAllTracking(map: TrackingMap): Promise<void> {
  try {
    await AsyncStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify(map));
  } catch (error) {
    console.error('Failed to save delivery tracking to storage:', error);
  }
}

// Colombo-area fallback origin. Used whenever we don't have real geocoding
// for a farm/buyer address (this is a sandbox/demo, not a real routing
// integration), so the map always centers somewhere sane instead of (0, 0).
const FALLBACK_ORIGIN: GeoCoordinate = { latitude: 6.9271, longitude: 79.8612 };

function hashString(value: string): number {
  let hash = 0;
  const safe = typeof value === 'string' && value.length > 0 ? value : 'fallback-seed';
  for (let i = 0; i < safe.length; i++) {
    hash = (hash * 31 + safe.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Deterministic mock coordinate ~0-5km around FALLBACK_ORIGIN, derived from
 * a seed string, so the same order always renders the same farm/buyer pins
 * without a real geocoding integration.
 */
function deterministicCoordinate(seed: string): GeoCoordinate {
  const hash = hashString(seed);
  const latOffset = ((hash % 1000) / 1000 - 0.5) * 0.08; // +/- ~4.4km
  const lngOffset = (((hash >>> 10) % 1000) / 1000 - 0.5) * 0.08;
  return {
    latitude: FALLBACK_ORIGIN.latitude + latOffset,
    longitude: FALLBACK_ORIGIN.longitude + lngOffset,
  };
}

/**
 * Generates the 4-digit handshake OTP shown to the courier on delivery
 * (Section 4.3 of design.md). Always returns exactly 4 digits, including
 * leading zeros.
 */
function generateHandshakeOtp(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}

const MOCK_COURIER_NAMES = ['Sunil Perera', 'Kasun Fernando', 'Nimal Silva', 'Chamara Bandara'];
const MOCK_VEHICLE_TYPES = ['Cool-Van', 'Mini Truck', 'Tuk-Tuk'];

/**
 * Deterministic mock courier, derived from a seed (the order id) so the
 * same order always shows the same driver instead of re-rolling on every
 * `getDeliveryTracking` call.
 */
function generateCourierInfo(seed: string): CourierInfo {
  const hash = hashString(seed);
  return {
    name: MOCK_COURIER_NAMES[hash % MOCK_COURIER_NAMES.length],
    vehicleType: MOCK_VEHICLE_TYPES[(hash >>> 4) % MOCK_VEHICLE_TYPES.length],
    plateNumber: `WP CBO-${1000 + (hash % 9000)}`,
    rating: Math.round((4 + ((hash >>> 8) % 10) / 10) * 10) / 10, // 4.0 - 4.9
    phone: '+94770000000',
  };
}

/**
 * Maps the fine-grained sandbox `DeliveryStatus` onto the coarser
 * `OrderStatus` already used by the Orders tab / Screen M-03, so the two
 * screens stay consistent without collapsing their state machines into one.
 */
function toOrderStatus(status: DeliveryStatus): OrderStatus {
  switch (status) {
    case 'ORDER_PLACED':
    case 'COURIER_ASSIGNED':
      return 'confirmed';
    case 'COURIER_AT_PICKUP':
    case 'IN_TRANSIT':
      return 'in_transit';
    case 'DELIVERED':
      return 'delivered';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'placed';
  }
}

/**
 * Fetches the sandbox delivery-tracking state for an order, lazily
 * creating it on first access (e.g. the moment Screen M-04 mounts right
 * after checkout). Farm/buyer coordinates, the courier, and the OTP are
 * all derived deterministically from the order/orderId so they're stable
 * across app restarts. Never throws — falls back to safe defaults (a
 * Colombo-area coordinate, "Unknown Farm" seed, etc.) if the underlying
 * order can't be found, so a stale or missing order never crashes the
 * tracking screen. Returns null only when `orderId` itself is falsy.
 */
export async function getDeliveryTracking(
  orderId: string
): Promise<DeliveryTrackingData | null> {
  if (!orderId) return null;

  const all = await getAllTracking();
  const existing = all[orderId];
  if (existing) return existing;

  let order: Order | null = null;
  try {
    order = await getOrderById(orderId);
  } catch (error) {
    console.error('Failed to load order for delivery tracking:', error);
  }

  const farmSeed = order?.farmGroups?.[0]?.farmName || orderId;
  const farmCoordinate = deterministicCoordinate(farmSeed);
  const buyerCoordinate = deterministicCoordinate(`${farmSeed}::buyer`);

  const tracking: DeliveryTrackingData = {
    orderId,
    status: 'COURIER_ASSIGNED',
    otp: generateHandshakeOtp(),
    courier: generateCourierInfo(orderId),
    farmCoordinate,
    buyerCoordinate,
    courierCoordinate: { ...farmCoordinate },
    etaMinutes: 18,
  };

  const updatedAll = { ...all, [orderId]: tracking };
  await saveAllTracking(updatedAll);
  return tracking;
}

/**
 * Sets the sandbox delivery status for an order (driven by the Section 4.5
 * "Trigger Pickup" / "Advance to Transit" / "Trigger Delivery" controls),
 * snaps the courier marker to the pickup/dropoff point on the matching
 * transitions, keeps the persisted `Order.status` in sync via
 * `toOrderStatus` (so the Orders tab reflects it too), and notifies any
 * live subscribers. Returns null if there's no tracking state to update
 * (e.g. an invalid orderId).
 */
export async function updateDeliveryStatus(
  orderId: string,
  status: DeliveryStatus
): Promise<DeliveryTrackingData | null> {
  const all = await getAllTracking();
  const existing = all[orderId] ?? (await getDeliveryTracking(orderId));
  if (!existing) return null;

  const updatedTracking: DeliveryTrackingData = {
    ...existing,
    status,
    courierCoordinate:
      status === 'COURIER_AT_PICKUP'
        ? { ...existing.farmCoordinate }
        : status === 'DELIVERED'
        ? { ...existing.buyerCoordinate }
        : existing.courierCoordinate,
    etaMinutes: status === 'DELIVERED' ? 0 : existing.etaMinutes,
  };

  const updatedAll = { ...all, [orderId]: updatedTracking };
  await saveAllTracking(updatedAll);
  notifyTrackingListeners(orderId, updatedTracking);

  // Best-effort sync of the coarser Order.status used by the Orders tab.
  // If this fails, the sandbox tracking state above has already been
  // saved and broadcast, so the tracking screen itself stays correct.
  try {
    const orders = await getOrders();
    const nextOrders = orders.map((o) =>
      o.id === orderId ? { ...o, status: toOrderStatus(status) } : o
    );
    await saveOrders(nextOrders);
  } catch (error) {
    console.error('Failed to sync order status from delivery tracking:', error);
  }

  return updatedTracking;
}

/**
 * Advances the courier marker one tick along the straight line from the
 * farm pin to the buyer pin (Section 4.1's "Moving Courier Marker...
 * interpolating along polyline coordinates"). Intended to be called on an
 * interval (e.g. every 1-2s) from DeliveryTrackingScreen while status is
 * `IN_TRANSIT`; it's a safe no-op (returns the tracking unchanged) once
 * status isn't `IN_TRANSIT` or there's no tracking state yet, so callers
 * don't need to guard the interval themselves.
 *
 * `steps` controls how many ticks the full farm -> buyer trip takes
 * (default 20).
 */
export async function simulateCourierMovement(
  orderId: string,
  steps: number = 20
): Promise<DeliveryTrackingData | null> {
  const all = await getAllTracking();
  const existing = all[orderId];
  if (!existing || existing.status !== 'IN_TRANSIT') {
    return existing ?? null;
  }

  const { farmCoordinate, buyerCoordinate, courierCoordinate } = existing;
  const safeSteps = Math.max(1, steps);
  const dLat = (buyerCoordinate.latitude - farmCoordinate.latitude) / safeSteps;
  const dLng = (buyerCoordinate.longitude - farmCoordinate.longitude) / safeSteps;
  const stepDist = Math.hypot(dLat, dLng);
  const distToTarget = Math.hypot(
    buyerCoordinate.latitude - courierCoordinate.latitude,
    buyerCoordinate.longitude - courierCoordinate.longitude
  );

  // Close enough to the buyer pin - snap to it rather than overshooting,
  // but leave status transition to DELIVERED for the explicit "Trigger
  // Delivery" + OTP flow rather than doing it implicitly here.
  const nextCoordinate: GeoCoordinate =
    distToTarget <= stepDist
      ? { ...buyerCoordinate }
      : {
          latitude: courierCoordinate.latitude + dLat,
          longitude: courierCoordinate.longitude + dLng,
        };

  const updatedTracking: DeliveryTrackingData = {
    ...existing,
    courierCoordinate: nextCoordinate,
    etaMinutes: Math.max(0, existing.etaMinutes - 1),
  };

  const updatedAll = { ...all, [orderId]: updatedTracking };
  await saveAllTracking(updatedAll);
  notifyTrackingListeners(orderId, updatedTracking);
  return updatedTracking;
}

// ---------------------------------------------------------------------------
// Screen M-05: AI Bulk Orders Engine (Subscribed Customer Workspace)
// ---------------------------------------------------------------------------

/**
 * Same pub/sub pattern as `subscribeToCart` / `subscribeToCrops` above, so
 * e.g. a future "Active Contracts" badge can update live when
 * BulkOrdersScreen locks or the Section 4.5 sandbox toggles a contract.
 */
type SubscriptionListener = (subs: BulkSubscription[]) => void;
const subscriptionListeners = new Set<SubscriptionListener>();

function notifySubscriptionListeners(subs: BulkSubscription[]): void {
  subscriptionListeners.forEach((listener) => listener(subs));
}

export function subscribeToSubscriptions(listener: SubscriptionListener): () => void {
  subscriptionListeners.add(listener);
  return () => subscriptionListeners.delete(listener);
}

/**
 * Retrieve all bulk subscription contracts from AsyncStorage.
 */
export async function getSubscriptions(): Promise<BulkSubscription[]> {
  try {
    const raw = await AsyncStorage.getItem(SUBSCRIPTIONS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BulkSubscription[]) : [];
  } catch (error) {
    console.error('Failed to read bulk subscriptions from storage:', error);
    return [];
  }
}

async function saveAllSubscriptions(subs: BulkSubscription[]): Promise<void> {
  await AsyncStorage.setItem(SUBSCRIPTIONS_STORAGE_KEY, JSON.stringify(subs));
  notifySubscriptionListeners(subs);
}

/**
 * Upserts a single bulk subscription contract (Section 4.4's
 * "[ Lock Bulk Subscription Contract ]" CTA, and the Section 4.5 sandbox's
 * "[ Toggle Contract State ]" control). Matches by `id` — an existing id
 * updates that record in place (e.g. flipping `status` between
 * `'DRAFT'`/`'ACTIVE'`), anything else is prepended as a new contract.
 */
export async function saveSubscription(
  sub: BulkSubscription
): Promise<BulkSubscription[]> {
  const existing = await getSubscriptions();
  const index = existing.findIndex((s) => s.id === sub.id);
  const updated =
    index >= 0
      ? existing.map((s, i) => (i === index ? sub : s))
      : [sub, ...existing];

  await saveAllSubscriptions(updated);
  return updated;
}

/**
 * Removes a bulk subscription contract entirely.
 */
export async function removeSubscription(
  subscriptionId: string
): Promise<BulkSubscription[]> {
  const existing = await getSubscriptions();
  const updated = existing.filter((s) => s.id !== subscriptionId);
  await saveAllSubscriptions(updated);
  return updated;
}

/**
 * Generates a reasonably unique subscription id, same approach as
 * `generateCropId` / `generateOrderId` above.
 */
export function generateSubscriptionId(): string {
  return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The Tiered Volume Pricing Matrix (design.md Section 4.2) as a client-side
 * rule table — no backend/API call needed. Rates and thresholds match the
 * spec's worked example exactly.
 */
const BULK_TIERS: BulkTierInfo[] = [
  { tier: 1, label: 'Tier 1', minKg: 50, maxKg: 99, pricePerKg: 360, discountPercentage: 0 },
  { tier: 2, label: 'Tier 2', minKg: 100, maxKg: 249, pricePerKg: 335, discountPercentage: 12 },
  { tier: 3, label: 'Tier 3', minKg: 250, maxKg: null, pricePerKg: 305, discountPercentage: 20 },
];

/**
 * Below the 50kg bulk minimum, volume doesn't qualify for a discounted rate
 * yet — returned as a synthetic `tier: 0` row priced at the standard
 * (Tier 1) rate so the UI always has a `pricePerKg` to render against.
 */
const BELOW_MINIMUM_TIER: BulkTierInfo = {
  tier: 0,
  label: 'Below Bulk Minimum',
  minKg: 0,
  maxKg: 49,
  pricePerKg: BULK_TIERS[0].pricePerKg,
  discountPercentage: 0,
};

/**
 * Client-side rule engine (no external API) mapping a weekly volume (kg)
 * onto its active pricing tier — the Interactive Volume Slider's real-time
 * lookup in Section 4.2, and the source of truth for `selectedTier` /
 * `discountPercentage` on a saved `BulkSubscription`.
 */
export function calculateBulkTier(volumeKg: number): BulkTierInfo {
  const safeVolume =
    typeof volumeKg === 'number' && Number.isFinite(volumeKg) && volumeKg > 0
      ? volumeKg
      : 0;

  if (safeVolume >= BULK_TIERS[2].minKg) return BULK_TIERS[2];
  if (safeVolume >= BULK_TIERS[1].minKg) return BULK_TIERS[1];
  if (safeVolume >= BULK_TIERS[0].minKg) return BULK_TIERS[0];
  return BELOW_MINIMUM_TIER;
}

/**
 * Per-business-type kg/week multipliers used by the AI Demand Estimator
 * (Section 4.1) to turn a simple input — guest covers, weekly footfall, or
 * processing batches, depending on `businessType` — into a recommended
 * weekly crop volume. Purely a local heuristic; no network call.
 */
const AI_DEMAND_MULTIPLIER_KG: Record<BulkSubscription['businessType'], number> = {
  RESTAURANT: 0.6, // ~0.6kg produce per weekly guest cover
  RETAILER: 0.15, // ~0.15kg per weekly customer footfall unit
  PROCESSOR: 2.5, // ~2.5kg per weekly processing batch/unit
};

/**
 * Computes the AI Demand Estimator's recommended weekly volume (Section
 * 4.1's "AI Demand Estimator Input ... yielding automated crop quantity
 * recommendations"), rounded to the nearest whole kg. Returns 0 for a
 * non-positive/invalid input rather than throwing.
 */
export function estimateWeeklyVolumeKg(
  businessType: BulkSubscription['businessType'],
  inputUnits: number
): number {
  const safeUnits =
    typeof inputUnits === 'number' && Number.isFinite(inputUnits) && inputUnits > 0
      ? inputUnits
      : 0;
  const multiplier = AI_DEMAND_MULTIPLIER_KG[businessType] ?? AI_DEMAND_MULTIPLIER_KG.RESTAURANT;
  return Math.round(safeUnits * multiplier);
}

// ---------------------------------------------------------------------------
// Screen M-05: Handwritten Bulk Requirement List — OCR + Verified Matching
// ---------------------------------------------------------------------------

/**
 * A small built-in pool of SLSI-Verified (and, for one entry, deliberately
 * unverified) demo crops. This is layered underneath the real published
 * catalog (see `matchHandwrittenListToVerifiedFarmers` below) purely so the
 * Section 4's sandbox presets — and any early-stage catalog with few or no
 * published crops — still produce a full available/unavailable breakdown
 * end-to-end, without depending on what's actually been published via
 * Screen M-02. Real published crops are always checked first/in addition.
 */
const DEMO_VERIFIED_CROP_POOL: Crop[] = [
  {
    id: 'demo_verified_carrot',
    name: 'Carrot',
    category: 'Vegetables',
    pricePerUnit: 180,
    unit: '1kg',
    imageUrl: '',
    isSLSIVerified: true,
    farmName: 'Nuwara Eliya Organic Farm',
    province: 'Central',
    district: 'Nuwara Eliya',
    city: 'Nuwara Eliya',
    availableQtyKg: 300,
  },
  {
    id: 'demo_verified_leek',
    name: 'Leek',
    category: 'Vegetables',
    pricePerUnit: 220,
    unit: '1kg',
    imageUrl: '',
    isSLSIVerified: true,
    farmName: 'Bandarawela Green Farms',
    province: 'Uva',
    district: 'Badulla',
    city: 'Bandarawela',
    availableQtyKg: 150,
  },
  {
    id: 'demo_verified_potato',
    name: 'Potato',
    category: 'Vegetables',
    pricePerUnit: 165,
    unit: '1kg',
    imageUrl: '',
    isSLSIVerified: true,
    farmName: 'Welimada Farmers Collective',
    province: 'Uva',
    district: 'Badulla',
    city: 'Welimada',
    availableQtyKg: 500,
  },
  // Intentionally unverified, so a request like "Organic Beetroot" name-
  // matches this listing but is correctly routed to unavailableItems with
  // an "unverified" reason rather than silently passing.
  {
    id: 'demo_unverified_beetroot',
    name: 'Beetroot',
    category: 'Vegetables',
    pricePerUnit: 140,
    unit: '1kg',
    imageUrl: '',
    isSLSIVerified: false,
    farmName: 'Riverside Smallholding (Unverified)',
    province: 'Central',
    district: 'Kandy',
    city: 'Kandy',
    availableQtyKg: 80,
  },
];

/**
 * Client-side matching engine for Screen M-05's handwritten bulk list
 * workflow. For each parsed line item:
 *   1. Name-matches against the live crop catalog + `DEMO_VERIFIED_CROP_POOL`
 *      (case-insensitive, either direction — e.g. "Organic Beetroot" matches
 *      a catalog crop named "Beetroot").
 *   2. Requires `isSLSIVerified === true` — any name match that's only
 *      unverified is rejected with an explanatory reason, never silently
 *      substituted.
 *   3. Requires `availableQtyKg >= requestedQtyKg` where stock is tracked;
 *      crops with no `availableQtyKg` set are treated as unconstrained
 *      demo stock rather than "0kg available" (see the field's doc comment
 *      in types/index.ts).
 *   4. Among multiple verified, in-stock matches, picks the cheapest
 *      `pricePerUnit` for the customer.
 * No network/API calls — everything runs against data already in storage.
 */
export async function matchHandwrittenListToVerifiedFarmers(
  items: ExtractedListItem[]
): Promise<BulkMatchResult> {
  const liveCrops = await getCrops();
  const pool = [...liveCrops, ...DEMO_VERIFIED_CROP_POOL];

  const availableItems: BulkMatchItem[] = [];
  const unavailableItems: UnavailableListItem[] = [];

  for (const item of items) {
    const needle = (item.cropName ?? '').trim().toLowerCase();
    const requestedQtyKg =
      typeof item.requestedQtyKg === 'number' && item.requestedQtyKg > 0
        ? item.requestedQtyKg
        : 0;

    if (!needle || requestedQtyKg <= 0) {
      continue; // skip blank/incomplete rows rather than reporting them
    }

    const nameMatches = pool.filter((crop) => {
      const cropName = crop.name.trim().toLowerCase();
      return cropName.length > 0 && (needle.includes(cropName) || cropName.includes(needle));
    });

    if (nameMatches.length === 0) {
      unavailableItems.push({
        requestedItem: item.cropName,
        requestedQtyKg,
        reason: `No SLSI-Verified farmer currently lists "${item.cropName}".`,
      });
      continue;
    }

    const verifiedMatches = nameMatches.filter((crop) => crop.isSLSIVerified === true);
    if (verifiedMatches.length === 0) {
      unavailableItems.push({
        requestedItem: item.cropName,
        requestedQtyKg,
        reason: `Only unverified listings found for "${item.cropName}" — SLSI-Verified stock required.`,
      });
      continue;
    }

    const inStockMatches = verifiedMatches.filter((crop) => {
      const stock = typeof crop.availableQtyKg === 'number' ? crop.availableQtyKg : Infinity;
      return stock >= requestedQtyKg;
    });

    if (inStockMatches.length === 0) {
      const closest = verifiedMatches.reduce((best, crop) =>
        (crop.availableQtyKg ?? 0) > (best.availableQtyKg ?? 0) ? crop : best
      );
      unavailableItems.push({
        requestedItem: item.cropName,
        requestedQtyKg,
        reason: `Verified stock insufficient (${closest.availableQtyKg ?? 0}kg available, ${requestedQtyKg}kg requested).`,
      });
      continue;
    }

    const best = inStockMatches.reduce((cheapest, crop) =>
      crop.pricePerUnit <= cheapest.pricePerUnit ? crop : cheapest
    );

    availableItems.push({
      cropId: best.id,
      cropName: best.name,
      requestedQtyKg,
      pricePerKg: best.pricePerUnit,
      totalPrice: Math.round(best.pricePerUnit * requestedQtyKg),
      farmerName: best.farmName,
      isVerified: true,
    });
  }

  const grandTotal = availableItems.reduce((sum, i) => sum + i.totalPrice, 0);
  return { availableItems, unavailableItems, grandTotal };
}

/**
 * Adds a matched bulk list's `availableItems` straight into the shared cart
 * (the same `@ecoharvest/cart` storage Screen M-03's CartScreen reads from),
 * so "Proceed to Bulk Checkout" can hand off to the existing checkout flow
 * instead of duplicating payment logic. Matches the existing `addToCart`
 * merge-by-id behavior: an item already in the cart has its quantity
 * increased rather than duplicated.
 */
export async function addBulkMatchItemsToCart(
  items: BulkMatchItem[]
): Promise<CartItem[]> {
  const cart = await getCart();
  const next = [...cart];

  for (const item of items) {
    const existingIndex = next.findIndex((c) => c.cropId === item.cropId);
    if (existingIndex >= 0) {
      next[existingIndex] = {
        ...next[existingIndex],
        quantity: next[existingIndex].quantity + item.requestedQtyKg,
      };
    } else {
      next.push({
        cropId: item.cropId,
        name: item.cropName,
        pricePerUnit: item.pricePerKg,
        unit: '1kg',
        quantity: item.requestedQtyKg,
        imageUrl: '',
        farmName: item.farmerName,
        province: 'Unknown',
        district: 'Unknown',
        city: 'Unknown',
      });
    }
  }

  await saveCart(next);
  return next;
}

// ---------------------------------------------------------------------------
// Screen M-06: Moderated In-App Chat Messenger
// ---------------------------------------------------------------------------

/**
 * Sri Lankan mobile numbers, written either as a local `07XXXXXXXX` (10
 * digits) or an international `+947XXXXXXXX` / `947XXXXXXXX` number. This
 * is tested against a *separator-collapsed* copy of the message (see
 * `collapseSeparators`) so spaced/dashed forms like "077 123 4567" or
 * "077-123-4567" are still caught, not just the unbroken digit string.
 */
const SL_MOBILE_REGEX = /(?:\+?94)0?7\d{8}|0?7\d{8}/;

/** Standard email address shape, e.g. "farmer@gmail.com". */
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/;

/** Explicit http(s)/www links. */
const URL_REGEX = /\b(?:https?:\/\/|www\.)\S+/i;

/**
 * Bare domains typed without a scheme/www (e.g. "meet.me" or
 * "chatapp.lk") — a common way people try to slip a link past a naive
 * "starts with http" filter. Intentionally narrowed to a common TLD list
 * so it doesn't flag every sentence that happens to contain a period.
 */
const BARE_DOMAIN_REGEX = /\b[a-zA-Z0-9-]+\.(com|net|org|lk|io|co|info|biz|me|app)\b/i;

/**
 * Strips spaces, dashes, dots, and parens so a phone number split up as
 * "077 123 4567" or "(077) 123-4567" still matches `SL_MOBILE_REGEX`,
 * which expects a contiguous digit run.
 */
function collapseSeparators(text: string): string {
  return text.replace(/[\s\-().]+/g, '');
}

/**
 * The Screen M-06 moderation filter (design.md Section 3.2, "Intermediate
 * Filtration Safety Banner"): a client-side regex parser that flags
 * attempts to move a conversation off-platform via a phone number, email
 * address, or web link, so `sendChatMessage` can mark the message
 * `isBlocked` instead of letting it through as a normal bubble.
 *
 * Defensive against non-string/empty input (returns `false` rather than
 * throwing), since this can be called directly from UI event handlers.
 */
export function checkOffPlatformViolation(text: string): boolean {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  if (SL_MOBILE_REGEX.test(collapseSeparators(trimmed))) return true;
  if (EMAIL_REGEX.test(trimmed)) return true;
  if (URL_REGEX.test(trimmed)) return true;
  if (BARE_DOMAIN_REGEX.test(trimmed)) return true;

  return false;
}

type ChatMessageMap = Record<string, ChatMessage[]>;
type ChatThreadMap = Record<string, ChatThread>;

/**
 * Per-thread pub/sub (same rationale as `subscribeToTracking` above): a
 * ChatScreen instance only ever cares about the one `threadId` it's
 * mounted with, so keying listeners by thread avoids re-rendering on
 * unrelated conversations.
 */
type ChatListener = (messages: ChatMessage[]) => void;
const chatListeners = new Map<string, Set<ChatListener>>();

function notifyChatListeners(threadId: string, messages: ChatMessage[]): void {
  chatListeners.get(threadId)?.forEach((listener) => listener(messages));
}

/**
 * Subscribe to live message updates for one chat thread. Returns an
 * unsubscribe function.
 */
export function subscribeToChatMessages(
  threadId: string,
  listener: ChatListener
): () => void {
  if (!chatListeners.has(threadId)) {
    chatListeners.set(threadId, new Set());
  }
  chatListeners.get(threadId)!.add(listener);
  return () => {
    chatListeners.get(threadId)?.delete(listener);
  };
}

async function getAllChatMessages(): Promise<ChatMessageMap> {
  try {
    const raw = await AsyncStorage.getItem(CHAT_MESSAGES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChatMessageMap) : {};
  } catch (error) {
    console.error('Failed to read chat messages from storage:', error);
    return {};
  }
}

async function saveAllChatMessages(
  map: ChatMessageMap,
  changedThreadId?: string
): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAT_MESSAGES_STORAGE_KEY, JSON.stringify(map));
    if (changedThreadId) {
      notifyChatListeners(changedThreadId, map[changedThreadId] ?? []);
    }
  } catch (error) {
    console.error('Failed to save chat messages to storage:', error);
  }
}

async function getAllChatThreadsMap(): Promise<ChatThreadMap> {
  try {
    const raw = await AsyncStorage.getItem(CHAT_THREADS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChatThreadMap) : {};
  } catch (error) {
    console.error('Failed to read chat threads from storage:', error);
    return {};
  }
}

/**
 * Returns every active chat thread as a flat array, regardless of which
 * customer/order it belongs to. Backs the Farmer Portal dashboard's
 * "Customer Inquiries & Messages" section (FarmerOnboardingScreen, View
 * Mode 2), which needs to list every inbound thread rather than a single
 * thread by id the way ChatScreen does. Order is not guaranteed — sort by
 * message recency (see `getChatMessages`) if a specific order matters to
 * the caller. Never throws — returns `[]` on a storage read failure rather
 * than failing the dashboard mount.
 */
export async function getAllChatThreads(): Promise<ChatThread[]> {
  const map = await getAllChatThreadsMap();
  return Object.values(map);
}

async function saveAllChatThreads(map: ChatThreadMap): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAT_THREADS_STORAGE_KEY, JSON.stringify(map));
  } catch (error) {
    console.error('Failed to save chat threads to storage:', error);
  }
}

/**
 * Generates a reasonably unique chat thread id, same approach as
 * `generateCropId`/`generateOrderId`. Exported so a screen navigating into
 * Chat without an existing `threadId` (e.g. "Message Farmer" from the
 * Marketplace) can mint one up front to pass as a nav param.
 */
export function generateChatThreadId(): string {
  return `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateChatMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Fetches (lazily creating, on first access) the Header Bar + Transaction
 * Summary context for one chat thread — same "lazy-create keyed by id"
 * pattern as `getDeliveryTracking`. If a real order is available it's used
 * to seed `orderId`/`cropSummary`/`paymentStatus`/`recipientName`;
 * otherwise sensible sandbox defaults matching design.md's own examples
 * (`#ORD-8492`, `100kg Organic Carrots`, `Escrow Locked`) are used so the
 * screen still renders meaningfully with no orders placed yet. Never
 * throws — falls back to defaults rather than failing the screen mount.
 */
export async function getChatThread(
  threadId: string,
  overrides?: { recipientName?: string; orderId?: string }
): Promise<ChatThread> {
  const all = await getAllChatThreadsMap();
  const existing = all[threadId];
  if (existing) {
    // A caller-supplied recipientName (e.g. from a "Message <Farmer>" nav
    // param) can update the display name on an already-created thread
    // without disturbing its orderId/cropSummary/paymentStatus.
    if (overrides?.recipientName && overrides.recipientName !== existing.recipientName) {
      const updated: ChatThread = { ...existing, recipientName: overrides.recipientName };
      await saveAllChatThreads({ ...all, [threadId]: updated });
      return updated;
    }
    return existing;
  }

  let order: Order | null = null;
  try {
    order = overrides?.orderId
      ? await getOrderById(overrides.orderId)
      : (await getOrders())[0] ?? null;
  } catch (error) {
    console.error('Failed to load order context for chat thread:', error);
  }

  const cropSummary =
    order && order.items.length > 0
      ? order.items.map((item) => `${item.quantity}${item.unit} ${item.name}`).join(', ')
      : '100kg Organic Carrots';

  const paymentStatus: string = (() => {
    if (!order) return 'Escrow Locked';
    switch (order.status) {
      case 'delivered':
        return 'Payment Released';
      case 'cancelled':
        return 'Refunded';
      case 'placed':
        return 'Pending Payment';
      default:
        return 'Escrow Locked';
    }
  })();

  const thread: ChatThread = {
    id: threadId,
    orderId: order?.id ?? `ORD-${1000 + (hashString(threadId) % 9000)}`,
    cropSummary,
    paymentStatus,
    recipientName:
      overrides?.recipientName ?? order?.farmGroups?.[0]?.farmName ?? 'Nuwara Eliya Organic Farm',
    isVerified: true,
  };

  await saveAllChatThreads({ ...all, [threadId]: thread });
  return thread;
}

/**
 * Retrieve the persisted message history for one chat thread, oldest
 * first. Returns `[]` for an unknown/empty threadId rather than throwing.
 */
export async function getChatMessages(threadId: string): Promise<ChatMessage[]> {
  if (!threadId) return [];
  const all = await getAllChatMessages();
  return all[threadId] ?? [];
}

/**
 * Sends a message into a chat thread, running it through the Screen M-06
 * moderation filter first: if `checkOffPlatformViolation` flags the text,
 * the message is still saved (so the blocked attempt shows up in the
 * thread as a crimson alert card) but with `isBlocked: true` instead of
 * being delivered as a normal bubble. Notifies any live subscriber for
 * this thread (`subscribeToChatMessages`) so an open ChatScreen updates
 * immediately.
 *
 * `senderRole` is optional and defaults to `'CUSTOMER'` (ChatScreen's
 * original, customer-facing default). Pass `'FARMER'` explicitly when the
 * message is being sent from the Farmer Portal dashboard/reply flow so it's
 * recorded — and rendered — as coming from the farmer side of the thread.
 *
 * Throws if `threadId` or `text` (after trimming) is empty — callers
 * should catch this and keep the user on the input rather than assuming
 * success.
 */
export async function sendChatMessage(
  threadId: string,
  text: string,
  senderRole: ChatMessage['senderRole'] = 'CUSTOMER'
): Promise<ChatMessage> {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!threadId || !trimmed) {
    throw new Error('sendChatMessage requires a threadId and non-empty text.');
  }

  const message: ChatMessage = {
    id: generateChatMessageId(),
    senderId: senderRole === 'CUSTOMER' ? 'current_customer' : 'current_farmer',
    senderRole,
    text: trimmed,
    isBlocked: checkOffPlatformViolation(trimmed),
    timestamp: new Date().toISOString(),
  };

  const all = await getAllChatMessages();
  const threadMessages = all[threadId] ?? [];
  const updated = { ...all, [threadId]: [...threadMessages, message] };

  await saveAllChatMessages(updated, threadId);
  return message;
}

// ---------------------------------------------------------------------------
// System Notification Push Matrix (Notification.md: role-routed push alerts,
// slide-out NotificationModal, badge counters, Developer Sandbox simulation)
// ---------------------------------------------------------------------------

/**
 * Generates a reasonably unique notification id, same approach as
 * `generateCropId` / `generateOrderId` / `generateReviewId` above.
 */
export function generateNotificationId(): string {
  return `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Helper for seeding believable relative timestamps ("5m ago", "1h ago")
 * on the initial sample notifications below, without hard-coding an ISO
 * string that immediately looks stale.
 */
function minutesAgoIso(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

/**
 * Initial sample notifications for both the Customer and Farmer viewport
 * channels (Notification.md Section 2.1 / 2.2), seeded once into
 * AsyncStorage the first time `getAllNotifications` is ever called on a
 * fresh install. Message copy matches the design spec's channel matrix
 * verbatim so the demo UI reads exactly like the spec's examples.
 */
const INITIAL_NOTIFICATIONS: AppNotification[] = [
  // --- 2.1 Customer Viewport Channel ---
  {
    id: 'notif_seed_customer_order_accepted',
    role: 'CUSTOMER',
    title: 'Order Accepted',
    message: 'Farmer has verified harvest stock and locked inventory',
    category: 'ORDER',
    isRead: false,
    timestamp: minutesAgoIso(4),
  },
  {
    id: 'notif_seed_customer_dispatch',
    role: 'CUSTOMER',
    title: 'Uber Dispatch',
    message: 'Driver assigned and en route to farm pickup',
    category: 'DISPATCH',
    isRead: false,
    timestamp: minutesAgoIso(18),
  },
  {
    id: 'notif_seed_customer_recommendation',
    role: 'CUSTOMER',
    title: 'Nearby Match',
    message: 'New SLSI verified organic farmer available in your district',
    category: 'RECOMMENDATION',
    isRead: true,
    timestamp: minutesAgoIso(240),
  },
  // --- 2.2 Farmer Viewport Channel ---
  {
    id: 'notif_seed_farmer_new_order',
    role: 'FARMER',
    title: 'New Incoming Order',
    message: 'Direct order locked. Handshake OTP generated',
    category: 'ORDER',
    isRead: false,
    timestamp: minutesAgoIso(9),
  },
  {
    id: 'notif_seed_farmer_bulk_match',
    role: 'FARMER',
    title: 'AI Demand Match',
    message: 'New bulk requirement query matches your active crops',
    category: 'BULK_MATCH',
    isRead: false,
    timestamp: minutesAgoIso(35),
  },
  {
    id: 'notif_seed_farmer_low_stock',
    role: 'FARMER',
    title: 'High Priority Alert',
    message: 'Inventory levels fallen below configured threshold',
    category: 'INVENTORY',
    isRead: false,
    timestamp: minutesAgoIso(60),
  },
  {
    id: 'notif_seed_farmer_review',
    role: 'FARMER',
    title: 'Customer Feedback',
    message: 'New rating and freshness feedback received for your harvest',
    category: 'REVIEW',
    isRead: true,
    timestamp: minutesAgoIso(320),
  },
];

/**
 * Simple pub/sub (same pattern as cart/crops/orders/reviews above) so any
 * mounted screen — e.g. a header Bell icon's unread badge, or an open
 * NotificationModal — can react immediately whenever a notification is
 * added or its read state changes, without a global state library.
 * Listeners receive the *full* unfiltered list; callers filter by role
 * themselves (see `getNotifications`).
 */
type NotificationListener = (notifications: AppNotification[]) => void;
const notificationListeners = new Set<NotificationListener>();

function notifyNotificationListeners(notifications: AppNotification[]): void {
  notificationListeners.forEach((listener) => listener(notifications));
}

/**
 * Subscribe to real-time notification updates across both viewport
 * channels. Returns an unsubscribe function.
 *
 * Typical usage in a header Bell icon:
 *
 *   useEffect(() => subscribeToNotifications((all) => {
 *     setUnreadCount(all.filter((n) => n.role === 'CUSTOMER' && !n.isRead).length);
 *   }), []);
 */
export function subscribeToNotifications(listener: NotificationListener): () => void {
  notificationListeners.add(listener);
  return () => notificationListeners.delete(listener);
}

/**
 * Retrieve every persisted notification (both channels), lazily seeding
 * `INITIAL_NOTIFICATIONS` into AsyncStorage on first-ever access so the
 * Notification Drawer never opens empty on a fresh install. Never throws —
 * falls back to `[]` on a storage read failure.
 */
async function getAllNotifications(): Promise<AppNotification[]> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as AppNotification[];
    }
    await AsyncStorage.setItem(
      NOTIFICATIONS_STORAGE_KEY,
      JSON.stringify(INITIAL_NOTIFICATIONS)
    );
    return INITIAL_NOTIFICATIONS;
  } catch (error) {
    console.error('Failed to read notifications from storage:', error);
    return [];
  }
}

/**
 * Persist the full notifications array and notify all live subscribers.
 * Throws on failure — same convention as `saveCrops`/`saveOrders` above, so
 * a failed write never leaves the UI believing a mark-as-read/simulated
 * push actually landed.
 */
async function saveAllNotifications(notifications: AppNotification[]): Promise<void> {
  await AsyncStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications));
  notifyNotificationListeners(notifications);
}

/**
 * Retrieve notifications, optionally filtered to a single viewport channel
 * (Notification.md Section 3.2's "Role Viewport Switcher" tab), newest
 * first. Omitting `role` returns both channels combined.
 */
export async function getNotifications(
  role?: NotificationRole
): Promise<AppNotification[]> {
  const all = await getAllNotifications();
  const filtered = role ? all.filter((n) => n.role === role) : all;
  return [...filtered].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

/**
 * Convenience count for a header Bell icon's unread badge (Notification.md
 * Section 3.1). Omitting `role` counts unread across both channels.
 */
export async function getUnreadNotificationCount(role?: NotificationRole): Promise<number> {
  const notifications = await getNotifications(role);
  return notifications.filter((n) => !n.isRead).length;
}

/**
 * Marks a single notification as read (tapping a card in the drawer).
 * No-ops (returns the list unchanged) if `id` doesn't match anything
 * rather than throwing, since a stale/already-removed id shouldn't crash
 * the drawer.
 */
export async function markNotificationAsRead(id: string): Promise<AppNotification[]> {
  const all = await getAllNotifications();
  const updated = all.map((n) => (n.id === id ? { ...n, isRead: true } : n));
  await saveAllNotifications(updated);
  return updated;
}

/**
 * Backs the drawer's "[ Mark All as Read ]" button (Notification.md
 * Section 3.2). Marks every notification as read by default; passing
 * `role` scopes it to just the currently active viewport tab, so marking
 * all Customer alerts read doesn't silently clear unread Farmer alerts.
 */
export async function markAllNotificationsAsRead(
  role?: NotificationRole
): Promise<AppNotification[]> {
  const all = await getAllNotifications();
  const updated = all.map((n) =>
    !role || n.role === role ? { ...n, isRead: true } : n
  );
  await saveAllNotifications(updated);
  return updated;
}

/**
 * Pushes a new notification into a channel — the entry point for both the
 * Section 3.3 Developer Sandbox Simulation Bar presets ("Sim: Order
 * Accepted", "Sim: Driver Dispatch", etc.) and any real app event that
 * should surface a push alert later (e.g. `createOrder` or
 * `updateDeliveryStatus` calling this directly). Always starts unread with
 * a fresh timestamp — callers only supply the content fields.
 */
export async function addNotification(
  notification: Omit<AppNotification, 'id' | 'isRead' | 'timestamp'>
): Promise<AppNotification[]> {
  const all = await getAllNotifications();
  const newNotification: AppNotification = {
    ...notification,
    id: generateNotificationId(),
    isRead: false,
    timestamp: new Date().toISOString(),
  };
  const updated = [newNotification, ...all];
  await saveAllNotifications(updated);
  return updated;
}

/**
 * Clears every persisted notification (useful for resetting demo data from
 * a Developer Sandbox "Reset" control, mirroring `clearCrops`/
 * `clearFarmerProfile` above). Re-seeding happens automatically on the next
 * `getAllNotifications` call.
 */
export async function clearNotifications(): Promise<void> {
  await AsyncStorage.removeItem(NOTIFICATIONS_STORAGE_KEY);
  notifyNotificationListeners([]);
}