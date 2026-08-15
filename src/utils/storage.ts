// src/utils/storage.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import { CartItem, Crop } from '../types';

const CART_STORAGE_KEY = '@ecoharvest/cart';
const CROPS_STORAGE_KEY = '@ecoharvest/crops';

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