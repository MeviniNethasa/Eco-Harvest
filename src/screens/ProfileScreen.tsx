// src/screens/ProfileScreen.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  FlatList,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { ProfileStackParamList } from '../navigation/TabNavigator';
import type { AppMode, CustomerProfile, FarmerProfile, SubscriptionPlan, VerificationStatus } from '../types';
import {
  generateCustomerId,
  getActiveMode,
  getFarmerProfile,
  getFarmerFreshnessScore,
  FarmerFreshnessScore,
  getUserProfile,
  saveFarmerProfile,
  saveUserProfile,
  setActiveMode,
  subscribeToActiveMode,
  subscribeToUserProfile,
} from '../utils/storage';
import { PROVINCES, getDistricts, getCities } from '../data/sriLankaLocations';
import StandardHeader from '../components/StandardHeader';
import StripeCheckoutModal from '../components/StripeCheckoutModal';
import { authApi, farmerApi, stripeApi } from '../services/api';

type ProfileNavProp = NativeStackNavigationProp<ProfileStackParamList, 'ProfileHome'>;

const tokens = {
  colorPrimaryGreen: '#15803D',
  colorSecondaryLeaf: '#16A34A',
  colorBgMain: '#FAFAFA',
  colorBgCard: '#FFFFFF',
  colorBgSurface: '#F4F4F5',
  colorBorderGray: '#E5E7EB',
  colorTextDark: '#111827',
  colorTextMuted: '#6B7280',
  colorAlertCrimson: '#DC2626',
  colorAmberPending: '#D97706',
};

const SUBSCRIPTION_PLANS: {
  value: SubscriptionPlan;
  label: string;
  price: string;
  description: string;
}[] = [
  {
    value: 'STANDARD',
    label: 'EcoHarvest free plan',
    price: 'Free (LKR 0)',
    description: 'Everyday retail shopping from verified local farms.',
  },
  {
    value: 'BULK_ACCESS',
    label: 'EcoHarvest pro plan',
    price: 'LKR 500 / mo',
    description: 'Unlocks the AI Bulk Orders workspace for recurring volume orders.',
  },
];

const VERIFICATION_BADGE_CONFIG: Record<
  VerificationStatus,
  { bg: string; fg: string; label: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  UNVERIFIED: {
    bg: '#F4F4F5',
    fg: tokens.colorTextMuted,
    label: 'Unverified',
    icon: 'help-circle-outline',
  },
  PENDING_VERIFICATION: {
    bg: '#FEF3C7',
    fg: tokens.colorAmberPending,
    label: 'Pending Verification',
    icon: 'time-outline',
  },
  VERIFIED: {
    bg: '#DCFCE7',
    fg: tokens.colorPrimaryGreen,
    label: 'SLSI Organic Verified',
    icon: 'checkmark-circle',
  },
  REJECTED: {
    bg: '#FEE2E2',
    fg: tokens.colorAlertCrimson,
    label: 'Application Rejected',
    icon: 'close-circle-outline',
  },
};

interface FieldProps {
  label: string;
  error?: string;
  children: React.ReactNode;
}
const Field: React.FC<FieldProps> = ({ label, error, children }) => (
  <View style={styles.fieldWrapper}>
    <Text style={styles.label}>{label}</Text>
    {children}
    {!!error && <Text style={styles.errorText}>{error}</Text>}
  </View>
);

// Cascading Dropdown Selector Component
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
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={[styles.dropdownTrigger, disabled && styles.dropdownDisabled]}
        disabled={disabled}
        onPress={() => setOpen(true)}
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

