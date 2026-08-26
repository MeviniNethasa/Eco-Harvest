// src/screens/CartScreen.tsx
// Screen M-03: Unified Multi-Farmer Cart & Stripe Test Checkout

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CartItem, CartStackParamList, CustomerProfile, FarmGroup, OrderSummary } from '../types';
import {
  getCart,
  updateCartQuantity,
  removeFromCart,
  groupCartByFarm,
  calculateOrderSummary,
  createOrder,
  getUserProfile,
  saveUserProfile,
  generateCustomerId,
  setActiveMode,
} from '../utils/storage';
import { authApi } from '../services/api';
import HeaderBranding from '../components/HeaderBranding';

// --- Design tokens (Section 1 & 2 of design.md) -----------------------------

const colors = {
  primaryGreen: '#15803D',
  secondaryLeaf: '#16A34A',
  bgMain: '#FAFAFA',
  bgCard: '#F4F4F5',
  borderGray: '#E5E7EB',
  textDark: '#111827',
  textMuted: '#6B7280',
  accentPurple: '#7C3AED',
  danger: '#DC2626',
};

type CartNavProp = NativeStackNavigationProp<CartStackParamList, 'CartHome'>;

function formatLKR(amount: number): string {
  return `LKR ${amount.toLocaleString('en-LK')}`;
}

// --- Stripe test-mode form validation ---------------------------------------

function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function isValidExpiry(expiry: string): boolean {
  const match = /^(\d{2})\/(\d{2})$/.exec(expiry);
  if (!match) return false;
  const month = parseInt(match[1], 10);
  const year = parseInt(match[2], 10);
  if (month < 1 || month > 12) return false;

  const now = new Date();
  const currentYear = now.getFullYear() % 100;
  const currentMonth = now.getMonth() + 1;
  if (year < currentYear) return false;
  if (year === currentYear && month < currentMonth) return false;
  return true;
}

interface FormErrors {
  cardNumber?: string;
  expiry?: string;
  cvc?: string;
  postalCode?: string;
}

function validateForm(
  cardNumber: string,
  expiry: string,
  cvc: string,
  postalCode: string
): FormErrors {
  const errors: FormErrors = {};
  const cardDigits = cardNumber.replace(/\D/g, '');

  if (cardDigits.length !== 16) {
    errors.cardNumber = 'Enter a 16-digit test card number.';
  }
  if (!isValidExpiry(expiry)) {
    errors.expiry = 'Enter a valid future MM/YY date.';
  }
  if (!/^\d{3}$/.test(cvc)) {
    errors.cvc = 'CVC must be 3 digits.';
  }
  if (postalCode.trim().length < 4) {
    errors.postalCode = 'Enter a valid postal code.';
  }
  return errors;
}

// --- Sub-components ----------------------------------------------------------

function QuantityStepper({
  quantity,
  onChange,
}: {
  quantity: number;
  onChange: (next: number) => void;
}) {
  return (
    <View style={styles.stepperRow}>
      <Pressable
        style={styles.stepperButton}
        onPress={() => onChange(quantity - 1)}
        hitSlop={8}
      >
        <Ionicons name="remove" size={18} color={colors.textDark} />
      </Pressable>
      <Text style={styles.stepperValue}>{quantity}</Text>
      <Pressable
        style={styles.stepperButton}
        onPress={() => onChange(quantity + 1)}
        hitSlop={8}
      >
        <Ionicons name="add" size={18} color={colors.textDark} />
      </Pressable>
    </View>
  );
}

function CartItemRow({
  item,
  onQuantityChange,
  onRemove,
}: {
  item: CartItem;
  onQuantityChange: (cropId: string, quantity: number) => void;
  onRemove: (cropId: string) => void;
}) {
  const lineTotal = item.pricePerUnit * item.quantity;

  return (
    <View style={styles.itemRow}>
      <Image source={{ uri: item.imageUrl }} style={styles.itemThumbnail} />
      <View style={styles.itemDetails}>
        <Text style={styles.itemName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.itemUnitPrice}>
          {formatLKR(item.pricePerUnit)} / {item.unit}
        </Text>
        <QuantityStepper
          quantity={item.quantity}
          onChange={(next) => onQuantityChange(item.cropId, next)}
        />
      </View>
      <View style={styles.itemRightColumn}>
        <Pressable
          onPress={() => onRemove(item.cropId)}
          hitSlop={8}
          style={styles.trashButton}
        >
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </Pressable>
        <Text style={styles.itemLineTotal}>{formatLKR(lineTotal)}</Text>
      </View>
    </View>
  );
}

