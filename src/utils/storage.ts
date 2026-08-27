// src/utils/storage.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AppMode,
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
  CustomerProfile,
  DeliveryStatus,
  DeliveryTrackingData,
  ExtractedListItem,
  FarmerProfile,
  FarmGroup,
  GeoCoordinate,
  HelpTicket,
  HelpTicketCategory,
  HelpTicketMessage,
  HelpTicketPriority,
  HelpTicketStatus,
  NotificationRole,
  Order,
  OrderStatus,
  OrderSummary,
  PaymentDetails,
  ProductReview,
  UnavailableListItem,
  VerificationRequest,
  BulkOrderSession,
  BulkChatMessage,
} from '../types';
import { MOCK_CROPS, MOCK_FARMERS } from '../data/mockData';
import { aiApi, farmerApi, helpDeskApi, messageApi, orderApi, productApi, stripeApi } from '../services/api';

const CART_STORAGE_KEY = '@ecoharvest/cart';
const HELP_TICKETS_STORAGE_KEY = '@ecoharvest/help-tickets';
const CROPS_STORAGE_KEY = '@ecoharvest/crops';
const FARMER_PROFILE_STORAGE_KEY = '@ecoharvest/farmer-profile';
const REGISTERED_FARMERS_STORAGE_KEY = '@ecoharvest/registered-farmers';
const USER_PROFILE_KEY = '@ecoharvest/user-profile';
const ORDERS_STORAGE_KEY = '@ecoharvest/orders';
const TRACKING_STORAGE_KEY = '@ecoharvest/delivery-tracking';
const SUBSCRIPTIONS_STORAGE_KEY = '@ecoharvest/bulk-subscriptions';
const CHAT_MESSAGES_STORAGE_KEY = '@ecoharvest/chat-messages';
const CHAT_THREADS_STORAGE_KEY = '@ecoharvest/chat-threads';
const REVIEWS_STORAGE_KEY = '@ecoharvest/product-reviews';
const NOTIFICATIONS_STORAGE_KEY = '@ecoharvest/notifications';
const VERIFICATION_REQUESTS_STORAGE_KEY = '@ecoharvest/verification-requests';
const ACTIVE_MODE_STORAGE_KEY = '@ecoharvest/active-mode';

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
 * Pub/sub for real-time farmer directory changes so MarketplaceScreen (or any
 * mounted consumer) updates automatically when a farmer registers or edits a farm.
 */
type FarmerListener = (farmers: FarmerProfile[]) => void;
const farmerListeners = new Set<FarmerListener>();

export function notifyFarmerListeners(farmers: FarmerProfile[]): void {
  farmerListeners.forEach((listener) => listener(farmers));
}

