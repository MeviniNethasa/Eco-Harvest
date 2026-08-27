// src/screens/RegisterCustomerScreen.tsx
//
// Customer Account Registration Screen with Registration-Level Bulk Buyer Opt-In
// Allows users to register directly and choose between Standard Plan and Bulk Order Access Plan.

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { PROVINCES, getDistricts, getCities } from '../data/sriLankaLocations';
import StandardHeader from '../components/StandardHeader';
import StripeCheckoutModal from '../components/StripeCheckoutModal';
import MapLocationPickerModal, { SelectedLocationData } from '../components/MapLocationPickerModal';
import { authApi, stripeApi } from '../services/api';
import { generateCustomerId, saveUserProfile, setActiveMode } from '../utils/storage';
import { showFeedback } from '../components/FeedbackPopup';
import type { CustomerProfile, SubscriptionPlan } from '../types';
import type { ProfileStackParamList } from '../navigation/TabNavigator';

const tokens = {
  colorPrimaryGreen: '#15803D',
  colorSecondaryLeaf: '#16A34A',
  colorBgMain: '#FAFAFA',
  colorBgCard: '#FFFFFF',
  colorBorderGray: '#E5E7EB',
  colorTextDark: '#111827',
  colorTextMuted: '#6B7280',
  colorAlertCrimson: '#DC2626',
  colorEmeraldLight: '#DCFCE7',
  colorEmeraldSubtle: '#F0FDF4',
};

const SUBSCRIPTION_PLANS: {
  value: SubscriptionPlan;
  label: string;
  price: string;
  description: string;
  isBulk: boolean;
}[] = [
    {
      value: 'STANDARD',
      label: 'EcoHarvest free plan',
      price: 'Free (LKR 0)',
      description: 'Everyday direct farm produce shopping with real-time delivery tracking.',
      isBulk: false,
    },
    {
      value: 'BULK_ACCESS',
      label: 'EcoHarvest pro plan',
      price: 'LKR 500 / month',
      description: 'Unlocks AI handwritten order scanning, volume pricing tiers & wholesale consolidation.',
      isBulk: true,
    },
  ];

interface SelectProps {
  label: string;
  value: string | null;
  placeholder: string;
  options: string[];
  disabled?: boolean;
  onSelect: (value: string) => void;
}

