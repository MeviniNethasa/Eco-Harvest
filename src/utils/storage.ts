// src/utils/storage.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import { CartItem, Crop } from '../types';

const CART_STORAGE_KEY = '@ecoharvest/cart';

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