export default function ProfileScreen() {
  const navigation = useNavigation<ProfileNavProp>();

  const [isLoading, setIsLoading] = useState(true);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [farmerProfile, setFarmerProfile] = useState<FarmerProfile | null>(null);
  const [activeMode, setActiveModeState] = useState<AppMode>('customer');

  // Customer registration / edit modal state
  const [isRegisterModalVisible, setIsRegisterModalVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [customerProvince, setCustomerProvince] = useState<string | null>(null);
  const [customerDistrict, setCustomerDistrict] = useState<string | null>(null);
  const [customerCity, setCustomerCity] = useState<string | null>(null);
  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlan>('STANDARD');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Stripe Checkout Modal state (for registration payment step)
  const [isStripeModalVisible, setIsStripeModalVisible] = useState(false);

  // Farmer Edit Modal state
  const [isFarmerEditModalVisible, setIsFarmerEditModalVisible] = useState(false);
  const [farmerLegalName, setFarmerLegalName] = useState('');
  const [farmerMobileNumber, setFarmerMobileNumber] = useState('');
  const [farmerFarmName, setFarmerFarmName] = useState('');
  const [farmerProvince, setFarmerProvince] = useState<string | null>(null);
  const [farmerDistrict, setFarmerDistrict] = useState<string | null>(null);
  const [farmerCity, setFarmerCity] = useState<string | null>(null);
  const [bankName, setBankName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [farmCoverPhotoUrl, setFarmCoverPhotoUrl] = useState('');
  const [farmerErrors, setFarmerErrors] = useState<Record<string, string>>({});
  const [isSavingFarmer, setIsSavingFarmer] = useState(false);
  const [farmerFreshness, setFarmerFreshness] = useState<FarmerFreshnessScore | null>(null);

  const loadProfiles = useCallback(async () => {
    try {
      const [customer, farmer, mode] = await Promise.all([
        getUserProfile(),
        getFarmerProfile(),
        getActiveMode(),
      ]);

      let updatedFarmer = farmer;
      const lookupKey = farmer?.id || farmer?.mobileNumber || customer?.phoneNumber;
      if (lookupKey) {
        try {
          const res = await farmerApi.getProfile(lookupKey);
          if (res && res.data) {
            const backendStatus =
              res.data.slsiStatus === 'VERIFIED' || res.data.isSLSIVerified
                ? 'VERIFIED'
                : res.data.slsiStatus === 'REJECTED'
                ? 'REJECTED'
                : farmer?.verificationStatus ?? 'PENDING_VERIFICATION';

            updatedFarmer = {
              ...(farmer || ({} as any)),
              id: farmer?.id || res.data._id || generateCustomerId(),
              legalName: res.data.ownerName || res.data.legalName || farmer?.legalName || '',
              mobileNumber: res.data.mobileNumber || farmer?.mobileNumber || '',
              farmName: res.data.farmName || farmer?.farmName || '',
              province: res.data.province || farmer?.province || '',
              district: res.data.district || farmer?.district || '',
              city: res.data.city || farmer?.city || '',
              verificationStatus: backendStatus as VerificationStatus,
              isSLSIVerified: backendStatus === 'VERIFIED',
              commissionRate: res.data.commissionRate ?? farmer?.commissionRate ?? 5.0,
              slsiCertificateUri: res.data.slsiCertificateUrl || farmer?.slsiCertificateUri,
              bankDetails: res.data.bankDetails || farmer?.bankDetails || {
                bankName: '',
                branchCode: '',
                accountNumber: '',
                accountHolderName: '',
              },
            };
            if (updatedFarmer) {
              await saveFarmerProfile(updatedFarmer);
            }
          }
        } catch (backendSyncErr) {
          // Continue with local existing state if offline
        }
      }

      if (updatedFarmer?.id) {
        try {
          const fresh = await getFarmerFreshnessScore(updatedFarmer.id);
          setFarmerFreshness(fresh);
        } catch (err) {
          console.log('Error fetching farmer freshness score:', err);
        }
      }

      setCustomerProfile(customer);
      setFarmerProfile(updatedFarmer);
      setActiveModeState(mode);
    } catch (err) {
      console.error('Failed to load profile state:', err);
      setCustomerProfile(null);
      setFarmerProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubMode = subscribeToActiveMode(setActiveModeState);
    const unsubUser = subscribeToUserProfile((updated) => {
      setCustomerProfile(updated);
    });
    return () => {
      unsubMode();
      unsubUser();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfiles();
    }, [loadProfiles])
  );

  // Reset & Open Customer Modal
  const resetCustomerForm = () => {
    setFullName('');
    setPhoneNumber('');
    setCustomerProvince(null);
    setCustomerDistrict(null);
    setCustomerCity(null);
    setSubscriptionPlan('STANDARD');
    setFormErrors({});
  };

  const openRegisterModal = () => {
    resetCustomerForm();
    if (customerProfile) {
      setFullName(customerProfile.fullName);
      setPhoneNumber(customerProfile.phoneNumber);
      setCustomerCity(customerProfile.city);
      setCustomerDistrict(customerProfile.district);
      // Derive province if city/district match
      for (const prov of PROVINCES) {
        if (getDistricts(prov).includes(customerProfile.district)) {
          setCustomerProvince(prov);
          break;
        }
      }
      setSubscriptionPlan(customerProfile.subscriptionPlan);
    } else if (farmerProfile) {
      setFullName(farmerProfile.legalName || '');
      setPhoneNumber(farmerProfile.mobileNumber || '');
      setCustomerProvince(farmerProfile.province || null);
      setCustomerDistrict(farmerProfile.district || null);
      setCustomerCity(farmerProfile.city || null);
    }
    setIsRegisterModalVisible(true);
  };

  const validateCustomerForm = (): boolean => {
    const next: Record<string, string> = {};
    if (!fullName.trim()) next.fullName = 'Full name is required.';
    if (!phoneNumber.trim()) next.phoneNumber = 'Phone number is required.';
    if (!customerProvince) next.location = 'Select a province.';
    else if (!customerDistrict) next.location = 'Select a district.';
    else if (!customerCity) next.location = 'Select a city.';
    setFormErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleCustomerFormSubmit = () => {
    if (!validateCustomerForm()) return;

    // If customer selected paid BULK_ACCESS plan, require Stripe payment step
    if (subscriptionPlan === 'BULK_ACCESS' && customerProfile?.subscriptionPlan !== 'BULK_ACCESS') {
      setIsRegisterModalVisible(false);
      setTimeout(() => {
        setIsStripeModalVisible(true);
      }, 250);
      return;
    }

    // Otherwise standard plan or existing bulk plan save
    commitSaveCustomerProfile(subscriptionPlan);
  };

  const commitSaveCustomerProfile = async (planToSave: SubscriptionPlan) => {
    setIsSaving(true);
    try {
      const profileToSave: CustomerProfile = {
        id: customerProfile?.id ?? generateCustomerId(),
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        city: (customerCity || '').trim(),
        district: (customerDistrict || '').trim(),
        subscriptionPlan: planToSave,
        favoriteFarmerIds: customerProfile?.favoriteFarmerIds || [],
        createdAt: customerProfile?.createdAt ?? new Date().toISOString(),
      };

      // Sync to backend API
      try {
        await authApi.register({
          fullName: profileToSave.fullName,
          phoneNumber: profileToSave.phoneNumber,
          role: 'CUSTOMER',
          city: profileToSave.city,
          district: profileToSave.district,
          province: customerProvince || '',
          subscriptionPlan: planToSave,
          isBulkBuyer: planToSave === 'BULK_ACCESS',
          bulkAccessPlan: planToSave,
          isNewRegistration: !customerProfile,
          userId: customerProfile?.id,
        });
      } catch (apiErr: any) {
        const msg = apiErr?.message || '';
        if (
          msg.includes('already registered') ||
          msg.includes('duplicate') ||
          apiErr?.errorType === 'DUPLICATE_PHONE'
        ) {
          Alert.alert(
            'Phone Number Registered',
            'This phone number is already registered. Please log in or use a different number.'
          );
          setIsSaving(false);
          return;
        }
        console.log('Backend sync notice (offline mode active):', msg);
      }

      const saved = await saveUserProfile(profileToSave);
      setCustomerProfile(saved);
      setIsRegisterModalVisible(false);
      setIsStripeModalVisible(false);

      if (planToSave === 'BULK_ACCESS') {
        stripeApi
          .createSubscription({
            phoneNumber: profileToSave.phoneNumber,
            planType: 'BULK_ACCESS',
          })
          .catch((err) => console.log('Stripe backend sync notice:', err.message));
      }

      await setActiveMode('customer');
      setActiveModeState('customer');

      Alert.alert(
        customerProfile ? 'Profile Updated' : 'Registration Complete',
        `Welcome, ${saved.fullName}!`
      );
    } catch (err) {
      console.error('Failed to save customer profile:', err);
      Alert.alert('Something went wrong', 'Could not save your profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Open & Handle Focused Farmer Edit Modal
  const openFarmerEditModal = () => {
    if (!farmerProfile) {
      navigation.navigate('FarmerOnboarding');
      return;
    }
    setFarmerLegalName(farmerProfile.legalName);
    setFarmerMobileNumber(farmerProfile.mobileNumber);
    setFarmerFarmName(farmerProfile.farmName);
    setFarmerProvince(farmerProfile.province);
    setFarmerDistrict(farmerProfile.district);
    setFarmerCity(farmerProfile.city);
    setBankName(farmerProfile.bankDetails?.bankName ?? '');
    setBranchCode(farmerProfile.bankDetails?.branchCode ?? '');
    setAccountNumber(farmerProfile.bankDetails?.accountNumber ?? '');
    setAccountHolderName(farmerProfile.bankDetails?.accountHolderName ?? '');
    setFarmCoverPhotoUrl(farmerProfile.farmCoverPhotoUrl ?? '');
    setFarmerErrors({});
    setIsFarmerEditModalVisible(true);
  };

  const validateFarmerEditForm = (): boolean => {
    const next: Record<string, string> = {};
    if (!farmerLegalName.trim()) next.legalName = 'Legal name is required.';
    if (!farmerMobileNumber.trim()) next.mobileNumber = 'Mobile number is required.';
    if (!farmerFarmName.trim()) next.farmName = 'Farm name is required.';
    if (!farmerProvince || !farmerDistrict || !farmerCity) next.location = 'Select location.';
    setFarmerErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSaveFarmerEdit = async () => {
    if (!validateFarmerEditForm() || !farmerProfile) return;
    setIsSavingFarmer(true);
    try {
      const updated: FarmerProfile = {
        ...farmerProfile,
        legalName: farmerLegalName.trim(),
        mobileNumber: farmerMobileNumber.trim(),
        farmName: farmerFarmName.trim(),
        province: farmerProvince as string,
        district: farmerDistrict as string,
        city: farmerCity as string,
        farmCoverPhotoUrl: farmCoverPhotoUrl.trim() || undefined,
        bankDetails: {
          bankName: bankName.trim(),
          branchCode: branchCode.trim(),
          accountNumber: accountNumber.trim(),
          accountHolderName: accountHolderName.trim(),
        },
      };

      const saved = await saveFarmerProfile(updated);
      setFarmerProfile(saved);
      setIsFarmerEditModalVisible(false);

      // Async sync to backend API
      farmerApi
        .saveProfile({
          id: saved.id,
          ownerName: saved.legalName,
          mobileNumber: saved.mobileNumber,
          farmName: saved.farmName,
          province: saved.province,
          district: saved.district,
          city: saved.city,
          bankDetails: saved.bankDetails,
          farmCoverPhotoUrl: saved.farmCoverPhotoUrl,
        })
        .catch((err) => console.log('Farmer backend sync notice:', err.message));

      Alert.alert('Farm Profile Updated', 'Your farm details have been successfully updated.');
    } catch (err) {
      console.error('Failed to update farm profile:', err);
      Alert.alert('Something went wrong', 'Could not save farm details.');
    } finally {
      setIsSavingFarmer(false);
    }
  };

  // Switch role action
  const handleSwitchMode = async (targetMode: AppMode) => {
    try {
      await setActiveMode(targetMode);
      setActiveModeState(targetMode);
    } catch (err) {
      console.error('Failed to switch active mode:', err);
    }
  };

  const handleHeaderAction = () => {
    if (customerProfile && !farmerProfile) {
      navigation.navigate('FarmerOnboarding');
      return;
    }
    if (!customerProfile && farmerProfile) {
      openRegisterModal();
      return;
    }
    if (customerProfile && farmerProfile) {
      const nextMode: AppMode = activeMode === 'customer' ? 'farmer' : 'customer';
      handleSwitchMode(nextMode);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={tokens.colorPrimaryGreen} size="large" />
      </View>
    );
  }

  const isPhase1 = !customerProfile && !farmerProfile;
  const isPhase2CustomerOnly = customerProfile !== null && farmerProfile === null;
  const isPhase2FarmerOnly = farmerProfile !== null && customerProfile === null;
  const isPhase3DualRole = customerProfile !== null && farmerProfile !== null;

  const renderHeaderRight = () => {
    if (isPhase1) return null;

    if (isPhase2CustomerOnly) {
      return (
        <Pressable
          style={styles.headerActionButton}
          onPress={handleHeaderAction}
          accessibilityRole="button"
          accessibilityLabel="Switch to Farmer Mode"
        >
          <Ionicons name="leaf-outline" size={16} color={tokens.colorPrimaryGreen} />
          <Text style={styles.headerActionButtonText}>Farmer Mode</Text>
        </Pressable>
      );
    }

    if (isPhase2FarmerOnly) {
      return (
        <Pressable
          style={styles.headerActionButton}
          onPress={handleHeaderAction}
          accessibilityRole="button"
          accessibilityLabel="Switch to Customer Mode"
        >
          <Ionicons name="person-outline" size={16} color={tokens.colorPrimaryGreen} />
          <Text style={styles.headerActionButtonText}>Customer Mode</Text>
        </Pressable>
      );
    }

    if (isPhase3DualRole) {
      const targetLabel = activeMode === 'customer' ? 'Farmer Mode' : 'Customer Mode';
      const targetIcon = activeMode === 'customer' ? 'leaf-outline' : 'person-outline';

      return (
        <Pressable
          style={styles.headerActionButton}
          onPress={handleHeaderAction}
          accessibilityRole="button"
          accessibilityLabel={`Switch to ${targetLabel}`}
        >
          <Ionicons name={targetIcon} size={16} color={tokens.colorPrimaryGreen} />
          <Text style={styles.headerActionButtonText}>{targetLabel}</Text>
          <Ionicons name="swap-horizontal-outline" size={14} color={tokens.colorPrimaryGreen} style={{ marginLeft: 2 }} />
        </Pressable>
      );
    }

    return null;
  };

  // Render Customer Profile Details Card
  const renderCustomerProfileCard = () => {
    if (!customerProfile) return null;

    return (
      <View style={styles.profileCard}>
        <View style={styles.profileCardHeader}>
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={24} color={tokens.colorPrimaryGreen} />
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.profileName}>{customerProfile.fullName}</Text>
            <Text style={styles.profileRoleCaption}>Customer Account</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailsGrid}>
          <View style={styles.detailRow}>
            <Ionicons name="call-outline" size={16} color={tokens.colorTextMuted} style={styles.detailIcon} />
            <Text style={styles.detailText}>{customerProfile.phoneNumber}</Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={16} color={tokens.colorTextMuted} style={styles.detailIcon} />
            <Text style={styles.detailText}>
              {customerProfile.city}, {customerProfile.district}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="shield-checkmark-outline" size={16} color={tokens.colorTextMuted} style={styles.detailIcon} />
            <View style={styles.planBadge}>
              <Text style={styles.planBadgeText}>
                {customerProfile.subscriptionPlan === 'BULK_ACCESS'
                  ? 'EcoHarvest pro plan'
                  : 'EcoHarvest free plan'}
              </Text>
            </View>
          </View>
        </View>

        <Pressable
          style={styles.editButton}
          onPress={openRegisterModal}
          accessibilityRole="button"
          accessibilityLabel="Edit Customer Details"
        >
          <Ionicons name="create-outline" size={16} color={tokens.colorPrimaryGreen} style={{ marginRight: 6 }} />
          <Text style={styles.editButtonText}>Edit Details</Text>
        </Pressable>
      </View>
    );
  };

  // Render Farmer Profile Details Card
  const renderFarmerProfileCard = () => {
    if (!farmerProfile) return null;

    const badgeConfig =
      VERIFICATION_BADGE_CONFIG[farmerProfile.verificationStatus] ??
      VERIFICATION_BADGE_CONFIG.UNVERIFIED;

    return (
      <View style={styles.profileCard}>
        <View style={styles.profileCardHeader}>
          <View style={[styles.avatarCircle, { backgroundColor: '#DCFCE7' }]}>
            <Ionicons name="leaf" size={24} color={tokens.colorPrimaryGreen} />
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.profileName}>{farmerProfile.farmName}</Text>
            <Text style={styles.profileRoleCaption}>{farmerProfile.legalName}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailsGrid}>
          <View style={styles.detailRow}>
            <Ionicons name="call-outline" size={16} color={tokens.colorTextMuted} style={styles.detailIcon} />
            <Text style={styles.detailText}>{farmerProfile.mobileNumber}</Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={16} color={tokens.colorTextMuted} style={styles.detailIcon} />
            <Text style={styles.detailText}>
              {farmerProfile.city}, {farmerProfile.district}, {farmerProfile.province}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="ribbon-outline" size={16} color={tokens.colorTextMuted} style={styles.detailIcon} />
            <View style={[styles.statusBadge, { backgroundColor: badgeConfig.bg }]}>
              <Ionicons name={badgeConfig.icon} size={13} color={badgeConfig.fg} style={{ marginRight: 4 }} />
              <Text style={[styles.statusBadgeText, { color: badgeConfig.fg }]}>
                {badgeConfig.label}
              </Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="leaf-outline" size={16} color={tokens.colorTextMuted} style={styles.detailIcon} />
            <View style={[styles.statusBadge, { backgroundColor: '#DCFCE7', borderColor: '#86EFAC', borderWidth: 1 }]}>
              <Ionicons name="sparkles" size={13} color="#15803D" style={{ marginRight: 4 }} />
              <Text style={[styles.statusBadgeText, { color: '#15803D', fontWeight: '700' }]}>
                {farmerFreshness ? `${farmerFreshness.average}% Avg Freshness (${farmerFreshness.grade})` : '95% Avg Freshness (Grade A)'}
              </Text>
            </View>
          </View>
        </View>

        <Pressable
          style={styles.editButton}
          onPress={openFarmerEditModal}
          accessibilityRole="button"
          accessibilityLabel="Edit Farm Details"
        >
          <Ionicons name="create-outline" size={16} color={tokens.colorPrimaryGreen} style={{ marginRight: 6 }} />
          <Text style={styles.editButtonText}>Edit Farm Details</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StandardHeader
        title="Profile"
        subtitle={
          isPhase1
            ? 'Account Setup'
            : activeMode === 'farmer'
            ? 'Farmer Portal Details'
            : 'Customer Account'
        }
        showNotificationBell={activeMode === 'farmer'}
        rightElement={renderHeaderRight()}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {isPhase1 && (
          <>
            <Text style={styles.introText}>
              Get started by registering as a customer or onboarding your farm.
            </Text>

            <Pressable
              style={styles.choiceCard}
              onPress={() => navigation.navigate('RegisterCustomer')}
              accessibilityRole="button"
              accessibilityLabel="Register as Customer"
            >
              <View style={styles.choiceIconContainer}>
                <Ionicons name="cart-outline" size={24} color={tokens.colorPrimaryGreen} />
              </View>
              <View style={styles.choiceTextContainer}>
                <Text style={styles.choiceCardTitle}>Register as Customer</Text>
                <Text style={styles.choiceCardSubtitle}>
                  Shop fresh produce directly from verified local farms
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={tokens.colorTextMuted} />
            </Pressable>

            <Pressable
              style={styles.choiceCard}
              onPress={() => navigation.navigate('FarmerOnboarding')}
              accessibilityRole="button"
              accessibilityLabel="Register as Farmer"
            >
              <View style={styles.choiceIconContainer}>
                <Ionicons name="leaf-outline" size={24} color={tokens.colorPrimaryGreen} />
              </View>
              <View style={styles.choiceTextContainer}>
                <Text style={styles.choiceCardTitle}>Register as Farmer</Text>
                <Text style={styles.choiceCardSubtitle}>
                  Onboard your farm and publish crops to the marketplace
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={tokens.colorTextMuted} />
            </Pressable>
          </>
        )}

        {isPhase2CustomerOnly && renderCustomerProfileCard()}
        {isPhase2FarmerOnly && renderFarmerProfileCard()}
        {isPhase3DualRole && (activeMode === 'farmer' ? renderFarmerProfileCard() : renderCustomerProfileCard())}
      </ScrollView>

      {/* ---------------- Customer Registration / Edit Modal ---------------- */}
      <Modal
        visible={isRegisterModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsRegisterModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {customerProfile ? 'Edit Customer Details' : 'Register as Customer'}
              </Text>
              <Pressable
                onPress={() => setIsRegisterModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color={tokens.colorTextMuted} />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Field label="Full Name *" error={formErrors.fullName}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your full name"
                  placeholderTextColor={tokens.colorTextMuted}
                  value={fullName}
                  onChangeText={setFullName}
                />
              </Field>

              <Field label="Phone Number *" error={formErrors.phoneNumber}>
                <TextInput
                  style={styles.input}
                  placeholder="07X XXXXXXX"
                  placeholderTextColor={tokens.colorTextMuted}
                  keyboardType="phone-pad"
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  maxLength={10}
                />
              </Field>

              {/* Structured Cascading Location Pickers */}
              <DropdownField
                label="Province *"
                value={customerProvince}
                placeholder="Select Province"
                options={PROVINCES}
                onSelect={(val) => {
                  setCustomerProvince(val);
                  setCustomerDistrict(null);
                  setCustomerCity(null);
                }}
              />

              <DropdownField
                label="District *"
                value={customerDistrict}
                placeholder="Select District"
                options={getDistricts(customerProvince)}
                disabled={!customerProvince}
                onSelect={(val) => {
                  setCustomerDistrict(val);
                  setCustomerCity(null);
                }}
              />

              <DropdownField
                label="City *"
                value={customerCity}
                placeholder="Select City"
                options={getCities(customerProvince, customerDistrict)}
                disabled={!customerDistrict}
                onSelect={(val) => setCustomerCity(val)}
              />
              {!!formErrors.location && <Text style={styles.errorText}>{formErrors.location}</Text>}

              <Text style={[styles.label, { marginTop: 10 }]}>Subscription Plan</Text>
              {SUBSCRIPTION_PLANS.map((plan) => {
                const selected = subscriptionPlan === plan.value;
                return (
                  <Pressable
                    key={plan.value}
                    style={[styles.planOption, selected && styles.planOptionSelected]}
                    onPress={() => setSubscriptionPlan(plan.value)}
                  >
                    <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                      {selected && <View style={styles.radioInner} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.planTitleRow}>
                        <Text style={styles.planOptionTitle}>{plan.label}</Text>
                        <Text style={styles.planPriceBadge}>{plan.price}</Text>
                      </View>
                      <Text style={styles.planOptionSubtitle}>{plan.description}</Text>
                    </View>
                  </Pressable>
                );
              })}

              <View style={[styles.rowGap, { marginTop: 14, marginBottom: 20 }]}>
                <Pressable
                  style={[styles.secondaryButton, styles.flexOne]}
                  onPress={() => setIsRegisterModalVisible(false)}
                  disabled={isSaving}
                >
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.primaryButton, styles.flexOne, isSaving && { opacity: 0.6 }]}
                  onPress={handleCustomerFormSubmit}
                  disabled={isSaving}
                >
                  <Text style={styles.primaryButtonText}>
                    {isSaving
                      ? 'Saving…'
                      : subscriptionPlan === 'BULK_ACCESS' &&
                        customerProfile?.subscriptionPlan !== 'BULK_ACCESS'
                      ? 'Proceed to Payment'
                      : 'Save & Continue'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ---------------- Stripe Subscription Modal ---------------- */}
      <StripeCheckoutModal
        visible={isStripeModalVisible}
        onClose={() => setIsStripeModalVisible(false)}
        onSuccess={() => commitSaveCustomerProfile('BULK_ACCESS')}
        planTitle="EcoHarvest pro plan"
        planPrice="LKR 500 / month"
        description="Unlocks the AI Bulk Orders workspace for recurring volume orders."
      />

      {/* ---------------- Focused Edit Farm Details Modal ---------------- */}
      <Modal
        visible={isFarmerEditModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsFarmerEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Farm Profile Details</Text>
              <Pressable
                onPress={() => setIsFarmerEditModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color={tokens.colorTextMuted} />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Field label="Legal Name *" error={farmerErrors.legalName}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter full legal name"
                  value={farmerLegalName}
                  onChangeText={setFarmerLegalName}
                />
              </Field>

              <Field label="Mobile Number *" error={farmerErrors.mobileNumber}>
                <TextInput
                  style={styles.input}
                  placeholder="07X XXXXXXX"
                  keyboardType="phone-pad"
                  value={farmerMobileNumber}
                  onChangeText={setFarmerMobileNumber}
                />
              </Field>

              <Field label="Farm Name *" error={farmerErrors.farmName}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter farm name"
                  value={farmerFarmName}
                  onChangeText={setFarmerFarmName}
                />
              </Field>

              <DropdownField
                label="Province *"
                value={farmerProvince}
                placeholder="Select Province"
                options={PROVINCES}
                onSelect={(val) => {
                  setFarmerProvince(val);
                  setFarmerDistrict(null);
                  setFarmerCity(null);
                }}
              />

              <DropdownField
                label="District *"
                value={farmerDistrict}
                placeholder="Select District"
                options={getDistricts(farmerProvince)}
                disabled={!farmerProvince}
                onSelect={(val) => {
                  setFarmerDistrict(val);
                  setFarmerCity(null);
                }}
              />

              <DropdownField
                label="City *"
                value={farmerCity}
                placeholder="Select City"
                options={getCities(farmerProvince, farmerDistrict)}
                disabled={!farmerDistrict}
                onSelect={(val) => setFarmerCity(val)}
              />

              <Text style={[styles.label, { marginTop: 12, fontWeight: '700' }]}>
                Bank Account Details (Payouts)
              </Text>
              <Field label="Bank Name">
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Bank of Ceylon"
                  value={bankName}
                  onChangeText={setBankName}
                />
              </Field>

              <View style={styles.rowGap}>
                <View style={styles.flexOne}>
                  <Field label="Branch Code">
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. 701"
                      value={branchCode}
                      onChangeText={setBranchCode}
                    />
                  </Field>
                </View>
                <View style={styles.flexOne}>
                  <Field label="Account Number">
                    <TextInput
                      style={styles.input}
                      placeholder="Account No"
                      value={accountNumber}
                      onChangeText={setAccountNumber}
                    />
                  </Field>
                </View>
              </View>

              <Field label="Account Holder Name">
                <TextInput
                  style={styles.input}
                  placeholder="Account holder name"
                  value={accountHolderName}
                  onChangeText={setAccountHolderName}
                />
              </Field>

              <Field label="Farm Cover Photo URL (optional)">
                <TextInput
                  style={styles.input}
                  placeholder="https://..."
                  value={farmCoverPhotoUrl}
                  onChangeText={setFarmCoverPhotoUrl}
                  autoCapitalize="none"
                />
              </Field>

              <View style={[styles.rowGap, { marginTop: 16, marginBottom: 24 }]}>
                <Pressable
                  style={[styles.secondaryButton, styles.flexOne]}
                  onPress={() => setIsFarmerEditModalVisible(false)}
                  disabled={isSavingFarmer}
                >
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.primaryButton, styles.flexOne, isSavingFarmer && { opacity: 0.6 }]}
                  onPress={handleSaveFarmerEdit}
                  disabled={isSavingFarmer}
                >
                  <Text style={styles.primaryButtonText}>
                    {isSavingFarmer ? 'Saving…' : 'Save Changes'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAFAFA' },
  headerActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 5,
    minHeight: 36,
  },
  headerActionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colorPrimaryGreen,
  },
  scrollContent: { padding: 16, paddingTop: 12, paddingBottom: 40 },
  introText: { fontSize: 14, color: tokens.colorTextMuted, marginBottom: 16, lineHeight: 20 },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.colorBgCard,
    borderWidth: 1,
    borderColor: tokens.colorBorderGray,
    borderRadius: 14,
    padding: 16,
    minHeight: 76,
    marginBottom: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  choiceIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  choiceTextContainer: { flex: 1 },
  choiceCardTitle: { fontSize: 16, fontWeight: '600', color: tokens.colorPrimaryGreen, marginBottom: 3 },
  choiceCardSubtitle: { fontSize: 12, color: tokens.colorTextMuted, lineHeight: 16 },
  profileCard: {
    backgroundColor: tokens.colorBgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tokens.colorBorderGray,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  profileCardHeader: { flexDirection: 'row', alignItems: 'center' },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  headerInfo: { flex: 1 },
  profileName: { fontSize: 19, fontWeight: '700', color: tokens.colorTextDark, marginBottom: 2 },
  profileRoleCaption: { fontSize: 13, color: tokens.colorTextMuted, fontWeight: '500' },
  divider: { height: 1, backgroundColor: tokens.colorBorderGray, marginVertical: 16 },
  detailsGrid: { gap: 12, marginBottom: 18 },
  detailRow: { flexDirection: 'row', alignItems: 'center' },
  detailIcon: { marginRight: 10, width: 18 },
  detailText: { fontSize: 14, color: tokens.colorTextDark, fontWeight: '500' },
  planBadge: { alignSelf: 'flex-start', backgroundColor: '#DCFCE7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  planBadgeText: { fontSize: 12, fontWeight: '600', color: tokens.colorPrimaryGreen },
  statusBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontSize: 12, fontWeight: '600' },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
    borderWidth: 1,
    borderColor: tokens.colorSecondaryLeaf,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
  },
  editButtonText: { fontSize: 14, fontWeight: '600', color: tokens.colorSecondaryLeaf },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: tokens.colorTextDark },
  fieldWrapper: { marginBottom: 14 },
  flexOne: { flex: 1 },
  label: { fontSize: 13, fontWeight: '600', color: tokens.colorTextDark, marginBottom: 5 },
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
  errorText: { fontSize: 12, color: tokens.colorAlertCrimson, marginTop: 4 },
  rowGap: { flexDirection: 'row', gap: 8 },
  dropdownWrapper: { marginBottom: 12 },
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
  pickerOptionSelected: { backgroundColor: '#F0FDF4', borderRadius: 8 },
  pickerOptionText: { fontSize: 14, color: tokens.colorTextDark },
  pickerOptionTextSelected: { color: tokens.colorPrimaryGreen, fontWeight: '600' },
  pickerSeparator: { height: 1, backgroundColor: '#F3F4F6' },
  planOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: tokens.colorBorderGray,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  planOptionSelected: { borderColor: tokens.colorPrimaryGreen, backgroundColor: '#F0FDF4' },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: tokens.colorBorderGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioOuterSelected: { borderColor: tokens.colorPrimaryGreen },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: tokens.colorPrimaryGreen },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  planOptionTitle: { fontSize: 14, fontWeight: '600', color: tokens.colorTextDark },
  planPriceBadge: { fontSize: 12, fontWeight: '700', color: tokens.colorPrimaryGreen },
  planOptionSubtitle: { fontSize: 12, color: tokens.colorTextMuted },
  secondaryButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: tokens.colorBorderGray,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#F4F4F5',
  },
  secondaryButtonText: { fontSize: 14, fontWeight: '600', color: tokens.colorTextDark },
  primaryButton: {
    minHeight: 44,
    backgroundColor: tokens.colorPrimaryGreen,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  primaryButtonText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
});