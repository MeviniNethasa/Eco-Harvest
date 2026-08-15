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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CartItem, CartStackParamList, FarmGroup, OrderSummary } from '../types';
import {
  getCart,
  updateCartQuantity,
  removeFromCart,
  groupCartByFarm,
  calculateOrderSummary,
  createOrder,
} from '../utils/storage';

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

  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});

  const refreshCart = useCallback(async () => {
    setLoading(true);
    const latest = await getCart();
    setCart(latest);
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

  const handlePay = useCallback(async () => {
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primaryGreen} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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
                  Pay {formatLKR(summary.grandTotal)} via Stripe
                </Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

// --- Styles (Sections 1-3 of design.md) ---------------------------------------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgMain,
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
});