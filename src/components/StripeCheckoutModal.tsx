// src/components/StripeCheckoutModal.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface StripeCheckoutModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  planTitle?: string;
  planPrice?: string;
  description?: string;
}

const colors = {
  primaryGreen: '#15803D',
  secondaryLeaf: '#16A34A',
  bgCard: '#FFFFFF',
  borderGray: '#E5E7EB',
  textDark: '#111827',
  textMuted: '#6B7280',
  stripePurple: '#635BFF',
  errorRed: '#DC2626',
};

function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 16);
  const groups = digits.match(/.{1,4}/g);
  return groups ? groups.join(' ') : digits;
}

function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length >= 2) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return digits;
}

export default function StripeCheckoutModal({
  visible,
  onClose,
  onSuccess,
  planTitle = 'EcoHarvest pro plan',
  planPrice = 'LKR 500 / month',
  description = 'Recurring monthly subscription for AI Bulk Orders Workspace & verified farm matching.',
}: StripeCheckoutModalProps) {
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [expiry, setExpiry] = useState('12/28');
  const [cvc, setCvc] = useState('123');
  const [postalCode, setPostalCode] = useState('10100');
  const [cardholderName, setCardholderName] = useState('John Doe');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    const rawCard = cardNumber.replace(/\s/g, '');
    if (rawCard.length < 16) next.cardNumber = 'Enter a valid 16-digit card number.';
    if (!expiry.includes('/') || expiry.length < 5) next.expiry = 'MM/YY required.';
    if (cvc.length < 3) next.cvc = 'CVC required.';
    if (!cardholderName.trim()) next.cardholderName = 'Name is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handlePay = () => {
    if (!validate()) return;
    setIsProcessing(true);

    // Simulate Stripe payment processing
    setTimeout(() => {
      setIsProcessing(false);
      onSuccess();
    }, 800);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.stripeBrandRow}>
              <View style={styles.stripeBadge}>
                <Text style={styles.stripeBadgeText}>stripe</Text>
              </View>
              <Text style={styles.checkoutTitle}>Secure Checkout</Text>
            </View>
            <Pressable
              onPress={onClose}
              disabled={isProcessing}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Plan summary */}
            <View style={styles.planSummaryCard}>
              <View style={styles.planIconCircle}>
                <Ionicons name="cube" size={22} color={colors.primaryGreen} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.planTitle}>{planTitle}</Text>
                <Text style={styles.planPrice}>{planPrice}</Text>
                <Text style={styles.planDescription}>{description}</Text>
              </View>
            </View>

            {/* Test Mode Banner */}
            <View style={styles.testModeBanner}>
              <Ionicons name="information-circle" size={16} color="#4338CA" />
              <Text style={styles.testModeBannerText}>
                Stripe Sandbox Active: Preloaded with test card 4242
              </Text>
            </View>

            {/* Cardholder Name */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Cardholder Name</Text>
              <TextInput
                style={[styles.input, errors.cardholderName && styles.inputError]}
                value={cardholderName}
                onChangeText={setCardholderName}
                placeholder="Full name on card"
                placeholderTextColor={colors.textMuted}
              />
              {!!errors.cardholderName && <Text style={styles.errorText}>{errors.cardholderName}</Text>}
            </View>

            {/* Card Number */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Card Number</Text>
              <View style={styles.cardInputWrapper}>
                <Ionicons name="card-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.inputWithIcon, errors.cardNumber && styles.inputError]}
                  value={cardNumber}
                  onChangeText={(v) => setCardNumber(formatCardNumber(v))}
                  placeholder="4242 4242 4242 4242"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={19}
                />
              </View>
              {!!errors.cardNumber && <Text style={styles.errorText}>{errors.cardNumber}</Text>}
            </View>

            {/* Expiry, CVC & ZIP in a row */}
            <View style={styles.rowGap}>
              <View style={styles.flexOne}>
                <Text style={styles.label}>Expires</Text>
                <TextInput
                  style={[styles.input, errors.expiry && styles.inputError]}
                  value={expiry}
                  onChangeText={(v) => setExpiry(formatExpiry(v))}
                  placeholder="MM/YY"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={5}
                />
                {!!errors.expiry && <Text style={styles.errorText}>{errors.expiry}</Text>}
              </View>

              <View style={styles.flexOne}>
                <Text style={styles.label}>CVC</Text>
                <TextInput
                  style={[styles.input, errors.cvc && styles.inputError]}
                  value={cvc}
                  onChangeText={setCvc}
                  placeholder="123"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={4}
                  secureTextEntry
                />
                {!!errors.cvc && <Text style={styles.errorText}>{errors.cvc}</Text>}
              </View>

              <View style={styles.flexOne}>
                <Text style={styles.label}>Postal Code</Text>
                <TextInput
                  style={styles.input}
                  value={postalCode}
                  onChangeText={setPostalCode}
                  placeholder="ZIP"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>

            <View style={styles.securityNote}>
              <Ionicons name="lock-closed" size={14} color="#15803D" />
              <Text style={styles.securityNoteText}>
                Encrypted via Stripe 256-bit SSL. Cancel anytime.
              </Text>
            </View>

            {/* Buttons */}
            <View style={[styles.rowGap, { marginTop: 16, marginBottom: 20 }]}>
              <Pressable
                style={[styles.cancelButton, styles.flexOne]}
                onPress={onClose}
                disabled={isProcessing}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.payButton, styles.flexOne, isProcessing && { opacity: 0.7 }]}
                onPress={handlePay}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.payButtonText}>Subscribe & Pay</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  stripeBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stripeBadge: {
    backgroundColor: colors.stripePurple,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  stripeBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  checkoutTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textDark,
  },
  planSummaryCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    gap: 12,
  },
  planIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primaryGreen,
  },
  planPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textDark,
    marginTop: 2,
  },
  planDescription: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  testModeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 8,
    padding: 10,
    gap: 8,
    marginBottom: 14,
  },
  testModeBannerText: {
    fontSize: 12,
    color: '#3730A3',
    fontWeight: '500',
    flex: 1,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textDark,
    marginBottom: 5,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.borderGray,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.textDark,
    backgroundColor: '#FAFAFA',
  },
  cardInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderGray,
    borderRadius: 8,
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 10,
  },
  inputIcon: {
    marginRight: 6,
  },
  inputWithIcon: {
    flex: 1,
    minHeight: 44,
    fontSize: 14,
    color: colors.textDark,
  },
  inputError: {
    borderColor: colors.errorRed,
  },
  errorText: {
    fontSize: 11,
    color: colors.errorRed,
    marginTop: 3,
  },
  rowGap: {
    flexDirection: 'row',
    gap: 8,
  },
  flexOne: {
    flex: 1,
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  securityNoteText: {
    fontSize: 12,
    color: colors.primaryGreen,
    fontWeight: '500',
  },
  cancelButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.borderGray,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F4F5',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textDark,
  },
  payButton: {
    minHeight: 44,
    backgroundColor: colors.primaryGreen,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