function FarmGroupCard({
  group,
  onQuantityChange,
  onRemove,
}: {
  group: FarmGroup;
  onQuantityChange: (cropId: string, quantity: number) => void;
  onRemove: (cropId: string) => void;
}) {
  return (
    <View style={styles.farmGroupCard}>
      <View style={styles.farmHeader}>
        <Text style={styles.farmTitle}>{group.farmName}</Text>
        <Text style={styles.farmSubtitle}>
          {group.district} • {group.distanceKm.toFixed(1)} km routing distance
        </Text>
      </View>
      {group.items.map((item) => (
        <CartItemRow
          key={item.cropId}
          item={item}
          onQuantityChange={onQuantityChange}
          onRemove={onRemove}
        />
      ))}
    </View>
  );
}

function OrderSummaryCard({ summary }: { summary: OrderSummary }) {
  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Items Subtotal</Text>
        <Text style={styles.summaryValue}>{formatLKR(summary.itemsSubtotal)}</Text>
      </View>

      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Uber Sandbox Delivery Fee</Text>
        <Text style={styles.summaryValue}>{summary.deliveryFeeLabel}</Text>
      </View>

      {summary.wholesaleDiscountPercent > 0 && (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Wholesale Volume Discount</Text>
          <View style={styles.discountTag}>
            <Text style={styles.discountTagText}>
              -{formatLKR(summary.wholesaleDiscount)} [{summary.wholesaleDiscountPercent}% Off]
            </Text>
          </View>
        </View>
      )}

      <View style={[styles.summaryRow, styles.grandTotalRow]}>
        <Text style={styles.grandTotalLabel}>Grand Total</Text>
        <Text style={styles.grandTotalValue}>{formatLKR(summary.grandTotal)}</Text>
      </View>
    </View>
  );
}

function StripeTestPaymentBox({
  cardNumber,
  expiry,
  cvc,
  postalCode,
  errors,
  onChangeCardNumber,
  onChangeExpiry,
  onChangeCvc,
  onChangePostalCode,
}: {
  cardNumber: string;
  expiry: string;
  cvc: string;
  postalCode: string;
  errors: FormErrors;
  onChangeCardNumber: (v: string) => void;
  onChangeExpiry: (v: string) => void;
  onChangeCvc: (v: string) => void;
  onChangePostalCode: (v: string) => void;
}) {
  return (
    <View style={styles.stripeBox}>
      <View style={styles.testModeBanner}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
        <Text style={styles.testModeBannerText}>
          Test Mode Active: Use card 4242 4242 4242 4242 for testing
        </Text>
      </View>

      <Text style={styles.fieldLabel}>Card Number</Text>
      <TextInput
        style={[styles.input, errors.cardNumber && styles.inputError]}
        value={cardNumber}
        onChangeText={(v) => onChangeCardNumber(formatCardNumber(v))}
        placeholder="4242 4242 4242 4242"
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        maxLength={19}
      />
      {!!errors.cardNumber && <Text style={styles.errorText}>{errors.cardNumber}</Text>}

      <View style={styles.rowFields}>
        <View style={styles.rowFieldHalf}>
          <Text style={styles.fieldLabel}>Expiry (MM/YY)</Text>
          <TextInput
            style={[styles.input, errors.expiry && styles.inputError]}
            value={expiry}
            onChangeText={(v) => onChangeExpiry(formatExpiry(v))}
            placeholder="12/28"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={5}
          />
          {!!errors.expiry && <Text style={styles.errorText}>{errors.expiry}</Text>}
        </View>
        <View style={styles.rowFieldHalf}>
          <Text style={styles.fieldLabel}>CVC</Text>
          <TextInput
            style={[styles.input, errors.cvc && styles.inputError]}
            value={cvc}
            onChangeText={(v) => onChangeCvc(v.replace(/\D/g, '').slice(0, 3))}
            placeholder="123"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={3}
            secureTextEntry
          />
          {!!errors.cvc && <Text style={styles.errorText}>{errors.cvc}</Text>}
        </View>
      </View>

      <Text style={styles.fieldLabel}>Postal / Zip Code</Text>
      <TextInput
        style={[styles.input, errors.postalCode && styles.inputError]}
        value={postalCode}
        onChangeText={onChangePostalCode}
        placeholder="10100"
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        maxLength={10}
      />
      {!!errors.postalCode && <Text style={styles.errorText}>{errors.postalCode}</Text>}
    </View>
  );
}