const DropdownField: React.FC<SelectProps> = ({
  label,
  value,
  placeholder,
  options,
  disabled,
  onSelect,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.dropdownWrapper}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
        style={[styles.dropdownTrigger, disabled && styles.dropdownDisabled]}
        disabled={disabled}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Select ${label}`}
      >
        <Text style={value ? styles.dropdownValueText : styles.dropdownPlaceholderText}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={disabled ? '#D1D5DB' : '#6B7280'} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setOpen(false)}>
          <View style={styles.pickerCard}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select {label}</Text>
              <Pressable onPress={() => setOpen(false)}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </Pressable>
            </View>
            <FlatList
              data={options}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.pickerOption, value === item && styles.pickerOptionSelected]}
                  onPress={() => {
                    onSelect(item);
                    setOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.pickerOptionText,
                      value === item && styles.pickerOptionTextSelected,
                    ]}
                  >
                    {item}
                  </Text>
                  {value === item && (
                    <Ionicons name="checkmark" size={18} color={tokens.colorPrimaryGreen} />
                  )}
                </Pressable>
              )}
              ItemSeparatorComponent={() => <View style={styles.pickerSeparator} />}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

export default function RegisterCustomerScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<ProfileStackParamList, 'RegisterCustomer'>>();
  const initialPlan = route.params?.initialPlan;

  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [province, setProvince] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [streetAddress, setStreetAddress] = useState('');
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isMapModalVisible, setIsMapModalVisible] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlan>(
    initialPlan === 'BULK_ACCESS' ? 'BULK_ACCESS' : 'STANDARD'
  );
  const [isBulkBuyer, setIsBulkBuyer] = useState(initialPlan === 'BULK_ACCESS');

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStripeModalVisible, setIsStripeModalVisible] = useState(false);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!fullName.trim()) errors.fullName = 'Full name is required.';
    if (!phoneNumber.trim()) errors.phoneNumber = 'Phone number is required.';
    else if (phoneNumber.trim().length < 9) errors.phoneNumber = 'Enter a valid phone number.';

    if (!province) errors.location = 'Please select a province.';
    else if (!district) errors.location = 'Please select a district.';
    else if (!city) errors.location = 'Please select a city.';

    if (!password) {
      errors.password = 'Password is required.';
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters.';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Confirm password is required.';
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handlePlanSelect = (plan: SubscriptionPlan) => {
    setSubscriptionPlan(plan);
    setIsBulkBuyer(plan === 'BULK_ACCESS');
  };

  const handleToggleBulk = () => {
    const nextBulk = !isBulkBuyer;
    setIsBulkBuyer(nextBulk);
    setSubscriptionPlan(nextBulk ? 'BULK_ACCESS' : 'STANDARD');
  };

  const handleProceed = () => {
    if (!validateForm()) return;

    if (subscriptionPlan === 'BULK_ACCESS' || isBulkBuyer) {
      setIsStripeModalVisible(true);
      return;
    }

    commitRegistration('STANDARD', false);
  };

  const commitRegistration = async (plan: SubscriptionPlan, bulkStatus: boolean) => {
    setIsSubmitting(true);
    try {
      const newProfile: CustomerProfile = {
        id: generateCustomerId(),
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        city: (city || '').trim(),
        district: (district || '').trim(),
        subscriptionPlan: plan,
        favoriteFarmerIds: [],
        createdAt: new Date().toISOString(),
      };

      // 1. Send registration payload with isBulkBuyer, bulkAccessPlan, and password to backend API
      try {
        await authApi.register({
          fullName: newProfile.fullName,
          phoneNumber: newProfile.phoneNumber,
          role: 'CUSTOMER',
          city: newProfile.city,
          district: newProfile.district,
          province: province || '',
          subscriptionPlan: plan,
          isBulkBuyer: bulkStatus,
          bulkAccessPlan: plan,
          password: password.trim(),
          isNewRegistration: true,
        });
      } catch (apiErr: any) {
        const msg = apiErr?.message || '';
        if (
          msg.includes('already registered') ||
          msg.includes('duplicate') ||
          apiErr?.errorType === 'DUPLICATE_PHONE'
        ) {
          showFeedback({
            type: 'error',
            title: 'Phone Already Registered',
            message: 'This mobile number is already registered. Please sign in to your existing account.',
            buttonText: 'Sign In',
          });
          setIsSubmitting(false);
          return;
        }
        console.log('Backend sync notice:', msg);
      }

      // 2. Persist locally to storage
      await saveUserProfile(newProfile);
      await setActiveMode('customer');
      setIsStripeModalVisible(false);

      if (bulkStatus) {
        stripeApi
          .createSubscription({
            phoneNumber: newProfile.phoneNumber,
            planType: 'BULK_ACCESS',
          })
          .catch((err) => console.log('Stripe sync notice:', err.message));
      }

      const finishNavigation = () => {
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          (navigation as any).navigate('ProfileHome');
        }
      };

      showFeedback({
        type: 'success',
        title: 'Account Created Successfully!',
        message: `Welcome to EcoHarvest, ${newProfile.fullName}! ${
          bulkStatus ? 'Bulk Buyer Wholesale Access is now activated.' : 'Your account is ready.'
        }`,
        buttonText: 'Get Started',
        onDismiss: finishNavigation,
      });

      if (Platform.OS === 'web') {
        setTimeout(finishNavigation, 400);
      }
    } catch (err: any) {
      console.error('Sign up failed:', err);
      showFeedback({
        type: 'error',
        title: 'Sign Up Failed',
        message: err?.message || 'Could not complete registration. Please try again.',
        buttonText: 'Try Again',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StandardHeader
        title="Sign Up as a Customer"
        subtitle="Create your buyer account & opt into bulk wholesale access"
      />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Buyer Details Form Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>1. Personal Information</Text>

          <View style={styles.fieldWrapper}>
            <Text style={styles.fieldLabel}>Full Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Nimal Perera"
              placeholderTextColor={tokens.colorTextMuted}
              value={fullName}
              onChangeText={setFullName}
            />
            {!!formErrors.fullName && <Text style={styles.errorText}>{formErrors.fullName}</Text>}
          </View>

          <View style={styles.fieldWrapper}>
            <Text style={styles.fieldLabel}>Mobile Phone Number *</Text>
            <TextInput
              style={styles.input}
              placeholder="07X XXXXXXX"
              placeholderTextColor={tokens.colorTextMuted}
              keyboardType="phone-pad"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              maxLength={10}
            />
            {!!formErrors.phoneNumber && (
              <Text style={styles.errorText}>{formErrors.phoneNumber}</Text>
            )}
          </View>
        </View>

        {/* Location Selector Card */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.cardTitle}>2. Delivery Location</Text>
            <Pressable
              style={styles.mapPinButton}
              onPress={() => setIsMapModalVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Pin Location on Map"
            >
              <Ionicons name="map" size={15} color="#15803D" style={{ marginRight: 5 }} />
              <Text style={styles.mapPinButtonText}>Pin on Map</Text>
            </Pressable>
          </View>

          {/* Quick interactive map trigger box */}
          <Pressable
            style={styles.mapPickerTriggerCard}
            onPress={() => setIsMapModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Open Map Location Picker"
          >
            <View style={styles.mapPickerTriggerIconBox}>
              <Ionicons name="navigate-circle" size={26} color="#15803D" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.mapPickerTriggerTitle}>
                {streetAddress ? streetAddress : 'Drop Pin on Google Maps'}
              </Text>
              <Text style={styles.mapPickerTriggerSubtitle}>
                {coordinates
                  ? `Lat: ${coordinates.latitude.toFixed(4)}, Lng: ${coordinates.longitude.toFixed(4)}`
                  : 'Tap to auto-detect GPS or drop pin to fill location'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </Pressable>

          <View style={styles.fieldWrapper}>
            <Text style={styles.fieldLabel}>Street Address / Landmark (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 123 Main Street, Apt 4B"
              placeholderTextColor={tokens.colorTextMuted}
              value={streetAddress}
              onChangeText={setStreetAddress}
            />
          </View>

          <DropdownField
            label="Province *"
            value={province}
            placeholder="Select Province"
            options={PROVINCES}
            onSelect={(val) => {
              setProvince(val);
              setDistrict(null);
              setCity(null);
            }}
          />

          <DropdownField
            label="District *"
            value={district}
            placeholder="Select District"
            options={getDistricts(province)}
            disabled={!province}
            onSelect={(val) => {
              setDistrict(val);
              setCity(null);
            }}
          />

          <DropdownField
            label="City *"
            value={city}
            placeholder="Select City"
            options={getCities(province, district)}
            disabled={!district}
            onSelect={(val) => setCity(val)}
          />
          {!!formErrors.location && <Text style={styles.errorText}>{formErrors.location}</Text>}
        </View>

        {/* Password Card (Below Delivery and Above Membership & Access Plan) */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>3. Account Password</Text>
          <Text style={styles.planSubtitle}>
            Set a secure password for your EcoHarvest account (minimum 6 characters).
          </Text>

          <View style={styles.fieldWrapper}>
            <Text style={styles.fieldLabel}>Password *</Text>
            <View style={styles.passwordInputContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter password (first time)"
                placeholderTextColor={tokens.colorTextMuted}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
              />
              <Pressable
                style={styles.eyeButton}
                onPress={() => setShowPassword((prev) => !prev)}
                hitSlop={8}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={tokens.colorTextMuted}
                />
              </Pressable>
            </View>
            {!!formErrors.password && <Text style={styles.errorText}>{formErrors.password}</Text>}
          </View>

          <View style={styles.fieldWrapper}>
            <Text style={styles.fieldLabel}>Confirm Password *</Text>
            <View style={styles.passwordInputContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Confirm password (second time)"
                placeholderTextColor={tokens.colorTextMuted}
                secureTextEntry={!showConfirmPassword}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              <Pressable
                style={styles.eyeButton}
                onPress={() => setShowConfirmPassword((prev) => !prev)}
                hitSlop={8}
              >
                <Ionicons
                  name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={tokens.colorTextMuted}
                />
              </Pressable>
            </View>
            {!!formErrors.confirmPassword && (
              <Text style={styles.errorText}>{formErrors.confirmPassword}</Text>
            )}
          </View>
        </View>

        {/* Plan & Bulk Buyer Access Selection Card */}
        <View style={styles.card}>
          <View style={styles.planHeaderRow}>
            <Text style={styles.cardTitle}>4. Membership & Access Plan</Text>
            <Pressable style={styles.bulkPillBadge} onPress={handleToggleBulk}>
              <Ionicons
                name={isBulkBuyer ? 'checkbox' : 'square-outline'}
                size={16}
                color={isBulkBuyer ? tokens.colorPrimaryGreen : tokens.colorTextMuted}
              />
              <Text style={[styles.bulkPillText, isBulkBuyer && styles.bulkPillTextActive]}>
                Pro Member
              </Text>
            </Pressable>
          </View>

          <Text style={styles.planSubtitle}>
            Choose whether you are signing up for retail household delivery or high-volume wholesale sourcing:
          </Text>

          {SUBSCRIPTION_PLANS.map((plan) => {
            const isSelected = subscriptionPlan === plan.value;

            return (
              <Pressable
                key={plan.value}
                style={[styles.planOption, isSelected && styles.planOptionSelected]}
                onPress={() => handlePlanSelect(plan.value)}
                accessibilityRole="button"
                accessibilityLabel={plan.label}
              >
                <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                  {isSelected && <View style={styles.radioInner} />}
                </View>

                <View style={{ flex: 1 }}>
                  <View style={styles.planTitleRow}>
                    <Text style={[styles.planOptionTitle, isSelected && styles.planOptionTitleActive]}>
                      {plan.label}
                    </Text>
                    <Text style={[styles.planPriceBadge, isSelected && styles.planPriceBadgeActive]}>
                      {plan.price}
                    </Text>
                  </View>
                  <Text style={styles.planOptionDescription}>{plan.description}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Submit Action Button */}
        <Pressable
          style={[styles.submitButton, isSubmitting && { opacity: 0.6 }]}
          onPress={handleProceed}
          disabled={isSubmitting}
          accessibilityRole="button"
          accessibilityLabel="Sign Up"
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons
                name={isBulkBuyer ? 'sparkles' : 'arrow-forward-circle'}
                size={20}
                color="#FFFFFF"
              />
              <Text style={styles.submitButtonText}>
                {isBulkBuyer ? 'Proceed to Pro Subscription (LKR 500)' : 'Complete Sign Up'}
              </Text>
            </>
          )}
        </Pressable>
      </ScrollView>

      {/* Stripe Payment Modal for Bulk Plan Activation */}
      <StripeCheckoutModal
        visible={isStripeModalVisible}
        onClose={() => setIsStripeModalVisible(false)}
        onSuccess={() => commitRegistration('BULK_ACCESS', true)}
        planTitle="EcoHarvest pro plan"
        planPrice="LKR 500 / month"
        description="Unlocks the AI Bulk Orders workspace for recurring volume orders."
      />

      {/* Interactive Map Pin Location Picker */}
      <MapLocationPickerModal
        visible={isMapModalVisible}
        title="Pin Delivery Location on Google Maps"
        initialLatitude={coordinates?.latitude || 6.9271}
        initialLongitude={coordinates?.longitude || 79.8612}
        onClose={() => setIsMapModalVisible(false)}
        onSelectLocation={(data: SelectedLocationData) => {
          setProvince(data.province);
          setDistrict(data.district);
          setCity(data.city);
          setStreetAddress(data.address);
          setCoordinates({ latitude: data.latitude, longitude: data.longitude });
          setFormErrors((prev) => {
            const next = { ...prev };
            delete next.location;
            return next;
          });
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colorBgMain },
  scrollContent: { padding: 16, paddingBottom: 40, gap: 16 },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  mapPinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  mapPinButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  mapPickerTriggerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
    marginBottom: 10,
  },
  mapPickerTriggerIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPickerTriggerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: tokens.colorTextDark,
  },
  mapPickerTriggerSubtitle: {
    fontSize: 11,
    color: tokens.colorTextMuted,
    marginTop: 2,
  },

  card: {
    backgroundColor: tokens.colorBgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tokens.colorBorderGray,
    padding: 18,
    gap: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: tokens.colorTextDark },

  fieldWrapper: { gap: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: tokens.colorTextDark },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: tokens.colorBorderGray,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: tokens.colorTextDark,
    backgroundColor: '#FFFFFF',
  },
  errorText: { fontSize: 12, color: tokens.colorAlertCrimson, marginTop: 2 },

  // Dropdown
  dropdownWrapper: { gap: 4 },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    borderWidth: 1,
    borderColor: tokens.colorBorderGray,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
  },
  dropdownDisabled: { backgroundColor: '#F3F4F6' },
  dropdownValueText: { fontSize: 14, color: tokens.colorTextDark, fontWeight: '500' },
  dropdownPlaceholderText: { fontSize: 14, color: tokens.colorTextMuted },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  pickerCard: { backgroundColor: '#FFFFFF', borderRadius: 16, maxHeight: '60%', padding: 16 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: tokens.colorTextDark },
  pickerOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 8 },
  pickerOptionSelected: { backgroundColor: tokens.colorEmeraldSubtle, borderRadius: 8 },
  pickerOptionText: { fontSize: 14, color: tokens.colorTextDark },
  pickerOptionTextSelected: { color: tokens.colorPrimaryGreen, fontWeight: '700' },
  pickerSeparator: { height: 1, backgroundColor: '#F3F4F6' },

  // Plan selector
  planHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bulkPillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: tokens.colorEmeraldSubtle,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: tokens.colorEmeraldLight,
  },
  bulkPillText: { fontSize: 12, fontWeight: '600', color: tokens.colorTextMuted },
  bulkPillTextActive: { color: tokens.colorPrimaryGreen, fontWeight: '700' },
  planSubtitle: { fontSize: 12, color: tokens.colorTextMuted, lineHeight: 16 },
  planOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: tokens.colorBorderGray,
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  planOptionSelected: {
    borderColor: tokens.colorPrimaryGreen,
    backgroundColor: tokens.colorEmeraldSubtle,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: tokens.colorBorderGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: { borderColor: tokens.colorPrimaryGreen },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: tokens.colorPrimaryGreen },
  planTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  planOptionTitle: { fontSize: 14, fontWeight: '600', color: tokens.colorTextDark },
  planOptionTitleActive: { color: tokens.colorPrimaryGreen, fontWeight: '700' },
  planPriceBadge: { fontSize: 12, fontWeight: '700', color: tokens.colorTextMuted },
  planPriceBadgeActive: { color: tokens.colorPrimaryGreen },
  planOptionDescription: { fontSize: 12, color: tokens.colorTextMuted, lineHeight: 16 },

  // Password Input
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: tokens.colorBorderGray,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
  },
  passwordInput: {
    flex: 1,
    minHeight: 44,
    fontSize: 14,
    color: tokens.colorTextDark,
  },
  eyeButton: {
    padding: 6,
  },

  // Submit button
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colorPrimaryGreen,
    borderRadius: 12,
    minHeight: 50,
    gap: 8,
    marginTop: 8,
  },
  submitButtonText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
