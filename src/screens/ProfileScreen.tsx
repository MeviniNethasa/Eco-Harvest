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
  clearFarmerProfile,
  clearUserProfile,
  generateCustomerId,
  generateFarmerId,
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
import MapLocationPickerModal, { SelectedLocationData } from '../components/MapLocationPickerModal';
import { authApi, farmerApi, stripeApi } from '../services/api';
import { showFeedback, showToast } from '../components/FeedbackPopup';
import { openHelpDesk } from '../components/HelpDeskFloatingBadge';

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
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerCoords, setCustomerCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isCustomerMapModalVisible, setIsCustomerMapModalVisible] = useState(false);
  const [customerPassword, setCustomerPassword] = useState('');
  const [customerConfirmPassword, setCustomerConfirmPassword] = useState('');
  const [showCustomerPassword, setShowCustomerPassword] = useState(false);
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
  const [farmerAddress, setFarmerAddress] = useState('');
  const [farmerCoords, setFarmerCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isFarmerMapModalVisible, setIsFarmerMapModalVisible] = useState(false);
  const [bankName, setBankName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [farmCoverPhotoUrl, setFarmCoverPhotoUrl] = useState('');
  const [farmerErrors, setFarmerErrors] = useState<Record<string, string>>({});
  const [isSavingFarmer, setIsSavingFarmer] = useState(false);
  const [farmerFreshness, setFarmerFreshness] = useState<FarmerFreshnessScore | null>(null);

  // Sign In Modal state
  const [isSignInModalVisible, setIsSignInModalVisible] = useState(false);
  const [signInFullName, setSignInFullName] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState('');

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
    setCustomerPassword('');
    setCustomerConfirmPassword('');
    setShowCustomerPassword(false);
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

    // Password validation for new customer registration
    if (!customerProfile) {
      if (!customerPassword.trim()) {
        next.password = 'Password is required.';
      } else if (customerPassword.trim().length < 6) {
        next.password = 'Password must be at least 6 characters.';
      } else if (customerPassword !== customerConfirmPassword) {
        next.confirmPassword = 'Passwords do not match.';
      }
    }

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
          password: customerPassword.trim() || undefined,
          isNewRegistration: !customerProfile,
          userId: customerProfile?.id,
        });
      } catch (apiErr: any) {
        console.log('Backend sync notice (offline mode active):', apiErr?.message);
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

  // Sign In action (Full Name + Password)
  const handleSignIn = async () => {
    if (!signInFullName.trim()) {
      setSignInError('Full name is required.');
      return;
    }
    if (!signInPassword.trim()) {
      setSignInError('Password is required.');
      return;
    }
    setIsSigningIn(true);
    setSignInError('');
    try {
      const res = await authApi.login({
        fullName: signInFullName.trim(),
        password: signInPassword.trim(),
      });

      if (res.success && res.data) {
        const user = res.data;
        if (user.role === 'FARMER' || user.farmerProfile) {
          const farmerData: FarmerProfile = user.farmerProfile
            ? {
                id: user.farmerProfile._id || user.farmerProfile.id || generateFarmerId(),
                legalName: user.farmerProfile.ownerName || user.fullName,
                mobileNumber: user.farmerProfile.mobileNumber || user.phoneNumber,
                farmName: user.farmerProfile.farmName || `${user.fullName}'s Farm`,
                farmCoverPhotoUrl: user.farmerProfile.farmCoverPhotoUrl || undefined,
                province: user.farmerProfile.province || user.province || '',
                district: user.farmerProfile.district || user.district || '',
                city: user.farmerProfile.city || user.city || '',
                bankDetails: user.farmerProfile.bankDetails || {
                  bankName: '',
                  branchCode: '',
                  accountNumber: '',
                  accountHolderName: '',
                },
                slsiCertificateUri: user.farmerProfile.slsiCertificateUrl || null,
                verificationStatus:
                  user.farmerProfile.slsiStatus === 'VERIFIED'
                    ? 'VERIFIED'
                    : user.farmerProfile.slsiStatus === 'REJECTED'
                    ? 'REJECTED'
                    : 'PENDING_VERIFICATION',
                isSLSIVerified:
                  user.farmerProfile.isSLSIVerified || user.farmerProfile.slsiStatus === 'VERIFIED',
                commissionRate: user.farmerProfile.commissionRate || 5.0,
              }
            : {
                id: generateFarmerId(),
                legalName: user.fullName,
                mobileNumber: user.phoneNumber,
                farmName: `${user.fullName}'s Organic Farm`,
                province: user.province || '',
                district: user.district || '',
                city: user.city || '',
                bankDetails: { bankName: '', branchCode: '', accountNumber: '', accountHolderName: '' },
                slsiCertificateUri: null,
                verificationStatus: 'UNVERIFIED',
                isSLSIVerified: false,
                commissionRate: 5.0,
              };

          await saveFarmerProfile(farmerData);
          await setActiveMode('farmer');
          setFarmerProfile(farmerData);
          setActiveModeState('farmer');
        } else {
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
          setCustomerProfile(customerData);
          setActiveModeState('customer');
        }

        setIsSignInModalVisible(false);
        setSignInFullName('');
        setSignInPassword('');
        showFeedback({
          type: 'success',
          title: 'Welcome Back!',
          message: `Signed in successfully as ${user.fullName}.`,
          buttonText: 'Continue',
        });
        await loadProfiles();
      }
    } catch (err: any) {
      console.error('Sign in failed:', err);
      const errMsg = err?.message || 'Invalid full name or password. Please try again.';
      setSignInError(errMsg);
      showFeedback({
        type: 'error',
        title: 'Sign In Failed',
        message: errMsg,
        buttonText: 'Try Again',
      });
    } finally {
      setIsSigningIn(false);
    }
  };

  // Sign Out action
  const handleSignOut = async () => {
    const doSignOut = async () => {
      try {
        await clearUserProfile();
        await clearFarmerProfile();
        await setActiveMode('customer');
        setCustomerProfile(null);
        setFarmerProfile(null);
        setActiveModeState('customer');
        showToast('Signed out successfully. Come back soon!', 'info');
        showFeedback({
          type: 'info',
          title: 'Signed Out',
          message: 'You have been safely signed out of your EcoHarvest account.',
          buttonText: 'Got It',
        });
      } catch (err) {
        console.error('Failed to sign out:', err);
      }
    };

    if (Platform.OS === 'web') {
      const confirmed =
        typeof window !== 'undefined'
          ? window.confirm('Are you sure you want to sign out of your EcoHarvest account?')
          : true;
      if (confirmed) {
        await doSignOut();
      }
      return;
    }

    Alert.alert('Sign Out', 'Are you sure you want to sign out of your EcoHarvest account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: doSignOut,
      },
    ]);
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
          style={styles.helpDeskButton}
          onPress={() => openHelpDesk()}
          accessibilityRole="button"
          accessibilityLabel="Open EcoHarvest Help Desk"
        >
          <Ionicons name="headset-outline" size={16} color="#15803D" style={{ marginRight: 6 }} />
          <Text style={styles.helpDeskButtonText}>Help Desk & Dispute Support</Text>
        </Pressable>

        <Pressable
          style={styles.editButton}
          onPress={openRegisterModal}
          accessibilityRole="button"
          accessibilityLabel="Edit Customer Details"
        >
          <Ionicons name="create-outline" size={16} color={tokens.colorPrimaryGreen} style={{ marginRight: 6 }} />
          <Text style={styles.editButtonText}>Edit Details</Text>
        </Pressable>

        <Pressable
          style={styles.signOutButton}
          onPress={handleSignOut}
          accessibilityRole="button"
          accessibilityLabel="Sign Out of Customer Account"
        >
          <Ionicons name="log-out-outline" size={16} color={tokens.colorAlertCrimson} style={{ marginRight: 6 }} />
          <Text style={styles.signOutButtonText}>Sign Out</Text>
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
          style={styles.helpDeskButton}
          onPress={() => openHelpDesk()}
          accessibilityRole="button"
          accessibilityLabel="Open EcoHarvest Help Desk"
        >
          <Ionicons name="headset-outline" size={16} color="#15803D" style={{ marginRight: 6 }} />
          <Text style={styles.helpDeskButtonText}>Farmer Help Desk & Support</Text>
        </Pressable>

        <Pressable
          style={styles.editButton}
          onPress={openFarmerEditModal}
          accessibilityRole="button"
          accessibilityLabel="Edit Farm Details"
        >
          <Ionicons name="create-outline" size={16} color={tokens.colorPrimaryGreen} style={{ marginRight: 6 }} />
          <Text style={styles.editButtonText}>Edit Farm Details</Text>
        </Pressable>

        <Pressable
          style={styles.signOutButton}
          onPress={handleSignOut}
          accessibilityRole="button"
          accessibilityLabel="Sign Out of Farmer Account"
        >
          <Ionicons name="log-out-outline" size={16} color={tokens.colorAlertCrimson} style={{ marginRight: 6 }} />
          <Text style={styles.signOutButtonText}>Sign Out</Text>
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
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {isPhase1 && (
          <>
            <Text style={styles.introText}>
              Get started by signing up as a customer, signing up as a farmer, or signing into your existing account.
            </Text>

            <Pressable
              style={styles.choiceCard}
              onPress={() => navigation.navigate('RegisterCustomer')}
              accessibilityRole="button"
              accessibilityLabel="Sign Up as a customer"
            >
              <View style={styles.choiceIconContainer}>
                <Ionicons name="cart-outline" size={24} color={tokens.colorPrimaryGreen} />
              </View>
              <View style={styles.choiceTextContainer}>
                <Text style={styles.choiceCardTitle}>Sign Up as a customer</Text>
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
              accessibilityLabel="Sign Up as a farmer"
            >
              <View style={styles.choiceIconContainer}>
                <Ionicons name="leaf-outline" size={24} color={tokens.colorPrimaryGreen} />
              </View>
              <View style={styles.choiceTextContainer}>
                <Text style={styles.choiceCardTitle}>Sign Up as a farmer</Text>
                <Text style={styles.choiceCardSubtitle}>
                  Onboard your farm and publish crops to the marketplace
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={tokens.colorTextMuted} />
            </Pressable>

            {/* Already have an account? Sign In card */}
            <Pressable
              style={[styles.choiceCard, styles.signInChoiceCard]}
              onPress={() => {
                setSignInError('');
                setIsSignInModalVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Already have an account? Sign In"
            >
              <View style={[styles.choiceIconContainer, { backgroundColor: '#F0FDF4' }]}>
                <Ionicons name="log-in-outline" size={24} color={tokens.colorPrimaryGreen} />
              </View>
              <View style={styles.choiceTextContainer}>
                <Text style={[styles.choiceCardTitle, { color: tokens.colorPrimaryGreen }]}>
                  Already have an account? Sign In
                </Text>
                <Text style={styles.choiceCardSubtitle}>
                  Sign in with your full name and password to give you access
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={tokens.colorPrimaryGreen} />
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
                {customerProfile ? 'Edit Customer Details' : 'Sign Up as a Customer'}
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

              {/* Map Location Pin Trigger */}
              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={styles.label}>Delivery Location *</Text>
                  <Pressable
                    style={styles.mapPinTriggerBtn}
                    onPress={() => setIsCustomerMapModalVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Pin Location on Map"
                  >
                    <Ionicons name="map" size={14} color="#15803D" style={{ marginRight: 4 }} />
                    <Text style={styles.mapPinTriggerBtnText}>Pin on Map</Text>
                  </Pressable>
                </View>

                <Pressable
                  style={styles.mapPickerTriggerCard}
                  onPress={() => setIsCustomerMapModalVisible(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Open Map Location Picker"
                >
                  <View style={styles.mapPickerTriggerIconBox}>
                    <Ionicons name="navigate-circle" size={24} color="#15803D" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mapPickerTriggerTitle}>
                      {customerAddress ? customerAddress : 'Drop Pin on Google Maps'}
                    </Text>
                    <Text style={styles.mapPickerTriggerSubtitle}>
                      {customerCoords
                        ? `GPS: ${customerCoords.latitude.toFixed(4)}, ${customerCoords.longitude.toFixed(4)}`
                        : 'Tap to auto-detect GPS or drop pin to fill location'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                </Pressable>
              </View>

              <Field label="Street Address / Landmark (optional)">
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 45 Temple Road, Apt 2"
                  placeholderTextColor={tokens.colorTextMuted}
                  value={customerAddress}
                  onChangeText={setCustomerAddress}
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

              {/* Password Section (for Sign Up) */}
              {!customerProfile && (
                <>
                  <Text style={[styles.label, { marginTop: 12, fontWeight: '700' }]}>
                    Account Password
                  </Text>
                  <Field label="Password *" error={formErrors.password}>
                    <View style={styles.passwordInputContainer}>
                      <TextInput
                        style={styles.passwordInput}
                        placeholder="Create a secure password (min 6 chars)"
                        placeholderTextColor={tokens.colorTextMuted}
                        secureTextEntry={!showCustomerPassword}
                        value={customerPassword}
                        onChangeText={setCustomerPassword}
                      />
                      <Pressable
                        style={styles.eyeButton}
                        onPress={() => setShowCustomerPassword((prev) => !prev)}
                        hitSlop={8}
                      >
                        <Ionicons
                          name={showCustomerPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={20}
                          color={tokens.colorTextMuted}
                        />
                      </Pressable>
                    </View>
                  </Field>

                  <Field label="Confirm Password *" error={formErrors.confirmPassword}>
                    <View style={styles.passwordInputContainer}>
                      <TextInput
                        style={styles.passwordInput}
                        placeholder="Re-enter your password"
                        placeholderTextColor={tokens.colorTextMuted}
                        secureTextEntry={!showCustomerPassword}
                        value={customerConfirmPassword}
                        onChangeText={setCustomerConfirmPassword}
                      />
                      <Pressable
                        style={styles.eyeButton}
                        onPress={() => setShowCustomerPassword((prev) => !prev)}
                        hitSlop={8}
                      >
                        <Ionicons
                          name={showCustomerPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={20}
                          color={tokens.colorTextMuted}
                        />
                      </Pressable>
                    </View>
                  </Field>
                </>
              )}

              <Text style={[styles.label, { marginTop: 12, fontWeight: '700' }]}>Membership & Access Plan</Text>
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
                        : customerProfile
                        ? 'Save Changes'
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

              <View style={{ marginTop: 4, marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={styles.label}>Farm Location *</Text>
                  <Pressable
                    style={styles.mapPinTriggerBtn}
                    onPress={() => setIsFarmerMapModalVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Pin Farm Location on Map"
                  >
                    <Ionicons name="map" size={14} color="#15803D" style={{ marginRight: 4 }} />
                    <Text style={styles.mapPinTriggerBtnText}>Pin Farm on Map</Text>
                  </Pressable>
                </View>

                <Pressable
                  style={styles.mapPickerTriggerCard}
                  onPress={() => setIsFarmerMapModalVisible(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Open Map Location Picker"
                >
                  <View style={styles.mapPickerTriggerIconBox}>
                    <Ionicons name="location" size={24} color="#15803D" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mapPickerTriggerTitle}>
                      {farmerAddress ? farmerAddress : 'Drop Pin on Google Maps'}
                    </Text>
                    <Text style={styles.mapPickerTriggerSubtitle}>
                      {farmerCoords
                        ? `GPS: ${farmerCoords.latitude.toFixed(4)}, ${farmerCoords.longitude.toFixed(4)}`
                        : 'Tap to locate farm via GPS or drop pin anywhere'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                </Pressable>
              </View>

              <Field label="Farm Street Address / Landmark (optional)">
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 10 Tea Estate Road"
                  placeholderTextColor={tokens.colorTextMuted}
                  value={farmerAddress}
                  onChangeText={setFarmerAddress}
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

      {/* ---------------- Sign In Modal (Full Name + Password) ---------------- */}
      <Modal
        visible={isSignInModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsSignInModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Sign In to Account</Text>
                <Text style={styles.modalSubtitleText}>
                  Enter your registered full name and password
                </Text>
              </View>
              <Pressable
                onPress={() => setIsSignInModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color={tokens.colorTextMuted} />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {!!signInError && (
                <View style={styles.errorAlertBox}>
                  <Ionicons name="alert-circle-outline" size={18} color={tokens.colorAlertCrimson} />
                  <Text style={styles.errorAlertText}>{signInError}</Text>
                </View>
              )}

              <Field label="Full Name *">
                <TextInput
                  style={styles.input}
                  placeholder="Enter the full name you gave last time"
                  placeholderTextColor={tokens.colorTextMuted}
                  value={signInFullName}
                  onChangeText={(text) => {
                    setSignInFullName(text);
                    setSignInError('');
                  }}
                  autoCapitalize="words"
                />
              </Field>

              <Field label="Password *">
                <View style={styles.passwordInputContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Enter your password"
                    placeholderTextColor={tokens.colorTextMuted}
                    secureTextEntry={!showSignInPassword}
                    value={signInPassword}
                    onChangeText={(text) => {
                      setSignInPassword(text);
                      setSignInError('');
                    }}
                  />
                  <Pressable
                    style={styles.eyeButton}
                    onPress={() => setShowSignInPassword((prev) => !prev)}
                    hitSlop={8}
                  >
                    <Ionicons
                      name={showSignInPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={tokens.colorTextMuted}
                    />
                  </Pressable>
                </View>
              </Field>

              <View style={[styles.rowGap, { marginTop: 20, marginBottom: 24 }]}>
                <Pressable
                  style={[styles.secondaryButton, styles.flexOne]}
                  onPress={() => setIsSignInModalVisible(false)}
                  disabled={isSigningIn}
                >
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.primaryButton, styles.flexOne, isSigningIn && { opacity: 0.6 }]}
                  onPress={handleSignIn}
                  disabled={isSigningIn}
                >
                  {isSigningIn ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Sign In</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Customer Location Picker Modal */}
      <MapLocationPickerModal
        visible={isCustomerMapModalVisible}
        title="Pin Delivery Location on Google Maps"
        initialLatitude={customerCoords?.latitude || 6.9271}
        initialLongitude={customerCoords?.longitude || 79.8612}
        onClose={() => setIsCustomerMapModalVisible(false)}
        onSelectLocation={(data: SelectedLocationData) => {
          setCustomerProvince(data.province);
          setCustomerDistrict(data.district);
          setCustomerCity(data.city);
          setCustomerAddress(data.address);
          setCustomerCoords({ latitude: data.latitude, longitude: data.longitude });
          setFormErrors((prev) => {
            const next = { ...prev };
            delete next.location;
            return next;
          });
        }}
      />

      {/* Farmer Location Picker Modal */}
      <MapLocationPickerModal
        visible={isFarmerMapModalVisible}
        title="Pin Farm Location on Google Maps"
        initialLatitude={farmerCoords?.latitude || 6.9271}
        initialLongitude={farmerCoords?.longitude || 79.8612}
        onClose={() => setIsFarmerMapModalVisible(false)}
        onSelectLocation={(data: SelectedLocationData) => {
          setFarmerProvince(data.province);
          setFarmerDistrict(data.district);
          setFarmerCity(data.city);
          setFarmerAddress(data.address);
          setFarmerCoords({ latitude: data.latitude, longitude: data.longitude });
          setFarmerErrors((prev) => {
            const next = { ...prev };
            delete next.location;
            return next;
          });
        }}
      />
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
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerActionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colorPrimaryGreen,
    marginLeft: 4,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  introText: {
    fontSize: 14,
    color: tokens.colorTextMuted,
    lineHeight: 20,
    marginBottom: 16,
  },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tokens.colorBorderGray,
    padding: 16,
    marginBottom: 12,
  },
  signInChoiceCard: {
    borderColor: '#86EFAC',
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    marginTop: 4,
  },
  choiceIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  choiceTextContainer: {
    flex: 1,
  },
  choiceCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: tokens.colorTextDark,
    marginBottom: 2,
  },
  choiceCardSubtitle: {
    fontSize: 12,
    color: tokens.colorTextMuted,
    lineHeight: 16,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: tokens.colorBorderGray,
    padding: 16,
    marginBottom: 16,
  },
  profileCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  headerInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 17,
    fontWeight: '700',
    color: tokens.colorTextDark,
  },
  profileRoleCaption: {
    fontSize: 13,
    color: tokens.colorTextMuted,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 14,
  },
  detailsGrid: {
    gap: 12,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailIcon: {
    marginRight: 10,
  },
  detailText: {
    fontSize: 14,
    color: tokens.colorTextDark,
  },
  planBadge: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  planBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colorPrimaryGreen,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  helpDeskButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 8,
    paddingVertical: 10,
    backgroundColor: '#F0FDF4',
    marginBottom: 10,
  },
  helpDeskButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#15803D',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.colorPrimaryGreen,
    borderRadius: 8,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: tokens.colorPrimaryGreen,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 8,
    paddingVertical: 10,
    backgroundColor: '#FEF2F2',
    marginTop: 10,
  },
  signOutButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: tokens.colorAlertCrimson,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: tokens.colorTextDark,
  },
  modalSubtitleText: {
    fontSize: 12,
    color: tokens.colorTextMuted,
    marginTop: 2,
  },
  fieldWrapper: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: tokens.colorTextDark,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: tokens.colorBorderGray,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: tokens.colorTextDark,
    backgroundColor: '#FFFFFF',
  },
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
  errorText: {
    fontSize: 12,
    color: tokens.colorAlertCrimson,
    marginTop: 4,
  },
  errorAlertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    gap: 8,
  },
  errorAlertText: {
    flex: 1,
    fontSize: 13,
    color: tokens.colorAlertCrimson,
    fontWeight: '500',
  },
  rowGap: {
    flexDirection: 'row',
    gap: 10,
  },
  flexOne: {
    flex: 1,
  },
  dropdownWrapper: {
    marginBottom: 12,
  },
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
  mapPinTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  mapPinTriggerBtnText: {
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
    width: 38,
    height: 38,
    borderRadius: 19,
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
});