// --- Main screen --------------------------------------------------------------

export default function CartScreen() {
  const navigation = useNavigation<CartNavProp>();
  // CartScreen isn't wrapped in a SafeAreaView (its stack has
  // headerShown: false in TabNavigator.tsx), so the brand row has to
  // account for the status bar / Dynamic Island itself, same as
  // BulkOrdersScreen.tsx and OrdersScreen.tsx.
  const insets = useSafeAreaInsets();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [userProfile, setUserProfile] = useState<CustomerProfile | null>(null);

  // Authentication Modal State for Checkout Hand-off
  const [isAuthModalVisible, setIsAuthModalVisible] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authFullName, setAuthFullName] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState('');

  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});

  const refreshCart = useCallback(async () => {
    setLoading(true);
    const [latest, profile] = await Promise.all([
      getCart(),
      getUserProfile(),
    ]);
    setCart(latest);
    setUserProfile(profile);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshCart();
    }, [refreshCart])
  );

  const farmGroups = useMemo(() => groupCartByFarm(cart), [cart]);
  const summary = useMemo(() => calculateOrderSummary(cart), [cart]);

  const handleQuantityChange = useCallback(
    async (cropId: string, quantity: number) => {
      const updated = await updateCartQuantity(cropId, quantity);
      setCart(updated);
    },
    []
  );

  const handleRemove = useCallback((cropId: string) => {
    Alert.alert('Remove item', 'Remove this item from your cart?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const updated = await removeFromCart(cropId);
          setCart(updated);
        },
      },
    ]);
  }, []);

  // Handle Sign In / Sign Up from Cart
  const handleCartAuth = async () => {
    if (!authFullName.trim()) {
      setAuthError('Full name is required.');
      return;
    }
    if (authMode === 'signup' && !authPhone.trim()) {
      setAuthError('Phone number is required.');
      return;
    }
    if (!authPassword.trim() || authPassword.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      return;
    }

    setIsAuthenticating(true);
    setAuthError('');
    try {
      if (authMode === 'signup') {
        const regRes = await authApi.register({
          fullName: authFullName.trim(),
          phoneNumber: authPhone.trim(),
          password: authPassword.trim(),
          role: 'CUSTOMER',
          city: 'Colombo',
          district: 'Colombo',
          province: 'Western',
        });

        if (regRes.success && regRes.data) {
          const user = regRes.data;
          const newProfile: CustomerProfile = {
            id: user.id || generateCustomerId(),
            fullName: user.fullName || authFullName.trim(),
            phoneNumber: user.phoneNumber || authPhone.trim(),
            city: user.city || 'Colombo',
            district: user.district || 'Colombo',
            subscriptionPlan: 'STANDARD',
            favoriteFarmerIds: [],
            createdAt: new Date().toISOString(),
          };
          await saveUserProfile(newProfile);
          await setActiveMode('customer');
          setUserProfile(newProfile);
          setIsAuthModalVisible(false);
          setAuthFullName('');
          setAuthPhone('');
          setAuthPassword('');
          Alert.alert('Welcome to EcoHarvest!', `Signed up as ${newProfile.fullName}. You can now complete your checkout.`);
        } else {
          setAuthError(regRes.message || 'Registration failed.');
        }
      } else {
        const loginRes = await authApi.login({
          fullName: authFullName.trim(),
          password: authPassword.trim(),
        });

        if (loginRes.success && loginRes.data) {
          const user = loginRes.data;
          const customerData: CustomerProfile = {
            id: user.id || generateCustomerId(),
            fullName: user.fullName,
            phoneNumber: user.phoneNumber,
            city: user.city || '',
            district: user.district || '',
            subscriptionPlan: user.subscriptionPlan || 'STANDARD',
            favoriteFarmerIds: user.favoriteFarmerIds || [],
            createdAt: new Date().toISOString(),
          };
          await saveUserProfile(customerData);
          await setActiveMode('customer');
          setUserProfile(customerData);
          setIsAuthModalVisible(false);
          setAuthFullName('');
          setAuthPassword('');
          Alert.alert('Welcome Back!', `Signed in as ${user.fullName}. You can now proceed to pay.`);
        } else {
          setAuthError(loginRes.message || 'Invalid full name or password.');
        }
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handlePay = useCallback(async () => {
    // Redirect / prompt to sign in if not logged in
    const profile = await getUserProfile();
    if (!profile) {
      setAuthMode('signin');
      setAuthError('');
      setIsAuthModalVisible(true);
      return;
    }

    const validationErrors = validateForm(cardNumber, expiry, cvc, postalCode);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }
    if (cart.length === 0) {
      Alert.alert('Your cart is empty', 'Add items before checking out.');
      return;
    }

    setSubmitting(true);
    try {
      const digits = cardNumber.replace(/\D/g, '');
      const order = await createOrder({
        cardBrand: 'Visa (Test)',
        cardLast4: digits.slice(-4),
        expiry,
        postalCode,
      });

      setCart([]);
      navigation.navigate('OrderTracking', { orderId: order.id });
    } catch (error) {
      console.error('Failed to create order:', error);
      Alert.alert(
        'Payment failed',
        'We could not process your test payment. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }, [cardNumber, expiry, cvc, postalCode, cart, navigation]);

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <View style={[styles.brandRow, { paddingTop: insets.top || 16 }]}>
          <HeaderBranding />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primaryGreen} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Brand Row — Header Branding Standardization Spec Section 3.2.
          Sits above the existing back/title header rather than replacing
          it, matching the pattern used on Orders/Bulk/Marketplace. Uses
          useSafeAreaInsets directly (no SafeAreaView wrapper here) so it
          clears the status bar / Dynamic Island on every device. */}
      <View style={[styles.brandRow, { paddingTop: insets.top || 16 }]}>
        <HeaderBranding />
      </View>

      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.textDark} />
        </Pressable>
        <Text style={styles.headerTitle}>Your Cart & Checkout</Text>
        <View style={{ width: 24 }} />
      </View>

      {cart.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="cart-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyStateText}>Your cart is empty</Text>
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.scrollBody}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {farmGroups.map((group) => (
              <FarmGroupCard
                key={group.farmName}
                group={group}
                onQuantityChange={handleQuantityChange}
                onRemove={handleRemove}
              />
            ))}

            <OrderSummaryCard summary={summary} />

            {/* If user is not logged in, show prominent Sign In prompt card */}
            {!userProfile && (
              <View style={styles.authBanner}>
                <View style={styles.authBannerIconBox}>
                  <Ionicons name="lock-closed" size={22} color="#15803D" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.authBannerTitle}>Sign in to complete checkout</Text>
                  <Text style={styles.authBannerSubtitle}>
                    Please sign in or create an account so we can link your delivery address and order tracking.
                  </Text>
                  <View style={styles.authBannerBtnRow}>
                    <Pressable
                      style={styles.authBannerSignInBtn}
                      onPress={() => {
                        setAuthMode('signin');
                        setAuthError('');
                        setIsAuthModalVisible(true);
                      }}
                    >
                      <Ionicons name="log-in-outline" size={15} color="#FFFFFF" style={{ marginRight: 4 }} />
                      <Text style={styles.authBannerSignInBtnText}>Sign In</Text>
                    </Pressable>
                    <Pressable
                      style={styles.authBannerSignUpBtn}
                      onPress={() => {
                        setAuthMode('signup');
                        setAuthError('');
                        setIsAuthModalVisible(true);
                      }}
                    >
                      <Text style={styles.authBannerSignUpBtnText}>Sign Up</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}

            <StripeTestPaymentBox
              cardNumber={cardNumber}
              expiry={expiry}
              cvc={cvc}
              postalCode={postalCode}
              errors={errors}
              onChangeCardNumber={setCardNumber}
              onChangeExpiry={setExpiry}
              onChangeCvc={setCvc}
              onChangePostalCode={setPostalCode}
            />
          </ScrollView>

          <View style={styles.bottomBar}>
            <Pressable
              style={[styles.payButton, submitting && styles.payButtonDisabled]}
              onPress={handlePay}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.payButtonText}>
                  {!userProfile
                    ? `Sign In to Pay ${formatLKR(summary.grandTotal)}`
                    : `Pay ${formatLKR(summary.grandTotal)} via Stripe`}
                </Text>
              )}
            </Pressable>
          </View>
        </>
      )}

      {/* ---------------- Checkout Authentication Modal ---------------- */}
      <Modal
        visible={isAuthModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsAuthModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.modalIconBox}>
                  <Ionicons name="cart" size={20} color="#15803D" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>
                    {authMode === 'signin' ? 'Sign In to Pay' : 'Create Customer Account'}
                  </Text>
                  <Text style={styles.modalSubtitle}>
                    {authMode === 'signin'
                      ? 'Enter your name and password to continue'
                      : 'Sign up to place your order and track delivery'}
                  </Text>
                </View>
              </View>
              <Pressable onPress={() => setIsAuthModalVisible(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </Pressable>
            </View>

            {/* Toggle Tabs */}
            <View style={styles.authToggleRow}>
              <Pressable
                style={[styles.authToggleBtn, authMode === 'signin' && styles.authToggleBtnActive]}
                onPress={() => {
                  setAuthMode('signin');
                  setAuthError('');
                }}
              >
                <Text
                  style={[
                    styles.authToggleBtnText,
                    authMode === 'signin' && styles.authToggleBtnTextActive,
                  ]}
                >
                  Sign In
                </Text>
              </Pressable>
              <Pressable
                style={[styles.authToggleBtn, authMode === 'signup' && styles.authToggleBtnActive]}
                onPress={() => {
                  setAuthMode('signup');
                  setAuthError('');
                }}
              >
                <Text
                  style={[
                    styles.authToggleBtnText,
                    authMode === 'signup' && styles.authToggleBtnTextActive,
                  ]}
                >
                  New Customer? Sign Up
                </Text>
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.modalBody}
              keyboardShouldPersistTaps="handled"
            >
              {!!authError && (
                <View style={styles.authErrorBox}>
                  <Ionicons name="alert-circle" size={16} color="#DC2626" />
                  <Text style={styles.authErrorText}>{authError}</Text>
                </View>
              )}

              <View style={styles.modalField}>
                <Text style={styles.modalFieldLabel}>Full Name *</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. John Perera"
                  placeholderTextColor="#9CA3AF"
                  value={authFullName}
                  onChangeText={(text) => {
                    setAuthFullName(text);
                    setAuthError('');
                  }}
                  autoCapitalize="words"
                />
              </View>

              {authMode === 'signup' && (
                <View style={styles.modalField}>
                  <Text style={styles.modalFieldLabel}>Phone Number *</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="07X XXXXXXX"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="phone-pad"
                    value={authPhone}
                    onChangeText={(text) => {
                      setAuthPhone(text);
                      setAuthError('');
                    }}
                    maxLength={10}
                  />
                </View>
              )}

              <View style={styles.modalField}>
                <Text style={styles.modalFieldLabel}>Password *</Text>
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Enter your password (min 6 chars)"
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry={!showAuthPassword}
                    value={authPassword}
                    onChangeText={(text) => {
                      setAuthPassword(text);
                      setAuthError('');
                    }}
                  />
                  <Pressable
                    style={styles.eyeBtn}
                    onPress={() => setShowAuthPassword((prev) => !prev)}
                    hitSlop={8}
                  >
                    <Ionicons
                      name={showAuthPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color="#6B7280"
                    />
                  </Pressable>
                </View>
              </View>

              <View style={styles.modalActionRow}>
                <Pressable
                  style={styles.modalCancelBtn}
                  onPress={() => setIsAuthModalVisible(false)}
                  disabled={isAuthenticating}
                >
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalSubmitBtn, isAuthenticating && { opacity: 0.6 }]}
                  onPress={handleCartAuth}
                  disabled={isAuthenticating}
                >
                  {isAuthenticating ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.modalSubmitBtnText}>
                      {authMode === 'signin' ? 'Sign In & Continue' : 'Sign Up & Continue'}
                    </Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// --- Styles (Sections 1-3 of design.md) ---------------------------------------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgMain,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderGray,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderGray,
    backgroundColor: colors.bgMain,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textDark,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 16,
  },

  // Farm group card
  farmGroupCard: {
    borderWidth: 1,
    borderColor: colors.borderGray,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  farmHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderGray,
    backgroundColor: colors.bgCard,
  },
  farmTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textDark,
  },
  farmSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Item row
  itemRow: {
    flexDirection: 'row',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderGray,
  },
  itemThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 6,
    backgroundColor: colors.bgCard,
  },
  itemDetails: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
    gap: 4,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textDark,
  },
  itemUnitPrice: {
    fontSize: 12,
    color: colors.textMuted,
  },
  itemRightColumn: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  trashButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  itemLineTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textDark,
  },

  // Stepper
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  stepperButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500',
    color: colors.textDark,
  },

  // Order summary
  summaryCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.textDark,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textDark,
  },
  discountTag: {
    backgroundColor: 'rgba(124, 58, 237, 0.1)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  discountTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accentPurple,
  },
  grandTotalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.borderGray,
    paddingTop: 10,
    marginTop: 2,
  },
  grandTotalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textDark,
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textDark,
  },

  // Stripe box
  stripeBox: {
    borderWidth: 1,
    borderColor: colors.borderGray,
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  testModeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bgCard,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  testModeBannerText: {
    flex: 1,
    fontSize: 12,
    color: colors.textMuted,
  },
  fieldLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: colors.borderGray,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.textDark,
  },
  inputError: {
    borderColor: colors.danger,
  },
  errorText: {
    fontSize: 11,
    color: colors.danger,
    marginTop: 4,
  },
  rowFields: {
    flexDirection: 'row',
    gap: 12,
  },
  rowFieldHalf: {
    flex: 1,
  },

  // Sticky bottom bar
  bottomBar: {
    height: 80,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderGray,
    backgroundColor: colors.bgMain,
    justifyContent: 'center',
  },
  payButton: {
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.primaryGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payButtonDisabled: {
    opacity: 0.6,
  },
  payButtonText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.25,
    color: '#FFFFFF',
  },

  // Auth Banner in Cart
  authBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 12,
    padding: 14,
    gap: 12,
    marginBottom: 16,
  },
  authBannerIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  authBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#15803D',
  },
  authBannerSubtitle: {
    fontSize: 12,
    color: '#4B5563',
    marginTop: 2,
    lineHeight: 16,
  },
  authBannerBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  authBannerSignInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#15803D',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  authBannerSignInBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  authBannerSignUpBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  authBannerSignUpBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },

  // Auth Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },
  authToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    padding: 4,
    marginHorizontal: 20,
    marginTop: 14,
    borderRadius: 10,
  },
  authToggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  authToggleBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  authToggleBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  authToggleBtnTextActive: {
    color: '#15803D',
    fontWeight: '700',
  },
  modalBody: {
    padding: 20,
    gap: 12,
  },
  authErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: 10,
    borderRadius: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  authErrorText: {
    fontSize: 12,
    color: '#DC2626',
    flex: 1,
  },
  modalField: {
    gap: 4,
  },
  modalFieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  modalInput: {
    height: 44,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#FAFAFA',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 12,
  },
  passwordInput: {
    flex: 1,
    height: 44,
    fontSize: 14,
    color: '#111827',
  },
  eyeBtn: {
    padding: 6,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  modalCancelBtn: {
    flex: 1,
    height: 44,
    backgroundColor: '#F4F4F5',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
  },
  modalSubmitBtn: {
    flex: 2,
    height: 44,
    backgroundColor: '#15803D',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubmitBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});