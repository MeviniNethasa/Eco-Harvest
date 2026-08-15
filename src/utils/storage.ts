// src/utils/storage.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CartItem,
  CourierInfo,
  Crop,
  DeliveryStatus,
  DeliveryTrackingData,
  FarmGroup,
  GeoCoordinate,
  Order,
  OrderStatus,
  OrderSummary,
  PaymentDetails,
} from '../types';

const CART_STORAGE_KEY = '@ecoharvest/cart';
const CROPS_STORAGE_KEY = '@ecoharvest/crops';
const ORDERS_STORAGE_KEY = '@ecoharvest/orders';
const TRACKING_STORAGE_KEY = '@ecoharvest/delivery-tracking';

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
export async function publishCrop(cropInput: Omit<Crop, 'id'>): Promise<Crop[]> {
  const crop: Crop = { ...cropInput, id: generateCropId() };
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