export function subscribeToFarmers(listener: FarmerListener): () => void {
  farmerListeners.add(listener);
  return () => farmerListeners.delete(listener);
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
      farmerId: crop.farmerId,
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

  // Persist to all registered farms catalog so any customer or session can see this farm
  try {
    const rawRegistered = await AsyncStorage.getItem(REGISTERED_FARMERS_STORAGE_KEY);
    const existing: FarmerProfile[] = rawRegistered ? JSON.parse(rawRegistered) : [];
    const idx = existing.findIndex(
      (f) =>
        f.id === normalized.id ||
        (f.farmName && f.farmName.trim().toLowerCase() === normalized.farmName.trim().toLowerCase()) ||
        (f.mobileNumber && normalized.mobileNumber && f.mobileNumber.trim() === normalized.mobileNumber.trim())
    );
    let updatedList: FarmerProfile[];
    if (idx >= 0) {
      updatedList = existing.map((f, i) => (i === idx ? normalized : f));
    } else {
      updatedList = [normalized, ...existing];
    }
    await AsyncStorage.setItem(REGISTERED_FARMERS_STORAGE_KEY, JSON.stringify(updatedList));
    notifyFarmerListeners(updatedList);
  } catch (err) {
    console.error('Failed to update registered farmers catalog:', err);
  }

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
// Customer Profile (Profile tab first-time onboarding, persisted so it's
// only done once — the customer-side counterpart to FarmerProfile above)
// ---------------------------------------------------------------------------

/**
 * Simple pub/sub (same pattern as the farmer-profile-adjacent listeners in
 * this file) so ProfileScreen can react immediately the moment a customer
 * completes/edits registration, without a global state library.
 */
type UserProfileListener = (profile: CustomerProfile | null) => void;
const userProfileListeners = new Set<UserProfileListener>();

function notifyUserProfileListeners(profile: CustomerProfile | null): void {
  userProfileListeners.forEach((listener) => listener(profile));
}

/**
 * Subscribe to real-time customer-profile changes. Returns an unsubscribe
 * function.
 */
export function subscribeToUserProfile(listener: UserProfileListener): () => void {
  userProfileListeners.add(listener);
  return () => userProfileListeners.delete(listener);
}

/**
 * Generates a reasonably unique customer-profile id, same approach as
 * `generateFarmerId` above.
 */
export function generateCustomerId(): string {
  return `customer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Retrieve the persisted customer profile, or `null` if this device has
 * never completed the Profile tab's "Register as Customer" flow. `null` is
 * the signal ProfileScreen uses (alongside `getFarmerProfile`) to decide
 * whether to render the first-time onboarding choice cards.
 */
export async function getUserProfile(): Promise<CustomerProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_PROFILE_KEY);
    return raw ? (JSON.parse(raw) as CustomerProfile) : null;
  } catch (error) {
    console.error('Failed to read user profile from storage:', error);
    return null;
  }
}

/**
 * Persist the customer profile (creation on first-time registration, or a
 * future "Edit Details" update) and notify any live subscriber.
 *
 * Throws on failure — callers should catch this and inform the user rather
 * than assuming success (same convention as `saveFarmerProfile`).
 */
export async function saveUserProfile(profile: CustomerProfile): Promise<CustomerProfile> {
  await AsyncStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
  notifyUserProfileListeners(profile);
  return profile;
}

/**
 * Convenience check for "has this device registered as a customer at least
 * once?" — mirrors `hasCompletedFarmerOnboarding` above.
 */
export async function hasCompletedCustomerOnboarding(): Promise<boolean> {
  const profile = await getUserProfile();
  return profile !== null;
}

/**
 * Clears the saved customer profile entirely (e.g. a future Developer
 * Sandbox "Reset Onboarding" control, mirroring `clearFarmerProfile`).
 */
export async function clearUserProfile(): Promise<void> {
  await AsyncStorage.removeItem(USER_PROFILE_KEY);
  notifyUserProfileListeners(null);
}

const FAVORITE_FARMERS_KEY = '@ecoharvest/favorite-farmers';

/**
 * Retrieve the list of favorite farmer IDs bookmarked by the customer.
 */
export async function getFavoriteFarmerIds(): Promise<string[]> {
  try {
    const profile = await getUserProfile();
    if (profile?.favoriteFarmerIds) {
      return profile.favoriteFarmerIds;
    }
    const raw = await AsyncStorage.getItem(FAVORITE_FARMERS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch (error) {
    console.error('Failed to get favorite farmer IDs:', error);
    return [];
  }
}

/**
 * Check if a specific farmer is bookmarked in favorites.
 */
export async function isFarmerFavorited(farmerId: string): Promise<boolean> {
  const favorites = await getFavoriteFarmerIds();
  return favorites.includes(farmerId);
}

/**
 * Toggle a farmer ID in the customer's favorites list.
 */
export async function toggleFavoriteFarmer(farmerId: string): Promise<string[]> {
  try {
    const favorites = await getFavoriteFarmerIds();
    let updated: string[];
    if (favorites.includes(farmerId)) {
      updated = favorites.filter((id) => id !== farmerId);
    } else {
      updated = [...favorites, farmerId];
    }

    const profile = await getUserProfile();
    if (profile) {
      profile.favoriteFarmerIds = updated;
      await saveUserProfile(profile);
    }
    await AsyncStorage.setItem(FAVORITE_FARMERS_KEY, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.error('Failed to toggle favorite farmer:', error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Active App Mode (Customer Mode vs Farmer Mode bottom tab bar)
// ---------------------------------------------------------------------------
//
// Drives which five-tab layout TabNavigator.tsx renders (RootTabParamList
// vs FarmerTabParamList — see src/types/index.ts). Deliberately its own
// tiny storage key rather than a field on `FarmerProfile`: a device can have
// a farmer profile (onboarded once) yet currently be browsing in Customer
// Mode, and switching modes shouldn't touch/re-save the farmer profile at
// all.

/**
 * Simple pub/sub (same pattern as the cart/crop/order listeners above) so
 * TabNavigator can swap its bottom bar layout immediately the moment the
 * active mode changes — e.g. a "Switch to Farmer Mode" tap on the Profile
 * tab — without waiting for a remount or a focus event.
 */
type ActiveModeListener = (mode: AppMode) => void;
const activeModeListeners = new Set<ActiveModeListener>();

function notifyActiveModeListeners(mode: AppMode): void {
  activeModeListeners.forEach((listener) => listener(mode));
}

/**
 * Subscribe to real-time active-mode changes. Returns an unsubscribe
 * function. TabNavigator uses this (alongside an initial `getActiveMode()`
 * read) to keep its rendered tab set in sync with whatever the Profile
 * tab's mode toggle last set, from anywhere in the tree.
 */
export function subscribeToActiveMode(listener: ActiveModeListener): () => void {
  activeModeListeners.add(listener);
  return () => activeModeListeners.delete(listener);
}

/**
 * Retrieve the persisted active mode. Defaults to `'customer'` — both on a
 * fresh install (no key written yet) and if the stored value is ever
 * something unexpected — so a corrupted/foreign value can never strand the
 * app on an unrenderable tab layout.
 */
export async function getActiveMode(): Promise<AppMode> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_MODE_STORAGE_KEY);
    return raw === 'farmer' ? 'farmer' : 'customer';
  } catch (error) {
    console.error('Failed to read active mode from storage:', error);
    return 'customer';
  }
}

/**
 * Persist the active mode and notify every live subscriber (TabNavigator's
 * bottom bar chief among them) so the switch is reflected immediately.
 *
 * Intentionally does NOT check `hasCompletedFarmerOnboarding()` itself —
 * that gate belongs to the caller (ProfileScreen's "Switch to Farmer Mode"
 * action routes an un-onboarded farmer through `FarmerOnboardingScreen`
 * first and only calls this once onboarding is complete), so this helper
 * stays a plain, unconditional setter.
 */
export async function setActiveMode(mode: AppMode): Promise<AppMode> {
  await AsyncStorage.setItem(ACTIVE_MODE_STORAGE_KEY, mode);
  notifyActiveModeListeners(mode);
  return mode;
}

// ---------------------------------------------------------------------------
// Farmer-First: browsable farm directory
// ---------------------------------------------------------------------------
// `MOCK_FARMERS` is static demo data (there's no per-farmer AsyncStorage
// record for "other people's farms" the way `FARMER_PROFILE_STORAGE_KEY`
// holds the current device's own on-device profile), so these two helpers
// stay simple reads/filters over that directory rather than a full
// AsyncStorage-backed CRUD layer like `getCrops`/`saveCrops` above.

/**
 * All registered farmer profiles shown on the Farmer-First marketplace
 * (farm directory / "Browse Farms" screen).
 *
 * Previously this only returned `MOCK_FARMERS`, so a farmer who completed
 * (or edited) Screen M-02 onboarding — persisted separately under
 * `FARMER_PROFILE_STORAGE_KEY` via `saveFarmerProfile` — never showed up in
 * the directory no matter how many times Marketplace re-focused. This now
 * reads that on-device profile too and merges it in: if its id matches an
 * existing `MOCK_FARMERS` entry (e.g. an admin-verified seed farmer) the
 * live profile replaces it in place so edits are reflected; otherwise it's
 * a brand-new farmer and gets prepended so they appear first.
 *
 * Async (AsyncStorage-backed `getFarmerProfile` read), unlike the old
 * synchronous version — callers need `await`.
 */
export async function getFarmers(): Promise<FarmerProfile[]> {
  let registered: FarmerProfile[] = [];
  try {
    const rawRegistered = await AsyncStorage.getItem(REGISTERED_FARMERS_STORAGE_KEY);
    if (rawRegistered) {
      registered = JSON.parse(rawRegistered) as FarmerProfile[];
    }
  } catch (err) {
    console.error('Failed to read registered farmers from storage:', err);
  }

  const onDeviceProfile = await getFarmerProfile();
  if (onDeviceProfile) {
    const exists = registered.some(
      (f) =>
        f.id === onDeviceProfile.id ||
        (f.farmName && f.farmName.trim().toLowerCase() === onDeviceProfile.farmName.trim().toLowerCase())
    );
    if (!exists) {
      registered = [onDeviceProfile, ...registered];
    } else {
      registered = registered.map((f) =>
        f.id === onDeviceProfile.id ||
        (f.farmName && f.farmName.trim().toLowerCase() === onDeviceProfile.farmName.trim().toLowerCase())
          ? onDeviceProfile
          : f
      );
    }
  }

  // Merge registered with MOCK_FARMERS (registered farms take priority)
  const registeredIds = new Set(registered.map((f) => f.id));
  const registeredNames = new Set(registered.map((f) => f.farmName?.trim().toLowerCase()));
  const mockToAdd = MOCK_FARMERS.filter(
    (mf) => !registeredIds.has(mf.id) && !registeredNames.has(mf.farmName?.trim().toLowerCase())
  );
  const merged = [...registered, ...mockToAdd];

  // Asynchronously query live MongoDB backend to discover any newly added farms
  farmerApi
    .getAll()
    .then(async (res) => {
      if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
        const backendFarms: FarmerProfile[] = res.data.map((bf: any) => ({
          id: bf.farmerId || bf._id?.toString() || bf.id || generateFarmerId(),
          legalName: bf.ownerName || bf.legalName || 'Farm Owner',
          farmName: bf.farmName || 'EcoHarvest Farm',
          mobileNumber: bf.mobileNumber || '',
          province: bf.province || bf.location?.province || '',
          district: bf.district || bf.location?.district || '',
          city: bf.city || bf.location?.city || '',
          description: bf.description || '',
          slsiCertificateUri: bf.slsiCertificateUrl || null,
          verificationStatus:
            bf.slsiStatus === 'VERIFIED' || bf.isSLSIVerified
              ? 'VERIFIED'
              : bf.slsiStatus === 'REJECTED'
              ? 'REJECTED'
              : 'PENDING_VERIFICATION',
          isSLSIVerified: bf.isSLSIVerified || bf.slsiStatus === 'VERIFIED',
          commissionRate: bf.commissionRate || 5.0,
          farmCoverPhotoUrl: bf.farmCoverPhotoUrl || undefined,
          bankDetails: bf.bankDetails || {
            bankName: '',
            branchCode: '',
            accountNumber: '',
            accountHolderName: '',
          },
        }));

        let currentRegistered: FarmerProfile[] = [];
        try {
          const raw = await AsyncStorage.getItem(REGISTERED_FARMERS_STORAGE_KEY);
          if (raw) currentRegistered = JSON.parse(raw);
        } catch (_) {}

        let updated = [...currentRegistered];
        let hasNew = false;
        backendFarms.forEach((bf) => {
          const idx = updated.findIndex(
            (f) =>
              f.id === bf.id ||
              (f.farmName && f.farmName.trim().toLowerCase() === bf.farmName.trim().toLowerCase()) ||
              (f.mobileNumber && bf.mobileNumber && f.mobileNumber.trim() === bf.mobileNumber.trim())
          );
          if (idx >= 0) {
            updated[idx] = { ...updated[idx], ...bf };
          } else {
            updated.push(bf);
            hasNew = true;
          }
        });

        await AsyncStorage.setItem(REGISTERED_FARMERS_STORAGE_KEY, JSON.stringify(updated));
        if (hasNew) {
          notifyFarmerListeners(updated);
        }
      }
    })
    .catch(() => {
      // Offline fallback: keep local merged
    });

  return merged;
}

/**
 * Look up a single farm profile by id or farm name.
 * Checks the on-device profile, all registered profiles, static mock data,
 * and falls back to live MongoDB backend.
 */
export async function getFarmerById(farmerId: string): Promise<FarmerProfile | null> {
  const targetId = farmerId?.toString().trim();
  if (!targetId) return null;

  const onDeviceProfile = await getFarmerProfile();
  if (
    onDeviceProfile &&
    (onDeviceProfile.id === targetId ||
      onDeviceProfile.farmName.trim().toLowerCase() === targetId.toLowerCase())
  ) {
    return onDeviceProfile;
  }

  try {
    const rawRegistered = await AsyncStorage.getItem(REGISTERED_FARMERS_STORAGE_KEY);
    if (rawRegistered) {
      const registered: FarmerProfile[] = JSON.parse(rawRegistered);
      const match = registered.find(
        (f) =>
          f.id === targetId ||
          (f.farmName && f.farmName.trim().toLowerCase() === targetId.toLowerCase()) ||
          (f.mobileNumber && f.mobileNumber.trim() === targetId)
      );
      if (match) return match;
    }
  } catch (err) {
    console.error('Failed to read registered farmers from storage:', err);
  }

  const mockMatch = MOCK_FARMERS.find(
    (farmer) =>
      farmer.id === targetId ||
      farmer.farmName.trim().toLowerCase() === targetId.toLowerCase()
  );
  if (mockMatch) return mockMatch;

  // Fallback: fetch from live backend API
  try {
    const res = await farmerApi.getById(targetId);
    if (res && res.data) {
      const bf = res.data;
      return {
        id: bf.farmerId || bf._id?.toString() || bf.id || targetId,
        legalName: bf.ownerName || bf.legalName || 'Farm Owner',
        farmName: bf.farmName || 'EcoHarvest Farm',
        mobileNumber: bf.mobileNumber || '',
        province: bf.province || bf.location?.province || '',
        district: bf.district || bf.location?.district || '',
        city: bf.city || bf.location?.city || '',
        description: bf.description || '',
        slsiCertificateUri: bf.slsiCertificateUrl || null,
        verificationStatus:
          bf.slsiStatus === 'VERIFIED' || bf.isSLSIVerified
            ? 'VERIFIED'
            : bf.slsiStatus === 'REJECTED'
            ? 'REJECTED'
            : 'PENDING_VERIFICATION',
        isSLSIVerified: bf.isSLSIVerified || bf.slsiStatus === 'VERIFIED',
        commissionRate: bf.commissionRate || 5.0,
        farmCoverPhotoUrl: bf.farmCoverPhotoUrl || undefined,
        bankDetails: bf.bankDetails || {
          bankName: '',
          branchCode: '',
          accountNumber: '',
          accountHolderName: '',
        },
      };
    }
  } catch (_) {}

  return null;
}

/**
 * Every product/crop listing belonging to a single farm, for the Farm
 * Profile Page's product grid.
 * Matches by farmerId, farm.id, or farmName, and merges live products.
 */
export async function getProductsByFarmerId(farmerId: string): Promise<Crop[]> {
  const targetId = farmerId?.toString().trim();
  const farm = await getFarmerById(farmerId);
  const targetFarmName = farm?.farmName?.trim().toLowerCase();

  const storedCrops = await getCrops();
  const storedIds = new Set(storedCrops.map((crop) => crop.id));
  const mockOnly = MOCK_CROPS.filter((crop) => !storedIds.has(crop.id));
  const merged = [...storedCrops, ...mockOnly];

  // Try fetching products from backend in background to keep catalog synced
  if (targetId) {
    productApi
      .getAll({ farmerId: targetId })
      .then(async (res) => {
        if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
          const backendCrops: Crop[] = res.data.map((bp: any) => ({
            id: bp._id?.toString() || bp.id || generateCropId(),
            farmerId: bp.farmerId || targetId,
            name: bp.title || bp.name || 'Crop',
            category: bp.category || 'Vegetables',
            pricePerUnit: bp.pricePerKg || bp.pricePerUnit || 100,
            unit: bp.unit || '1kg',
            availableQtyKg: bp.availableQuantity || bp.availableQtyKg || 100,
            imageUrl:
              bp.imageUrl ||
              'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&q=60',
            isSLSIVerified: bp.isSLSIVerified ?? false,
            farmName: bp.farmName || farm?.farmName || '',
            province: bp.province || farm?.province || '',
            district: bp.district || farm?.district || '',
            city: bp.city || farm?.city || '',
          }));

          const existing = await getCrops();
          let changed = false;
          const currentMap = new Map(existing.map((c) => [c.id, c]));
          backendCrops.forEach((bc) => {
            if (!currentMap.has(bc.id)) {
              existing.unshift(bc);
              changed = true;
            }
          });
          if (changed) {
            await saveCrops(existing);
          }
        }
      })
      .catch(() => {});
  }

  return merged.filter((crop) => {
    const cFarmerId = crop.farmerId?.toString().trim();
    if (cFarmerId && cFarmerId === targetId) return true;
    if (farm?.id && cFarmerId === farm.id.toString().trim()) return true;
    if (targetFarmName && crop.farmName && crop.farmName.trim().toLowerCase() === targetFarmName) return true;
    return false;
  });
}

// ---------------------------------------------------------------------------
// Screen A-01: Verification Request Desk (SLSI Certificate Audit)
// Web-only Desktop Admin Command Panel data layer. Distinct storage key from
// `FARMER_PROFILE_STORAGE_KEY` above: that key holds the single on-device
// farmer's own profile (Screen M-02), while this one holds the admin's
// review *queue* of submitted applications (potentially many farmers, as a
// real backend would see). `updateVerificationStatus` is the bridge between
// the two — see its doc comment below.
// ---------------------------------------------------------------------------

const COMMISSION_RATE_DEFAULT = 5;
const COMMISSION_RATE_VERIFIED = 2.5;

/**
 * Two ready-made sample applications for the Screen A-01 Developer Sandbox
 * Toolbar (design.md Section 4): a clean, verifiable application and one
 * with a missing SLSI certificate asset, so an admin can exercise both the
 * Approve and Reject override paths without needing real submitted data.
 */
const SAMPLE_VALID_VERIFICATION_REQUEST: VerificationRequest = {
  farmerId: 'farmer_seed_valid_001',
  legalName: 'W.M. Sunil Perera',
  businessRegistrationNo: 'BRN-LK-88231',
  mobileNumber: '077 214 5590',
  bankDetails: {
    bankName: 'Bank of Ceylon',
    branchCode: '012',
    accountNumber: '0041278845',
    accountHolderName: 'W.M. Sunil Perera',
  },
  farmCoordinates: { latitude: 6.9497, longitude: 80.7891, district: 'Nuwara Eliya' },
  slsiCertificateUrl:
    'https://images.unsplash.com/photo-1568992687947-868a62a9f521?w=900&q=80',
  verificationStatus: 'PENDING',
  commissionRate: COMMISSION_RATE_DEFAULT,
  submittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
};

const SAMPLE_SUSPICIOUS_VERIFICATION_REQUEST: VerificationRequest = {
  farmerId: 'farmer_seed_suspicious_002',
  legalName: 'K.G. Ranjith Bandara',
  businessRegistrationNo: 'BRN-LK-00019',
  mobileNumber: '071 908 3312',
  bankDetails: {
    bankName: 'Peoples Bank',
    branchCode: '204',
    accountNumber: '9910034411',
    accountHolderName: 'K.G. Ranjith Bandara',
  },
  farmCoordinates: { latitude: 7.2906, longitude: 80.6337, district: 'Matale' },
  // Empty on purpose — simulates "missing SLSI credentials" (design.md
  // Section 4) so the Left Inspection Pane can render a missing-asset state.
  slsiCertificateUrl: '',
  verificationStatus: 'PENDING',
  commissionRate: COMMISSION_RATE_DEFAULT,
  submittedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
};

/**
 * Best-effort mapping onto a farm's `FarmCoordinates`, derived
 * deterministically from a seed string so the same farmer always lands on
 * the same pin without a real geocoding integration. Intentionally
 * self-contained (its own tiny hash) rather than reusing the
 * delivery-tracking section's `hashString` / `deterministicCoordinate)`,
 * since those are geared at order routing, not SLSI applications, and
 * keeping this local avoids a cross-section dependency.
 */
function deriveFarmCoordinateFromSeed(seed: string, district: string) {
  const safeSeed = typeof seed === 'string' && seed.length > 0 ? seed : 'farmer-seed';
  let hash = 0;
  for (let i = 0; i < safeSeed.length; i++) {
    hash = (hash * 31 + safeSeed.charCodeAt(i)) >>> 0;
  }
  const latOffset = ((hash % 1000) / 1000 - 0.5) * 2; // Sri Lanka spans ~+/-1 deg lat
  const lngOffset = (((hash >>> 10) % 1000) / 1000 - 0.5) * 2;
  return {
    latitude: 7.8731 + latOffset, // Sri Lanka's approximate geographic center
    longitude: 80.7718 + lngOffset,
    district: district || 'Unknown',
  };
}

/**
 * Builds a `VerificationRequest` from the single on-device `FarmerProfile`
 * (Screen M-02), so a farmer's real SLSI submission can be pushed into the
 * Screen A-01 admin queue — the bridge in the *opposite* direction from
 * `updateVerificationStatus`'s "Farmer Portal Sync" above.
 *
 * Fields that only exist on `VerificationRequest` (business registration
 * number, GPS coordinates) don't have a `FarmerProfile` equivalent yet, so
 * they're filled with a stable, clearly-labeled placeholder / a
 * deterministic mock coordinate rather than left blank.
 */
export function buildVerificationRequestFromProfile(
  profile: FarmerProfile
): VerificationRequest {
  return {
    farmerId: profile.id,
    legalName: profile.legalName,
    businessRegistrationNo: `SELF-REG-${profile.id.slice(-8).toUpperCase()}`,
    mobileNumber: profile.mobileNumber,
    bankDetails: { ...profile.bankDetails },
    farmCoordinates: deriveFarmCoordinateFromSeed(profile.id, profile.district),
    slsiCertificateUrl: profile.slsiCertificateUri ?? '',
    verificationStatus:
      profile.verificationStatus === 'VERIFIED'
        ? 'VERIFIED'
        : profile.verificationStatus === 'REJECTED'
        ? 'REJECTED'
        : 'PENDING',
    commissionRate: profile.commissionRate ?? COMMISSION_RATE_DEFAULT,
    submittedAt: new Date().toISOString(),
  };
}

/**
 * Initial pending queue seeded into AsyncStorage the first time
 * `getVerificationRequests` is ever called on a fresh install, so the
 * Verification Request Desk never opens empty (design.md: "Seed sample
 * pending SLSI verification requests if none exist").
 *
 * Before falling back to the two static samples, this checks whether the
 * on-device `FarmerProfile` already has a real `PENDING_VERIFICATION`
 * submission sitting in storage (e.g. a farmer submitted before the admin
 * ever opened Screen A-01) and, if so, prepends it — so a real submission
 * is never invisible just because it happened to be the very first thing
 * to touch this storage key.
 */
async function buildInitialVerificationRequests(): Promise<VerificationRequest[]> {
  try {
    const profile = await getFarmerProfile();
    if (
      profile &&
      (profile.verificationStatus === 'PENDING_VERIFICATION' ||
        profile.verificationStatus === 'VERIFIED' ||
        profile.verificationStatus === 'REJECTED')
    ) {
      const realRequest = buildVerificationRequestFromProfile(profile);
      return [realRequest];
    }
  } catch (error) {
    console.error(
      'Failed to check for an existing farmer submission while loading verification requests:',
      error
    );
  }

  return [];
}

/**
 * Simple pub/sub (same pattern as cart/crops/orders/notifications above) so
 * the Admin Command Panel's queue view can react immediately to an
 * approve/reject override without a global state library.
 *
 * NOTE — this only reaches listeners registered in the *same* JS runtime.
 * That's fine for changes made from inside this same tab/bundle, but
 * `AdminVerificationDeskScreen` is explicitly a separate top-level web
 * route/tab from `FarmerOnboardingScreen` (see its ARCHITECTURE NOTE), so a
 * farmer submitting from one browser tab runs in a completely different JS
 * module instance than the admin's tab — this `Set` is simply empty there.
 * See `subscribeToVerificationQueueAcrossTabs` below for the mechanism that
 * actually crosses tabs.
 */
type VerificationRequestListener = (requests: VerificationRequest[]) => void;
const verificationRequestListeners = new Set<VerificationRequestListener>();

function notifyVerificationRequestListeners(requests: VerificationRequest[]): void {
  verificationRequestListeners.forEach((listener) => listener(requests));
  broadcastVerificationQueueChange();
}

/**
 * Subscribe to real-time verification-queue updates from *this* tab/bundle.
 * Returns an unsubscribe function.
 */
export function subscribeToVerificationRequests(
  listener: VerificationRequestListener
): () => void {
  verificationRequestListeners.add(listener);
  return () => verificationRequestListeners.delete(listener);
}

// ---------------------------------------------------------------------------
// Cross-tab notification for the verification queue
// ---------------------------------------------------------------------------
//
// A plain `window.dispatchEvent(new Event(...))` — the usual first instinct
// here — does NOT solve this. DOM events (custom or native) never leave the
// document/tab that dispatched them; they cannot be observed by a listener
// registered in a different browser tab, even same-origin ones. Since
// `AdminVerificationDeskScreen` is meant to be opened as its own tab, we
// need one of the two browser primitives that are *actually* delivered
// across tabs:
//
//   1. `BroadcastChannel` — an explicit same-origin pub/sub channel. This is
//      the primary mechanism below: instant, and carries a small payload.
//   2. The native `storage` event — fires automatically on every *other*
//      open tab whenever `localStorage` is written (curiously, never on the
//      tab that wrote it), with zero code needed on the writing side. Kept
//      as a fallback for environments without `BroadcastChannel` (some
//      in-app/webview browsers, older Safari).
//
// Both are web-only; native (iOS/Android) app code never hits this file's
// `window` at all, so everything below no-ops safely there.
const VERIFICATION_QUEUE_CHANNEL_NAME = 'ecoharvest-verification-queue';
let verificationQueueChannel: BroadcastChannel | null = null;
let verificationQueueChannelInitAttempted = false;

function getVerificationQueueChannel(): BroadcastChannel | null {
  if (verificationQueueChannelInitAttempted) return verificationQueueChannel;
  verificationQueueChannelInitAttempted = true;
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null;
  }
  try {
    verificationQueueChannel = new BroadcastChannel(VERIFICATION_QUEUE_CHANNEL_NAME);
  } catch (error) {
    console.warn('BroadcastChannel unavailable for verification queue sync:', error);
    verificationQueueChannel = null;
  }
  return verificationQueueChannel;
}

/**
 * Pings any other open tab that the verification queue changed. Never
 * carries the actual data — subscribers should always re-fetch with
 * `getVerificationRequests()`, since the `storage`-event fallback path
 * can't safely carry a structured payload in every environment.
 */
function broadcastVerificationQueueChange(): void {
  const channel = getVerificationQueueChannel();
  if (!channel) return;
  try {
    channel.postMessage({ type: 'verification-queue-changed', at: Date.now() });
  } catch (error) {
    console.warn('Failed to broadcast verification queue change:', error);
  }
}

/**
 * Subscribe to verification-queue changes made from *another* browser tab —
 * e.g. a farmer submitting from the onboarding tab while the admin has the
 * Verification Desk open in a separate tab. Combines `BroadcastChannel`
 * (primary) with the native `storage` event (fallback) so callers don't
 * need to know about either mechanism. The callback only signals that
 * *something* changed; call `getVerificationRequests()` to get the fresh
 * data, the same way the window-focus listener already does.
 *
 * Never fires for a change made in the same tab that called it — pair this
 * with `subscribeToVerificationRequests` above for that case. No-ops safely
 * on native (iOS/Android) or during SSR.
 */
export function subscribeToVerificationQueueAcrossTabs(
  onRemoteChange: () => void
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const channel = getVerificationQueueChannel();
  const handleChannelMessage = (event: MessageEvent) => {
    if (event?.data?.type === 'verification-queue-changed') {
      onRemoteChange();
    }
  };
  channel?.addEventListener('message', handleChannelMessage);

  const handleStorageEvent = (event: StorageEvent) => {
    // `event.key` is `null` when a tab clears storage entirely; otherwise
    // only react to our specific key so unrelated writes (cart, crops,
    // notifications, etc.) don't trigger pointless verification refetches.
    if (event.key === null || event.key === VERIFICATION_REQUESTS_STORAGE_KEY) {
      onRemoteChange();
    }
  };
  window.addEventListener('storage', handleStorageEvent);

  return () => {
    channel?.removeEventListener('message', handleChannelMessage);
    window.removeEventListener('storage', handleStorageEvent);
  };
}

/**
 * Retrieve the full Screen A-01 verification queue, lazily seeding
 * `buildInitialVerificationRequests()` into AsyncStorage on first-ever
 * access. Never throws — falls back to `[]` on a storage read failure.
 */
export async function getVerificationRequests(): Promise<VerificationRequest[]> {
  try {
    const raw = await AsyncStorage.getItem(VERIFICATION_REQUESTS_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as VerificationRequest[];
    }
    const seeded = await buildInitialVerificationRequests();
    await AsyncStorage.setItem(VERIFICATION_REQUESTS_STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  } catch (error) {
    console.error('Failed to read verification requests from storage:', error);
    return [];
  }
}

/**
 * Persist the full verification queue and notify all live subscribers.
 * Throws on failure — same convention as `saveCrops`/`saveOrders` above.
 */
async function saveVerificationRequests(requests: VerificationRequest[]): Promise<void> {
  await AsyncStorage.setItem(VERIFICATION_REQUESTS_STORAGE_KEY, JSON.stringify(requests));
  notifyVerificationRequestListeners(requests);
}

/**
 * Retrieve a single queued application by `farmerId`, or `null` if it isn't
 * (or is no longer) in the queue.
 */
export async function getVerificationRequestByFarmerId(
  farmerId: string
): Promise<VerificationRequest | null> {
  const all = await getVerificationRequests();
  return all.find((r) => r.farmerId === farmerId) ?? null;
}

/**
 * Adds a new application to the queue, or overwrites the existing one with
 * the same `farmerId` if it's already there. This is what the Screen A-01
 * Developer Sandbox Toolbar's "Load Valid SLSI App" / "Load Suspicious App"
 * buttons call before displaying a sample in the workspace — it guarantees
 * the sample actually exists in the persisted queue, so a subsequent
 * Approve/Reject override (`updateVerificationStatus`) always has a real
 * record to update.
 */
export async function upsertVerificationRequest(
  request: VerificationRequest
): Promise<VerificationRequest[]> {
  const all = await getVerificationRequests();
  // Match on farmerId first (the primary key), falling back to
  // mobileNumber — this covers the case where a farmer's on-device id
  // changed (e.g. profile was reset and re-onboarded) but their phone
  // number is still the unique real-world identifier for the same
  // applicant, so a re-submission updates their existing row instead of
  // creating a duplicate queue entry.
  const existingIndex = all.findIndex(
    (r) =>
      r.farmerId === request.farmerId ||
      (!!request.mobileNumber && r.mobileNumber === request.mobileNumber)
  );
  const updated =
    existingIndex >= 0
      ? all.map((r, i) => (i === existingIndex ? request : r))
      : [request, ...all];
  await saveVerificationRequests(updated);
  return updated;
}

/**
 * Convenience entry point for `FarmerOnboardingScreen`: builds a
 * `VerificationRequest` from the current `FarmerProfile` via
 * `buildVerificationRequestFromProfile` and immediately upserts it into
 * the `@ecoharvest/verification-requests` queue, so an SLSI submission
 * (or a Developer Sandbox "Set Pending" tap) shows up on the Screen A-01
 * Admin Verification Desk right away instead of only living in
 * `@ecoharvest/farmer-profile`.
 *
 * No-ops (and never throws) if `profile` is `null`/`undefined`, since
 * there's nothing to sync before the farmer has completed onboarding at
 * least once.
 */
export async function syncFarmerProfileToVerificationQueue(
  profile: FarmerProfile | null | undefined
): Promise<VerificationRequest[] | null> {
  if (!profile) return null;
  const request = buildVerificationRequestFromProfile(profile);
  return upsertVerificationRequest(request);
}

/**
 * The Screen A-01 Sticky Admin Override Action Row's entry point (design.md
 * Section 3, "Real-Time Data Synchronization"). Updates the matching
 * application's `verificationStatus` and `commissionRate` in the admin
 * queue, then — critically — checks whether `farmerId` matches the single
 * on-device `FarmerProfile.id` (Screen M-02) and, if so, patches that
 * profile too, so `FarmerOnboardingScreen` picks up the new badge and
 * commission tier "immediately... upon next focus/render" without the two
 * screens needing any other shared state.
 *
 * Throws if `farmerId` isn't currently in the queue — callers (e.g. the
 * admin desk's Approve/Reject buttons) should only ever call this for a
 * request they already loaded from `getVerificationRequests` /
 * `upsertVerificationRequest`.
 */
export async function updateVerificationStatus(
  farmerId: string,
  status: 'VERIFIED' | 'REJECTED',
  commissionRate: number
): Promise<VerificationRequest[]> {
  const all = await getVerificationRequests();
  const index = all.findIndex((r) => r.farmerId === farmerId);
  if (index === -1) {
    throw new Error(
      `updateVerificationStatus: no verification request found for farmerId "${farmerId}".`
    );
  }

  const updatedRequests = all.map((r, i) =>
    i === index ? { ...r, verificationStatus: status, commissionRate } : r
  );
  await saveVerificationRequests(updatedRequests);

  // Farmer Portal Sync: mirror the decision onto the on-device profile if
  // it belongs to the same farmer.
  const farmerProfile = await getFarmerProfile();
  if (farmerProfile && farmerProfile.id === farmerId) {
    await saveFarmerProfile({
      ...farmerProfile,
      verificationStatus: status,
      isSLSIVerified: status === 'VERIFIED',
      commissionRate,
    });
  }

  return updatedRequests;
}

/**
 * Convenience wrapper around `updateVerificationStatus` for the green
 * "Approve Verification (Set 2-3% Commission)" button — always resolves to
 * `VERIFIED` at the 2.5% commission tier (design.md Section 3).
 */
export async function approveVerificationRequest(
  farmerId: string
): Promise<VerificationRequest[]> {
  return updateVerificationStatus(farmerId, 'VERIFIED', COMMISSION_RATE_VERIFIED);
}

/**
 * Convenience wrapper around `updateVerificationStatus` for the crimson
 * "Reject Application (Set 5% Commission / Default)" button — always
 * resolves to `REJECTED` at the default 5% commission tier.
 */
export async function rejectVerificationRequest(
  farmerId: string
): Promise<VerificationRequest[]> {
  return updateVerificationStatus(farmerId, 'REJECTED', COMMISSION_RATE_DEFAULT);
}

/**
 * Clears the persisted verification queue (Developer Sandbox reset).
 * Re-seeding happens automatically on the next `getVerificationRequests`
 * call.
 */
export async function clearVerificationRequests(): Promise<void> {
  await AsyncStorage.removeItem(VERIFICATION_REQUESTS_STORAGE_KEY);
  notifyVerificationRequestListeners([]);
}

/**
 * Exposes the two Developer Sandbox sample applications so
 * `AdminVerificationDeskScreen` doesn't need to hand-author fixture data
 * itself.
 */
export function getSampleVerificationRequests(): {
  valid: VerificationRequest;
  suspicious: VerificationRequest;
} {
  return {
    valid: { ...SAMPLE_VALID_VERIFICATION_REQUEST },
    suspicious: { ...SAMPLE_SUSPICIOUS_VERIFICATION_REQUEST },
  };
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
 * Every order containing at least one line item sold by a given farm — the
 * Farmer Mode Orders tab's "incoming customer orders for this farm" list
 * (FarmerOrdersScreen), as opposed to `getOrders()`'s full on-device order
 * history, which is scoped to the current *customer's* purchases.
 *
 * Matches on `CartItem.farmerId` (denormalized onto each item at
 * `addToCart` time — see `types/index.ts`), not `FarmGroup.farmName`, so a
 * farm that renames itself after an order was placed still matches by its
 * stable id. Orders whose items have no `farmerId` at all (e.g. sandbox/
 * demo crops predating the Farmer-First model) never match any farm and are
 * simply excluded, same convention as `getReviewsByFarmerId`. Newest first,
 * same ordering as `getOrders()`.
 */
export async function getOrdersByFarmerId(farmerId: string): Promise<Order[]> {
  const orders = await getOrders();
  return orders.filter((order) =>
    order.items.some((item) => item.farmerId === farmerId)
  );
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

  // Persist to backend MongoDB Express API for Admin Escrow tracking.
  // Awaited so failures are logged visibly (graceful degradation — the local
  // order is still returned even if the backend is unreachable).
  try {
    const userProfile = await getUserProfile();
    const customerId = userProfile?.id || userProfile?.phoneNumber || 'cust_anonymous';
    const customerName = userProfile?.fullName ? `${userProfile.fullName} (${customerId})` : customerId;
    const farmerId = cart[0]?.farmerId || '';
    let stripePaymentIntent = '';
    try {
      const piRes = await stripeApi.createPaymentIntent(summary.grandTotal, 'lkr');
      if (piRes && piRes.data && (piRes.data as any).id) {
        stripePaymentIntent = (piRes.data as any).id;
      }
    } catch (piErr) {
      console.log('Stripe live intent notice:', piErr);
    }

    await orderApi.create({
      orderId: order.id,
      customerId: customerName,
      farmerId,
      items: cart.map((item) => ({
        cropId: item.cropId || '',
        name: item.name,
        quantity: item.quantity,
        pricePerUnit: item.pricePerUnit,
        unit: item.unit || '1kg',
        farmerId: item.farmerId || '',
        farmName: item.farmName,
        province: item.province || '',
        district: item.district || '',
        city: item.city || '',
      })),
      farmGroups: farmGroups.map((g) => ({
        farmerId: g.items[0]?.farmerId || '',
        farmName: g.farmName,
        items: g.items.map((i) => ({
          cropId: i.cropId || '',
          name: i.name,
          quantity: i.quantity,
          pricePerUnit: i.pricePerUnit,
          unit: i.unit || '1kg',
          farmerId: i.farmerId || '',
          farmName: i.farmName,
        })),
        subtotal: g.subtotal,
        deliveryFee: 0,
      })),
      totalAmount: summary.grandTotal,
      total: summary.grandTotal,
      stripePaymentIntent,
      paymentMethod: 'STRIPE_ESCROW',
      deliveryAddress: {
        city: userProfile?.city || 'Colombo',
        district: userProfile?.district || 'Colombo',
      },
    });
    console.log(`ORDER SYNCED TO BACKEND: ${order.id} (Total: LKR ${summary.grandTotal})`);
  } catch (backendErr: any) {
    console.error(`ORDER BACKEND SYNC FAILED: ${order.id} — ${backendErr.message}`);
  }

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

/**
 * Alias for `submitProductReview`, exported under the more general name so
 * call sites that just want to "save a review" (e.g. a future non-M-07
 * review flow) don't need to know about the Screen M-07-specific name.
 * Same persistence, same `Order.isReviewed` side effect.
 */
export const saveReview = submitProductReview;

/**
 * Reviews left for a specific farm, newest first — every persisted review
 * whose `farmerId` matches, regardless of which order/crop it was left
 * against. Powers the average-rating badge on FarmerDetailScreen.
 * Reviews with no `farmerId` (pre-dating this field, or against an
 * orphaned demo crop with no real farm) are never included.
 */
export async function getReviewsByFarmerId(farmerId: string): Promise<ProductReview[]> {
  const reviews = await getProductReviews();
  return reviews
    .filter((r) => r.farmerId === farmerId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Average star rating + review count for a farm (FarmerDetailScreen's
 * "★ 4.5 (2)" badge). `average` is rounded to one decimal place; both
 * fields come back as `0` when the farm has no reviews yet — callers
 * should treat `count === 0` as "New" / "No reviews" rather than
 * rendering "★ 0.0".
 */
export async function getFarmerRating(
  farmerId: string
): Promise<{ average: number; count: number }> {
  const reviews = await getReviewsByFarmerId(farmerId);
  const count = reviews.length;
  if (count === 0) {
    return { average: 0, count: 0 };
  }
  const total = reviews.reduce((sum, r) => sum + r.rating, 0);
  const average = Math.round((total / count) * 10) / 10;
  return { average, count };
}

export interface FarmerFreshnessScore {
  average: number; // e.g. 94 (%)
  count: number;
  grade: string; // e.g. 'Grade A'
  isSLSIVerified: boolean;
  globalAverage: number; // platform average
}

/**
 * Calculates the average AI VGG16 freshness score for a specific farmer from all
 * product reviews, as well as the platform ecosystem average across all farmers.
 */
export async function getFarmerFreshnessScore(
  farmerId: string
): Promise<FarmerFreshnessScore> {
  const allReviews = await getProductReviews();
  const validAllReviews = allReviews.filter((r) => typeof r.aiFreshnessScore === 'number');
  
  const globalTotal = validAllReviews.reduce((sum, r) => sum + r.aiFreshnessScore, 0);
  const globalAverage = validAllReviews.length > 0
    ? Math.round(globalTotal / validAllReviews.length)
    : 93;

  const farmReviews = validAllReviews.filter((r) => r.farmerId === farmerId);
  const count = farmReviews.length;

  if (count === 0) {
    const farmer = await getFarmerById(farmerId);
    const isSLSI = Boolean(farmer?.isSLSIVerified);
    const benchmarkScore = isSLSI ? 95 : 88;
    return {
      average: benchmarkScore,
      count: 0,
      grade: benchmarkScore >= 85 ? 'Grade A (SLSI)' : 'Standard Grade',
      isSLSIVerified: isSLSI,
      globalAverage,
    };
  }

  const farmTotal = farmReviews.reduce((sum, r) => sum + r.aiFreshnessScore, 0);
  const average = Math.round(farmTotal / count);
  const isSLSIVerified = average >= 80;
  const grade = average >= 90 ? 'Grade A+ (SLSI)' : average >= 80 ? 'Grade A' : 'Standard';

  return {
    average,
    count,
    grade,
    isSLSIVerified,
    globalAverage,
  };
}

export async function getOverallFreshnessAverage(): Promise<{ average: number; count: number }> {
  const allReviews = await getProductReviews();
  const valid = allReviews.filter((r) => typeof r.aiFreshnessScore === 'number');
  if (valid.length === 0) return { average: 93, count: 0 };
  const total = valid.reduce((sum, r) => sum + r.aiFreshnessScore, 0);
  return { average: Math.round(total / valid.length), count: valid.length };
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

export interface ModerationResult {
  allowed: boolean;
  category?: 'NONE' | 'CONTACT_NUMBER' | 'EMAIL' | 'PROFANITY' | 'OFF_PLATFORM' | string;
  reason?: string;
  source?: string;
}

/**
 * Strict real-time content moderation engine with Gemini AI integration.
 * Evaluates messages and reviews for:
 * 1. Phone / WhatsApp numbers
 * 2. Email addresses
 * 3. Profanity & inappropriate language
 * Respects smart exemptions (weights, pricing, address numbers).
 */
export async function checkContentModeration(
  text: string,
  context: 'chat' | 'review' = 'chat'
): Promise<ModerationResult> {
  if (typeof text !== 'string') return { allowed: true, category: 'NONE', reason: '' };
  const trimmed = text.trim();
  if (!trimmed) return { allowed: true, category: 'NONE', reason: '' };

  // 1. Ultra-fast local regex pre-filter
  if (SL_MOBILE_REGEX.test(collapseSeparators(trimmed))) {
    return {
      allowed: false,
      category: 'CONTACT_NUMBER',
      reason: 'Sharing personal phone numbers is not permitted to protect platform safety.',
      source: 'local_filter',
    };
  }

  if (EMAIL_REGEX.test(trimmed)) {
    return {
      allowed: false,
      category: 'EMAIL',
      reason: 'Sharing email addresses is not permitted. Please keep all communication inside EcoHarvest.',
      source: 'local_filter',
    };
  }

  if (URL_REGEX.test(trimmed) || BARE_DOMAIN_REGEX.test(trimmed)) {
    return {
      allowed: false,
      category: 'OFF_PLATFORM',
      reason: 'External web links are not permitted.',
      source: 'local_filter',
    };
  }

  // 2. Deep semantic check via Gemini AI endpoint
  try {
    const res = await aiApi.moderateContent({ text: trimmed, context });
    if (res && res.success !== false) {
      return {
        allowed: res.allowed !== false,
        category: res.category || 'NONE',
        reason: res.reason || '',
        source: res.source || 'gemini_ai',
      };
    }
  } catch (err: any) {
    console.log('Gemini moderation check notice (offline mode active):', err?.message);
  }

  return { allowed: true, category: 'NONE', reason: '', source: 'heuristic' };
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

  const modResult = await checkContentModeration(trimmed, 'chat');
  const isBlocked = !modResult.allowed;

  const message: ChatMessage = {
    id: generateChatMessageId(),
    senderId: senderRole === 'CUSTOMER' ? 'current_customer' : 'current_farmer',
    senderRole,
    text: trimmed,
    isBlocked,
    blockedReason: isBlocked ? (modResult.reason || 'Restricted content detected') : undefined,
    timestamp: new Date().toISOString(),
  };

  const all = await getAllChatMessages();
  const threadMessages = all[threadId] ?? [];
  const updated = { ...all, [threadId]: [...threadMessages, message] };

  await saveAllChatMessages(updated, threadId);

  // Sync to MongoDB backend for live Admin Moderation interception
  messageApi
    .sendMessage({
      conversationId: threadId,
      senderId: message.senderId,
      senderRole: senderRole,
      text: trimmed,
    })
    .catch((err) => console.log('Chat backend message sync notice (offline mode active):', err.message));

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

// ---------------------------------------------------------------------------
// Help Desk & Dispute Resolution Storage Engine
// ---------------------------------------------------------------------------

type HelpTicketListener = (tickets: HelpTicket[]) => void;
const helpTicketListeners = new Set<HelpTicketListener>();

function notifyHelpTicketListeners(tickets: HelpTicket[]): void {
  helpTicketListeners.forEach((l) => l(tickets));
}

export function subscribeToHelpTickets(listener: HelpTicketListener): () => void {
  helpTicketListeners.add(listener);
  return () => helpTicketListeners.delete(listener);
}

export async function getAllHelpTickets(): Promise<HelpTicket[]> {
  try {
    // Attempt to fetch from backend API first
    const res = await helpDeskApi.getAdminTickets();
    if (res && res.data && Array.isArray(res.data)) {
      await AsyncStorage.setItem(HELP_TICKETS_STORAGE_KEY, JSON.stringify(res.data));
      return res.data;
    }
  } catch (err) {
    // Fallback to local storage
  }

  try {
    const raw = await AsyncStorage.getItem(HELP_TICKETS_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as HelpTicket[];
    }
    return [];
  } catch {
    return [];
  }
}

export async function getUserHelpTickets(userId?: string, role?: 'CUSTOMER' | 'FARMER'): Promise<HelpTicket[]> {
  const all = await getAllHelpTickets();
  if (userId) {
    const matched = all.filter((t) => t.userId === userId);
    if (matched.length > 0) return matched;
  }
  if (role) {
    return all.filter((t) => t.userRole === role);
  }
  return all;
}

export async function clearHelpTickets(): Promise<void> {
  await AsyncStorage.removeItem(HELP_TICKETS_STORAGE_KEY);
  notifyHelpTicketListeners([]);
}

export async function createHelpTicketLocal(payload: {
  userId: string;
  userName: string;
  userRole: 'CUSTOMER' | 'FARMER';
  userPhone?: string;
  orderId?: string;
  category: HelpTicketCategory;
  subject: string;
  priority?: HelpTicketPriority;
  message: string;
}): Promise<HelpTicket> {
  const newTicketId = `HD-${Math.floor(1000 + Math.random() * 9000)}`;
  const newTicket: HelpTicket = {
    ticketId: newTicketId,
    userId: payload.userId,
    userName: payload.userName,
    userRole: payload.userRole,
    userPhone: payload.userPhone || '',
    orderId: payload.orderId || '',
    category: payload.category,
    subject: payload.subject,
    priority: payload.priority || 'MEDIUM',
    status: 'OPEN',
    messages: [
      {
        senderRole: payload.userRole,
        senderId: payload.userId,
        senderName: payload.userName,
        text: payload.message,
        timestamp: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const apiRes = await helpDeskApi.createTicket(payload);
    if (apiRes && apiRes.data) {
      const tickets = await getAllHelpTickets();
      const updated = [apiRes.data, ...tickets.filter((t) => t.ticketId !== apiRes.data.ticketId)];
      await AsyncStorage.setItem(HELP_TICKETS_STORAGE_KEY, JSON.stringify(updated));
      notifyHelpTicketListeners(updated);
      return apiRes.data;
    }
  } catch (err) {
    console.warn('Backend ticket creation offline fallback:', err);
  }

  const all = await getAllHelpTickets();
  const updated = [newTicket, ...all];
  await AsyncStorage.setItem(HELP_TICKETS_STORAGE_KEY, JSON.stringify(updated));
  notifyHelpTicketListeners(updated);
  return newTicket;
}

export async function sendHelpTicketReply(
  ticketId: string,
  reply: {
    senderRole: 'CUSTOMER' | 'FARMER' | 'ADMIN' | 'SYSTEM';
    senderId?: string;
    senderName: string;
    text: string;
  }
): Promise<HelpTicket | null> {
  try {
    const res = await helpDeskApi.sendMessage(ticketId, reply);
    if (res && res.data) {
      const all = await getAllHelpTickets();
      const updated = all.map((t) => (t.ticketId === ticketId ? res.data : t));
      await AsyncStorage.setItem(HELP_TICKETS_STORAGE_KEY, JSON.stringify(updated));
      notifyHelpTicketListeners(updated);
      return res.data;
    }
  } catch (err) {
    console.warn('Backend ticket reply offline fallback:', err);
  }

  const all = await getAllHelpTickets();
  const existing = all.find((t) => t.ticketId === ticketId);
  if (!existing) return null;

  const newMsg: HelpTicketMessage = {
    senderRole: reply.senderRole,
    senderId: reply.senderId || '',
    senderName: reply.senderName,
    text: reply.text,
    timestamp: new Date().toISOString(),
  };

  let newStatus = existing.status;
  if (reply.senderRole === 'ADMIN' && existing.status === 'OPEN') {
    newStatus = 'IN_PROGRESS';
  } else if (reply.senderRole !== 'ADMIN' && (existing.status === 'RESOLVED' || existing.status === 'CLOSED')) {
    newStatus = 'OPEN';
  }

  const updatedTicket: HelpTicket = {
    ...existing,
    status: newStatus,
    messages: [...existing.messages, newMsg],
    updatedAt: new Date().toISOString(),
  };

  const updated = all.map((t) => (t.ticketId === ticketId ? updatedTicket : t));
  await AsyncStorage.setItem(HELP_TICKETS_STORAGE_KEY, JSON.stringify(updated));
  notifyHelpTicketListeners(updated);
  return updatedTicket;
}

export async function updateHelpTicketStatusLocal(
  ticketId: string,
  status: HelpTicketStatus,
  resolutionNotes?: string,
  adminName = 'Admin Team'
): Promise<HelpTicket | null> {
  try {
    const res = await helpDeskApi.updateTicketStatus(ticketId, { status, resolutionNotes, adminName });
    if (res && res.data) {
      const all = await getAllHelpTickets();
      const updated = all.map((t) => (t.ticketId === ticketId ? res.data : t));
      await AsyncStorage.setItem(HELP_TICKETS_STORAGE_KEY, JSON.stringify(updated));
      notifyHelpTicketListeners(updated);
      return res.data;
    }
  } catch (err) {
    console.warn('Backend ticket status update offline fallback:', err);
  }

  const all = await getAllHelpTickets();
  const existing = all.find((t) => t.ticketId === ticketId);
  if (!existing) return null;

  const msgs = [...existing.messages];
  if (resolutionNotes) {
    msgs.push({
      senderRole: 'ADMIN',
      senderId: 'admin_desk',
      senderName: adminName,
      text: `[RESOLUTION NOTE]: ${resolutionNotes}`,
      timestamp: new Date().toISOString(),
    });
  }

  const updatedTicket: HelpTicket = {
    ...existing,
    status,
    messages: msgs,
    resolutionNotes: resolutionNotes || existing.resolutionNotes,
    resolvedAt: status === 'RESOLVED' || status === 'CLOSED' ? new Date().toISOString() : existing.resolvedAt,
    updatedAt: new Date().toISOString(),
  };

  const updated = all.map((t) => (t.ticketId === ticketId ? updatedTicket : t));
  await AsyncStorage.setItem(HELP_TICKETS_STORAGE_KEY, JSON.stringify(updated));
  notifyHelpTicketListeners(updated);
  return updatedTicket;
}

export async function getOpenHelpTicketCount(role?: 'CUSTOMER' | 'FARMER'): Promise<number> {
  const tickets = await getAllHelpTickets();
  return tickets.filter((t) => (t.status === 'OPEN' || t.status === 'IN_PROGRESS') && (!role || t.userRole === role)).length;
}

// ---------------------------------------------------------------------------
// Bulk Order Process & History Sessions
// ---------------------------------------------------------------------------

const BULK_SESSIONS_STORAGE_KEY = '@ecoharvest/bulk-order-sessions';

export async function getBulkOrderSessions(customerId?: string): Promise<BulkOrderSession[]> {
  try {
    const raw = await AsyncStorage.getItem(BULK_SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw) as BulkOrderSession[];
    if (customerId) {
      return all.filter((s) => s.customerId === customerId || !s.customerId);
    }
    return all;
  } catch (e) {
    console.warn('Error reading bulk order sessions:', e);
    return [];
  }
}

export async function saveBulkOrderSession(session: BulkOrderSession): Promise<BulkOrderSession> {
  try {
    const all = await getBulkOrderSessions();
    const existingIdx = all.findIndex((s) => s.id === session.id);
    let updated: BulkOrderSession[];
    if (existingIdx >= 0) {
      updated = [...all];
      updated[existingIdx] = session;
    } else {
      updated = [session, ...all];
    }
    await AsyncStorage.setItem(BULK_SESSIONS_STORAGE_KEY, JSON.stringify(updated));
    return session;
  } catch (e) {
    console.warn('Error saving bulk order session:', e);
    return session;
  }
}

export async function deleteBulkOrderSession(sessionId: string): Promise<void> {
  try {
    const all = await getBulkOrderSessions();
    const filtered = all.filter((s) => s.id !== sessionId);
    await AsyncStorage.setItem(BULK_SESSIONS_STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.warn('Error deleting bulk order session:', e);
  }
}