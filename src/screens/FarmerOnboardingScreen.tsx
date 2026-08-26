// src/screens/FarmerOnboardingScreen.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Modal,
  FlatList,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  AppNotification,
  BankDetails,
  ChatMessage,
  ChatThread,
  Crop,
  CropCategory,
  FarmerProfile,
  VerificationStatus,
} from '../types';
import {
  addNotification,
  clearFarmerProfile,
  clearUserProfile,
  generateFarmerId,
  getAllChatThreads,
  getChatMessages,
  getFarmerProfile,
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  publishCrop,
  saveFarmerProfile,
  setActiveMode,
  subscribeToNotifications,
  syncFarmerProfileToVerificationQueue,
} from '../utils/storage';
import { PROVINCES, getDistricts, getCities } from '../data/sriLankaLocations';
import { authApi, farmerApi } from '../services/api';

// ---------------------------------------------------------------------------
// Design tokens (from design.md — Screen M-02 spec)
// ---------------------------------------------------------------------------
const tokens = {
  colorPrimaryGreen: '#15803D',
  colorSecondaryLeaf: '#16A34A',
  colorBgMain: '#FAFAFA',
  colorBgCard: '#F4F4F5',
  colorBorderGray: '#E5E7EB',
  colorTextDark: '#111827',
  colorTextMuted: '#6B7280',
  colorAlertCrimson: '#DC2626',
  colorAmberPending: '#D97706',
};

const CATEGORIES: CropCategory[] = ['Vegetables', 'Fruits', 'Grains', 'Spices'];

const BADGE_CONFIG: Record<VerificationStatus, { bg: string; fg: string; label: string }> = {
  UNVERIFIED: { bg: '#F4F4F5', fg: tokens.colorTextMuted, label: 'Unverified' },
  PENDING_VERIFICATION: {
    bg: '#FEF3C7',
    fg: tokens.colorAmberPending,
    label: 'Submitted • Pending Admin Verification',
  },
  VERIFIED: { bg: '#DCFCE7', fg: tokens.colorPrimaryGreen, label: 'SLSI Organic Verified' },
  REJECTED: {
    bg: '#FEE2E2',
    fg: tokens.colorAlertCrimson,
    label: 'Application Rejected by Admin',
  },
};

/**
 * Default marketplace commission rate for a farmer who hasn't been through
 * an admin decision yet (Screen A-01). Matches `COMMISSION_RATE_DEFAULT` in
 * storage.ts.
 */
const DEFAULT_COMMISSION_RATE = 5;
const VERIFIED_COMMISSION_RATE = 2.5;

const PLACEHOLDER_CROP_IMAGE = 'https://placehold.co/400x400/16A34A/FFFFFF?text=Crop';
const PLACEHOLDER_FARM_COVER_IMAGE = 'https://placehold.co/800x400/15803D/FFFFFF?text=Farm+Cover+Photo';

// ---------------------------------------------------------------------------
// Customer Inquiries & Messages (Farmer Portal → Screen M-06 chat threads)
// ---------------------------------------------------------------------------

/** One chat thread paired with its most recent message, for the preview list. */
interface ThreadWithPreview {
  thread: ChatThread;
  lastMessage: ChatMessage | null;
}

/** Short relative-ish timestamp for the inquiry list ("2:45 PM"). */
function formatInquiryTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// System Alerts & Notifications (Farmer Dashboard — role: 'FARMER' channel)
// ---------------------------------------------------------------------------

/**
 * Renders a compact relative-time label ("Just now", "5m ago", "3h ago",
 * "2d ago") for a notification's ISO timestamp, matching
 * FARMER_NOTIFICATIONS_PORTAL.md / Notification.md's own examples. Falls
 * back to the raw ISO string if the timestamp can't be parsed rather than
 * throwing.
 */
function formatNotificationRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Just now';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

// ---------------------------------------------------------------------------
// Small reusable field wrapper (label + mandatory error state)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Cascading selector (Province / District / City) — modal list picker.
// Kept dependency-free (no @react-native-picker/picker requirement).
// ---------------------------------------------------------------------------
interface SelectProps {
  label: string;
  value: string | null;
  placeholder: string;
  options: string[];
  disabled?: boolean;
  onSelect: (value: string) => void;
}
const SelectField: React.FC<SelectProps> = ({ label, value, placeholder, options, disabled, onSelect }) => {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.selectFlex}>
      <Text style={styles.miniLabel}>{label}</Text>
      <Pressable
        style={[styles.input, styles.selectInput, disabled && styles.selectDisabled]}
        disabled={disabled}
        onPress={() => setOpen(true)}
      >
        <Text style={value ? styles.selectValueText : styles.placeholderText}>
          {value ?? placeholder}
        </Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setOpen(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalOption}
                  onPress={() => {
                    onSelect(item);
                    setOpen(false);
                  }}
                >
                  <Text style={styles.modalOptionText}>{item}</Text>
                </Pressable>
              )}
              ItemSeparatorComponent={() => <View style={styles.modalSeparator} />}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

// ---------------------------------------------------------------------------
// SLSI Verification Status Badge (3-state)
// ---------------------------------------------------------------------------
const VerificationBadge: React.FC<{ status: VerificationStatus }> = ({ status }) => {
  const config = BADGE_CONFIG[status];
  return (
    <View style={[styles.statusTag, { backgroundColor: config.bg }]}>
      <View style={[styles.statusDot, { backgroundColor: config.fg }]} />
      <Text style={[styles.statusTagText, { color: config.fg }]}>{config.label}</Text>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function FarmerOnboardingScreen() {
  const navigation = useNavigation();

  // --- Persisted profile / view-mode state ---
  const [profile, setProfile] = useState<FarmerProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // --- Customer Inquiries & Messages (Dashboard / View Mode 2 only) ---
  const [chatThreads, setChatThreads] = useState<ThreadWithPreview[]>([]);
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);

  // --- System Alerts & Notifications (Dashboard / View Mode 2 only) ---
  // Strictly the 'FARMER' channel — Customer Alerts live in NotificationModal
  // (opened from OrdersScreen), not here. See FARMER_NOTIFICATIONS_PORTAL.md.
  const [farmerNotifications, setFarmerNotifications] = useState<AppNotification[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(true);

  // --- Onboarding form fields (shared by first-time setup + "Edit Profile") ---
  const [legalName, setLegalName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [farmName, setFarmName] = useState('');
  const [farmCoverPhotoUrl, setFarmCoverPhotoUrl] = useState<string | null>(null);
  const [showCoverUrlInput, setShowCoverUrlInput] = useState(false);
  const [province, setProvince] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [bankName, setBankName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [certificateUri, setCertificateUri] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('UNVERIFIED');
  const [commissionRate, setCommissionRate] = useState<number>(DEFAULT_COMMISSION_RATE);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [onboardingErrors, setOnboardingErrors] = useState<Record<string, string>>({});

  // --- Product Publisher fields (Dashboard / View Mode 2 only) ---
  const [cropImageUri, setCropImageUri] = useState<string | null>(null);
  const [cropName, setCropName] = useState('');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [category, setCategory] = useState<CropCategory | null>(null);
  const [availableQtyKg, setAvailableQtyKg] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState('');
  const [publishErrors, setPublishErrors] = useState<Record<string, string>>({});
  const [isPublishing, setIsPublishing] = useState(false);

  const districts = useMemo(() => getDistricts(province), [province]);
  const cities = useMemo(() => getCities(province, district), [province, district]);

  // ---- Load the persisted profile & sync with live MongoDB backend ----
  const loadProfile = React.useCallback(async () => {
    let existing = await getFarmerProfile();
    if (existing?.id || existing?.mobileNumber) {
      try {
        const lookupKey = existing.id || existing.mobileNumber;
        const res = await farmerApi.getProfile(lookupKey);
        if (res && res.data) {
          const backendStatus =
            res.data.slsiStatus === 'VERIFIED' || res.data.isSLSIVerified
              ? 'VERIFIED'
              : res.data.slsiStatus === 'REJECTED'
                ? 'REJECTED'
                : existing.verificationStatus;

          const merged: FarmerProfile = {
            ...existing,
            verificationStatus: backendStatus as VerificationStatus,
            isSLSIVerified: backendStatus === 'VERIFIED',
            commissionRate: res.data.commissionRate ?? existing.commissionRate,
            slsiCertificateUri: res.data.slsiCertificateUrl || existing.slsiCertificateUri,
          };
          existing = await saveFarmerProfile(merged);
        }
      } catch (backendSyncErr) {
        // Continue with local existing state if offline
      }
    }
    setProfile(existing);
    if (existing) {
      setVerificationStatus(existing.verificationStatus);
      setCommissionRate(existing.commissionRate ?? DEFAULT_COMMISSION_RATE);
      if (existing.slsiCertificateUri) {
        setCertificateUri(existing.slsiCertificateUri);
      }
    }
    setIsLoadingProfile(false);
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Re-fetch whenever the Farmer Portal regains focus so a verification
  // decision made on Screen A-01 (Admin Verification Desk) — a VERIFIED /
  // REJECTED status and the resulting commission tier — shows up
  // immediately, per design.md Section 3 "Farmer Portal Sync". Skipped
  // while the farmer is mid-edit on the onboarding form so an admin update
  // landing in the background can't clobber unsaved changes.
  useFocusEffect(
    React.useCallback(() => {
      if (!isEditingProfile) {
        loadProfile();
      }
    }, [isEditingProfile, loadProfile])
  );

  // ---- Load Customer Inquiries & Messages (all active chat threads) ----
  // Pulls in each thread's most recent message for the preview card, then
  // sorts most-recently-active first so new inquiries surface at the top.
  const loadChatThreads = React.useCallback(async () => {
    setIsLoadingThreads(true);
    try {
      const threads = await getAllChatThreads();
      const withPreviews = await Promise.all(
        threads.map(async (thread): Promise<ThreadWithPreview> => {
          const messages = await getChatMessages(thread.id);
          const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
          return { thread, lastMessage };
        })
      );
      withPreviews.sort((a, b) => {
        const aTime = a.lastMessage ? new Date(a.lastMessage.timestamp).getTime() : 0;
        const bTime = b.lastMessage ? new Date(b.lastMessage.timestamp).getTime() : 0;
        return bTime - aTime;
      });
      setChatThreads(withPreviews);
    } catch (err) {
      console.error('Failed to load chat threads for Farmer Portal:', err);
    } finally {
      setIsLoadingThreads(false);
    }
  }, []);

  // Refresh every time the Farmer Portal tab/screen regains focus (e.g.
  // coming back from replying in ChatScreen) so new/updated previews show
  // up without a manual pull-to-refresh.
  useFocusEffect(
    React.useCallback(() => {
      loadChatThreads();
    }, [loadChatThreads])
  );

  // ---- Load System Alerts & Notifications (role: 'FARMER' channel) ----
  const loadFarmerNotifications = React.useCallback(async () => {
    setIsLoadingNotifications(true);
    try {
      const notifications = await getNotifications('FARMER');
      setFarmerNotifications(notifications);
    } catch (err) {
      console.error('Failed to load farmer notifications:', err);
    } finally {
      setIsLoadingNotifications(false);
    }
  }, []);

  // Catch up whenever the Farmer Portal regains focus, same as chat threads.
  useFocusEffect(
    React.useCallback(() => {
      loadFarmerNotifications();
    }, [loadFarmerNotifications])
  );

  // Stay live while mounted, so a simulated push (from the sandbox toolbar
  // below, or a real one triggered elsewhere) shows up immediately without
  // needing a focus event. Re-filters the full unfiltered list down to the
  // 'FARMER' channel — the Customer channel is out of scope here.
  useEffect(() => {
    const unsubscribe = subscribeToNotifications((all) => {
      setFarmerNotifications(all.filter((n) => n.role === 'FARMER'));
    });
    return unsubscribe;
  }, []);

  const resetOnboardingFormFields = () => {
    setLegalName('');
    setMobileNumber('');
    setFarmName('');
    setFarmCoverPhotoUrl(null);
    setShowCoverUrlInput(false);
    setProvince(null);
    setDistrict(null);
    setCity(null);
    setBankName('');
    setBranchCode('');
    setAccountNumber('');
    setAccountHolderName('');
    setCertificateUri(null);
    setVerificationStatus('UNVERIFIED');
    setCommissionRate(DEFAULT_COMMISSION_RATE);
    setOnboardingErrors({});
  };

  const prefillFormFromProfile = (p: FarmerProfile) => {
    setLegalName(p.legalName);
    setMobileNumber(p.mobileNumber);
    setFarmName(p.farmName);
    setFarmCoverPhotoUrl(p.farmCoverPhotoUrl ?? null);
    setShowCoverUrlInput(false);
    setProvince(p.province);
    setDistrict(p.district);
    setCity(p.city);
    setBankName(p.bankDetails.bankName);
    setBranchCode(p.bankDetails.branchCode);
    setAccountNumber(p.bankDetails.accountNumber);
    setAccountHolderName(p.bankDetails.accountHolderName);
    setCertificateUri(p.slsiCertificateUri);
    setVerificationStatus(p.verificationStatus);
    setCommissionRate(p.commissionRate ?? DEFAULT_COMMISSION_RATE);
    setOnboardingErrors({});
  };

  const handleProvinceSelect = (value: string) => {
    setProvince(value);
    setDistrict(null);
    setCity(null);
  };
  const handleDistrictSelect = (value: string) => {
    setDistrict(value);
    setCity(null);
  };

  // ---- Shared permission helper ----
  // Checks current permission first (avoids re-prompting every tap once
  // granted), requests if undetermined, and — if the user has permanently
  // denied it — tells them how to fix it instead of silently doing nothing.
  const ensureGalleryPermission = async (): Promise<boolean> => {
    const current = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (current.granted) return true;

    if (current.canAskAgain) {
      const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (requested.granted) return true;
    }

    Alert.alert(
      'Permission needed',
      'Please allow access to your photo library in Settings to upload an image.',
    );
    return false;
  };

  // ---- SLSI certificate upload ----
  // Uploading only ever moves status to PENDING_VERIFICATION — there's no
  // admin review portal yet to actually grant VERIFIED. Use the Developer
  // Sandbox toolbar below to simulate the outcome of that review.
  const handleUploadCertificate = async () => {
    const hasPermission = await ensureGalleryPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets?.length) {
        const asset = result.assets[0];
        const uri = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        setCertificateUri(uri);
        setVerificationStatus('PENDING_VERIFICATION');
      }
    } catch (err) {
      console.error('Failed to open image library for SLSI certificate:', err);
      Alert.alert('Something went wrong', 'Could not open the photo library. Please try again.');
    }
  };

  // ---- Farm cover photo picker ----
  // Farm-First public profile hero image (FarmerProfile.farmCoverPhotoUrl).
  // Prefers the native gallery picker; the "Or paste an image URL" field
  // right below in the UI is a fallback for simulators/web where the
  // gallery isn't available, or a farmer who'd rather link a hosted image.
  const handleSelectCoverPhoto = async () => {
    const hasPermission = await ensureGalleryPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        allowsEditing: true,
        aspect: [2, 1],
      });
      if (!result.canceled && result.assets?.length) {
        setFarmCoverPhotoUrl(result.assets[0].uri);
        setShowCoverUrlInput(false);
      }
    } catch (err) {
      console.error('Failed to open image library for farm cover photo:', err);
      Alert.alert('Something went wrong', 'Could not open the photo library. Please try again.');
    }
  };

  // ---- Crop image picker ----
  const handleSelectCropImage = async () => {
    const hasPermission = await ensureGalleryPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (!result.canceled && result.assets?.length) {
        setCropImageUri(result.assets[0].uri);
      }
    } catch (err) {
      console.error('Failed to open image library for crop photo:', err);
      Alert.alert('Something went wrong', 'Could not open the photo library. Please try again.');
    }
  };

  // ---- Onboarding form validation ----
  const validateOnboarding = (): boolean => {
    const next: Record<string, string> = {};
    if (!legalName.trim()) next.legalName = 'Legal name is required.';
    if (!mobileNumber.trim()) next.mobileNumber = 'Mobile number is required.';
    if (!farmName.trim()) next.farmName = 'Farm name is required.';
    if (!province || !district || !city) next.location = 'Select province, district and city.';

    // Validate password for first-time sign-up or if password is provided
    if (!profile) {
      if (!password) {
        next.password = 'Password is required.';
      } else if (password.length < 6) {
        next.password = 'Password must be at least 6 characters.';
      }
      if (!confirmPassword) {
        next.confirmPassword = 'Confirm password is required.';
      } else if (password !== confirmPassword) {
        next.confirmPassword = 'Passwords do not match.';
      }
    } else if (password) {
      if (password.length < 6) {
        next.password = 'Password must be at least 6 characters.';
      }
      if (password !== confirmPassword) {
        next.confirmPassword = 'Passwords do not match.';
      }
    }

    setOnboardingErrors(next);
    return Object.keys(next).length === 0;
  };

  // ---- Complete Onboarding / Save Changes ----
  const handleSaveProfile = async () => {
    if (!validateOnboarding()) return;
    setIsSavingProfile(true);
    try {
      const profileToSave: FarmerProfile = {
        id: profile?.id ?? generateFarmerId(),
        legalName: legalName.trim(),
        mobileNumber: mobileNumber.trim(),
        farmName: farmName.trim(),
        // Optional — trim a pasted URL down to null rather than saving an
        // empty string, so `farmCoverPhotoUrl` stays either a real value
        // or unset (screens fall back to a placeholder either way).
        farmCoverPhotoUrl: farmCoverPhotoUrl?.trim() ? farmCoverPhotoUrl.trim() : undefined,
        province: province as string,
        district: district as string,
        city: city as string,
        bankDetails: {
          bankName: bankName.trim(),
          branchCode: branchCode.trim(),
          accountNumber: accountNumber.trim(),
          accountHolderName: accountHolderName.trim(),
        },
        slsiCertificateUri: certificateUri,
        verificationStatus,
        isSLSIVerified: verificationStatus === 'VERIFIED',
        // Preserve whatever commission tier is already in effect (default,
        // or the one set by an admin's Screen A-01 decision) — editing
        // profile/contact details here shouldn't reset it.
        commissionRate: profile?.commissionRate ?? commissionRate,
      };

      // ── Live Auth registration / account creation in MongoDB ──
      try {
        await authApi.register({
          fullName: profileToSave.legalName,
          phoneNumber: profileToSave.mobileNumber,
          role: 'FARMER',
          city: profileToSave.city,
          district: profileToSave.district,
          province: profileToSave.province,
          farmName: profileToSave.farmName,
          ownerName: profileToSave.legalName,
          slsiCertificateUrl: profileToSave.slsiCertificateUri || '',
          bankDetails: profileToSave.bankDetails,
          password: password.trim() ? password.trim() : undefined,
          isNewRegistration: !profile,
        });
      } catch (authErr: any) {
        console.log('Farmer auth register sync notice:', authErr.message);
      }

      const saved = await saveFarmerProfile(profileToSave);
      await syncToAdminVerificationQueue(saved);

      // ── Live HTTP dispatch to Express backend (MongoDB persistence) ──
      try {
        const backendPayload = {
          ownerName: saved.legalName,
          legalName: saved.legalName,
          mobileNumber: saved.mobileNumber,
          farmName: saved.farmName,
          province: saved.province || '',
          district: saved.district || '',
          city: saved.city || '',
          slsiStatus: saved.verificationStatus === 'VERIFIED' ? 'VERIFIED'
            : saved.verificationStatus === 'REJECTED' ? 'REJECTED'
              : 'PENDING_VERIFICATION',
          isSLSIVerified: saved.isSLSIVerified || false,
          slsiCertificateUrl: saved.slsiCertificateUri || '',
          bankDetails: saved.bankDetails || {},
          farmCoverPhotoUrl: saved.farmCoverPhotoUrl || '',
          commissionRate: saved.commissionRate ?? 5.0,
        };
        await farmerApi.saveProfile(backendPayload);
        console.log(`FARMER PROFILE SYNCED TO BACKEND: ${saved.farmName} (${saved.mobileNumber})`);
      } catch (backendErr: any) {
        console.error(`FARMER BACKEND SYNC FAILED: ${backendErr.message}`);
        Alert.alert(
          'Backend Sync Notice',
          'Your profile was saved locally but could not be synced to the server. It will sync when you next save.',
        );
      }

      const wasFirstTime = !profile;
      setProfile(saved);
      setIsEditingProfile(false);

      try {
        await setActiveMode('farmer');
      } catch (err) {
        console.error('Failed to switch into Farmer Mode after saving profile:', err);
      }

      Alert.alert(
        wasFirstTime ? 'Sign Up Complete' : 'Profile Updated',
        wasFirstTime
          ? `Welcome, ${saved.legalName}! Your Farmer Dashboard is ready.`
          : 'Your farmer profile has been updated.',
      );
    } catch (err) {
      console.error('Failed to save farmer profile:', err);
      Alert.alert('Something went wrong', 'Could not save your profile. Please try again.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // ---- Bridge to Screen A-01: Admin Verification Desk ----
  // Whenever a profile lands on PENDING_VERIFICATION — either the real
  // "Complete Onboarding" / "Save Changes" submit flow below, or the Dev
  // Sandbox's "Set Pending" toggle — push it into the
  // `@ecoharvest/verification-requests` queue so it shows up on the Admin
  // Verification Desk immediately, instead of only ever living in
  // `@ecoharvest/farmer-profile` (the bug this fixes). A no-op for any
  // other status, since only a PENDING submission needs admin attention.
  const syncToAdminVerificationQueue = async (savedProfile: FarmerProfile) => {
    if (savedProfile.verificationStatus !== 'PENDING_VERIFICATION') return;
    try {
      await syncFarmerProfileToVerificationQueue(savedProfile);
    } catch (err) {
      console.error('Failed to sync SLSI submission into the admin verification queue:', err);
    }
  };

  const handleEditProfile = () => {
    if (profile) prefillFormFromProfile(profile);
    setIsEditingProfile(true);
  };

  const handleCancelEdit = () => {
    if (profile) prefillFormFromProfile(profile); // discard unsaved edits
    setIsEditingProfile(false);
  };

  // ---- System Alerts & Notifications: read-state handlers ----
  const handleNotificationPress = async (notification: AppNotification) => {
    if (notification.isRead) return;
    try {
      await markNotificationAsRead(notification.id);
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleMarkAllFarmerNotificationsRead = async () => {
    try {
      await markAllNotificationsAsRead('FARMER');
    } catch (err) {
      console.error('Failed to mark all farmer notifications as read:', err);
    }
  };

  // ---- System Alerts & Notifications: Developer Sandbox presets ----
  // Each preset pushes a 'FARMER'-channel notification whose copy matches
  // FARMER_NOTIFICATIONS_PORTAL.md's alert list exactly.
  const handleSimNewOrder = async () => {
    try {
      await addNotification({
        role: 'FARMER',
        title: 'New Incoming Order',
        message: 'Direct order locked. Handshake OTP generated',
        category: 'ORDER',
      });
    } catch (err) {
      console.error('Failed to simulate New Order notification:', err);
    }
  };

  const handleSimBulkMatch = async () => {
    try {
      await addNotification({
        role: 'FARMER',
        title: 'AI Demand Match',
        message: 'New bulk requirement query matches your active crops',
        category: 'BULK_MATCH',
      });
    } catch (err) {
      console.error('Failed to simulate Bulk Match notification:', err);
    }
  };

  const handleSimLowStock = async () => {
    try {
      await addNotification({
        role: 'FARMER',
        title: 'High Priority Alert',
        message: 'Inventory levels fallen below configured threshold',
        category: 'INVENTORY',
      });
    } catch (err) {
      console.error('Failed to simulate Low Stock notification:', err);
    }
  };

  const handleSimNewReview = async () => {
    try {
      await addNotification({
        role: 'FARMER',
        title: 'Customer Feedback',
        message: 'New rating and freshness feedback received for your harvest',
        category: 'REVIEW',
      });
    } catch (err) {
      console.error('Failed to simulate New Review notification:', err);
    }
  };

  // ---- Developer Sandbox: manual verification-status toggles ----
  // Mirrors the commission-tier rule Screen A-01's admin override applies:
  // VERIFIED -> 2.5%, everything else -> the 5% default.
  const applyDevVerificationStatus = async (status: VerificationStatus) => {
    const nextCommissionRate =
      status === 'VERIFIED' ? VERIFIED_COMMISSION_RATE : DEFAULT_COMMISSION_RATE;
    setVerificationStatus(status);
    setCommissionRate(nextCommissionRate);
    if (!profile) return; // no profile saved yet — just previews in the form
    try {
      const updated = await saveFarmerProfile({
        ...profile,
        verificationStatus: status,
        isSLSIVerified: status === 'VERIFIED',
        commissionRate: nextCommissionRate,
      });
      await syncToAdminVerificationQueue(updated);
      setProfile(updated);
    } catch (err) {
      console.error('Failed to update verification status:', err);
      Alert.alert('Something went wrong', 'Could not update verification status.');
    }
  };

  const handleResetOnboarding = () => {
    Alert.alert(
      'Reset Onboarding?',
      'This clears the saved farmer profile from this device so you can test the first-time setup flow again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearFarmerProfile();
              setProfile(null);
              setIsEditingProfile(false);
              resetOnboardingFormFields();
            } catch (err) {
              console.error('Failed to reset farmer profile:', err);
              Alert.alert('Something went wrong', 'Could not reset onboarding.');
            }
          },
        },
      ],
    );
  };

  // ---- Product Publisher validation ----
  const validatePublish = (): boolean => {
    const next: Record<string, string> = {};
    if (!cropName.trim()) next.cropName = 'Crop name is required.';
    if (!pricePerUnit.trim() || isNaN(Number(pricePerUnit)) || Number(pricePerUnit) <= 0) {
      next.pricePerUnit = 'Enter a valid price in LKR.';
    }
    if (!category) next.category = 'Select a category.';
    if (
      availableQtyKg.trim() &&
      (isNaN(Number(availableQtyKg)) || Number(availableQtyKg) < 0)
    ) {
      next.availableQtyKg = 'Enter a valid available quantity.';
    }
    if (
      lowStockThreshold.trim() &&
      (isNaN(Number(lowStockThreshold)) || Number(lowStockThreshold) < 0)
    ) {
      next.lowStockThreshold = 'Enter a valid stock threshold.';
    }
    setPublishErrors(next);
    return Object.keys(next).length === 0;
  };

  // ---- Publish ----
  const handlePublish = async () => {
    if (!profile) return; // Publisher only renders once a profile exists
    if (!validatePublish()) return;
    setIsPublishing(true);
    try {
      // Farm identity/location come from the saved profile, not re-entered
      // here. isSLSIVerified is intentionally omitted — publishCrop()
      // derives it from the farmer's saved verificationStatus.
      const cropInput: Omit<Crop, 'id' | 'isSLSIVerified'> = {
        // Join key back to FarmerProfile.id — without this,
        // getProductsByFarmerId() in storage.ts can never match the crop to
        // this farm's storefront (it filters strictly on farmerId), so the
        // listing would publish successfully but never appear on
        // FarmerDetailScreen.
        farmerId: profile.id,
        name: cropName.trim(),
        category: category as CropCategory,
        pricePerUnit: Number(pricePerUnit),
        unit: '1kg',
        imageUrl: cropImageUri ?? PLACEHOLDER_CROP_IMAGE,
        farmName: profile.farmName,
        province: profile.province,
        district: profile.district,
        city: profile.city,
        availableQtyKg: availableQtyKg.trim() ? Number(availableQtyKg) : undefined,
        lowStockThreshold: lowStockThreshold.trim() ? Number(lowStockThreshold) : undefined,
      };

      const updatedCatalog = await publishCrop(cropInput);
      const published = updatedCatalog[0];

      Alert.alert('Crop Published', `${published.name} is now live on the Marketplace.`, [{ text: 'OK' }]);

      setCropImageUri(null);
      setCropName('');
      setPricePerUnit('');
      setCategory(null);
      setAvailableQtyKg('');
      setLowStockThreshold('');
      setPublishErrors({});
    } catch (err) {
      console.error('Failed to publish crop:', err);
      Alert.alert(
        'Publish failed',
        "We couldn't save this listing. Please check your connection/storage and try again.",
      );
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSignOut = async () => {
    const doSignOut = async () => {
      try {
        await clearFarmerProfile();
        await clearUserProfile();
        await setActiveMode('customer');
        setProfile(null);
        if (Platform.OS === 'web') {
          if (typeof window !== 'undefined') {
            window.alert('You have been signed out.');
          }
        } else {
          Alert.alert('Signed Out', 'You have been signed out.');
        }
        (navigation as any).navigate('ProfileHome');
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

  // ---------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------
  if (isLoadingProfile) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={tokens.colorPrimaryGreen} size="large" />
      </View>
    );
  }

  const showOnboardingForm = !profile || isEditingProfile;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: tokens.colorBgMain }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 140 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.screenHeading}>Farmer Portal</Text>

        {showOnboardingForm ? (
          <>
            {/* ---------------- View Mode 1: Onboarding Form ---------------- */}
            <View style={styles.card}>
              <Text style={styles.sectionHeading}>
                {profile ? 'Edit Profile Details' : 'Sign Up as a Farmer'}
              </Text>

              <Field label="Legal Name *" error={onboardingErrors.legalName}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter full legal name"
                  placeholderTextColor={tokens.colorTextMuted}
                  value={legalName}
                  onChangeText={setLegalName}
                />
              </Field>

              <Field label="Mobile Number *" error={onboardingErrors.mobileNumber}>
                <TextInput
                  style={styles.input}
                  placeholder="07X XXXXXXX"
                  placeholderTextColor={tokens.colorTextMuted}
                  keyboardType="phone-pad"
                  value={mobileNumber}
                  onChangeText={setMobileNumber}
                  maxLength={10}
                />
              </Field>

              <Field label="Farm Name *" error={onboardingErrors.farmName}>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Green Valley Organic Farm"
                  placeholderTextColor={tokens.colorTextMuted}
                  value={farmName}
                  onChangeText={setFarmName}
                />
              </Field>

              <Field label="Farm Cover Photo">
                <Pressable style={styles.coverPhotoTrigger} onPress={handleSelectCoverPhoto}>
                  <Image
                    source={{ uri: farmCoverPhotoUrl || PLACEHOLDER_FARM_COVER_IMAGE }}
                    style={styles.coverPhotoPreview}
                  />
                  <View style={styles.coverPhotoOverlay}>
                    <Text style={styles.coverPhotoOverlayText}>
                      {farmCoverPhotoUrl ? 'Change Cover Photo' : 'Add Cover Photo'}
                    </Text>
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => setShowCoverUrlInput((prev) => !prev)}
                  hitSlop={8}
                  style={styles.coverPhotoUrlToggle}
                >
                  <Text style={styles.coverPhotoUrlToggleText}>
                    {showCoverUrlInput ? 'Hide image URL field' : 'Or paste an image URL instead'}
                  </Text>
                </Pressable>

                {showCoverUrlInput && (
                  <TextInput
                    style={[styles.input, { marginTop: 8 }]}
                    placeholder="https://example.com/your-farm-photo.jpg"
                    placeholderTextColor={tokens.colorTextMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    value={farmCoverPhotoUrl ?? ''}
                    onChangeText={(text) => setFarmCoverPhotoUrl(text)}
                  />
                )}
              </Field>

              <Field label="Location *" error={onboardingErrors.location}>
                <View style={styles.rowGap}>
                  <SelectField
                    label="Province *"
                    value={province}
                    placeholder="Select"
                    options={PROVINCES}
                    onSelect={handleProvinceSelect}
                  />
                  <SelectField
                    label="District *"
                    value={district}
                    placeholder="Select"
                    options={districts}
                    disabled={!province}
                    onSelect={handleDistrictSelect}
                  />
                  <SelectField
                    label="City *"
                    value={city}
                    placeholder="Select"
                    options={cities}
                    disabled={!district}
                    onSelect={setCity}
                  />
                </View>
              </Field>
            </View>

            {/* ---------------- Account Password Section ---------------- */}
            <View style={styles.card}>
              <Text style={styles.sectionHeading}>Account Password</Text>
              <Text style={styles.helperText}>
                {profile
                  ? 'Leave blank if you do not want to change your existing password.'
                  : 'Set a secure password for your EcoHarvest farmer account (minimum 6 characters).'}
              </Text>

              <Field label={`Password ${profile ? '(Optional)' : '*'}`} error={onboardingErrors.password}>
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
              </Field>

              <Field label={`Confirm Password ${profile ? '(Optional)' : '*'}`} error={onboardingErrors.confirmPassword}>
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
              </Field>
            </View>

            {/* ---------------- SLSI Certification (optional) ---------------- */}
            <View style={styles.card}>
              <Text style={styles.sectionHeading}>SLSI Organic Verification</Text>
              <Text style={styles.helperText}>
                Upload SLSI Organic Certificate for Verified Farmer Status
              </Text>

              <Pressable style={styles.secondaryButton} onPress={handleUploadCertificate}>
                <Text style={styles.secondaryButtonText}>
                  {certificateUri ? 'Replace SLSI Certificate' : 'Upload SLSI Certificate'}
                </Text>
              </Pressable>

              <VerificationBadge status={verificationStatus} />
              <Text style={[styles.helperText, { marginTop: 8, marginBottom: 0 }]}>
                Active Marketplace Commission: {commissionRate}%
              </Text>
            </View>

            {/* ---------------- Bank Payout Routing ---------------- */}
            <View style={styles.card}>
              <Text style={styles.sectionHeading}>Bank Payout Details</Text>

              <Field label="Bank Name">
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Bank of Ceylon"
                  placeholderTextColor={tokens.colorTextMuted}
                  value={bankName}
                  onChangeText={setBankName}
                />
              </Field>
              <Field label="Branch Code">
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 001"
                  placeholderTextColor={tokens.colorTextMuted}
                  keyboardType="number-pad"
                  value={branchCode}
                  onChangeText={setBranchCode}
                />
              </Field>
              <Field label="Account Number">
                <TextInput
                  style={styles.input}
                  placeholder="Enter account number"
                  placeholderTextColor={tokens.colorTextMuted}
                  keyboardType="number-pad"
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                />
              </Field>
              <Field label="Account Holder Name">
                <TextInput
                  style={styles.input}
                  placeholder="As per bank records"
                  placeholderTextColor={tokens.colorTextMuted}
                  value={accountHolderName}
                  onChangeText={setAccountHolderName}
                />
              </Field>
            </View>

            <View style={styles.rowGap}>
              {profile && (
                <Pressable style={[styles.secondaryButton, { flex: 1 }]} onPress={handleCancelEdit}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
              )}
              <Pressable
                style={[styles.primaryButton, { flex: 1 }, isSavingProfile && { opacity: 0.6 }]}
                onPress={handleSaveProfile}
                disabled={isSavingProfile}
              >
                <Text style={styles.primaryButtonText}>
                  {isSavingProfile
                    ? 'Saving…'
                    : profile
                      ? 'Save Changes'
                      : 'Complete Sign Up as a Farmer'}
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            {/* ---------------- View Mode 2: Farmer Dashboard ---------------- */}
            <View style={styles.card}>
              <Text style={styles.sectionHeading}>{profile.farmName}</Text>
              <Text style={styles.helperText}>
                {profile.city}, {profile.district}, {profile.province}
              </Text>
              <VerificationBadge status={profile.verificationStatus} />
              <Text style={[styles.helperText, { marginTop: 8, marginBottom: 0 }]}>
                Active Marketplace Commission: {profile.commissionRate ?? DEFAULT_COMMISSION_RATE}%
              </Text>

              <Pressable
                style={[styles.secondaryButton, { marginTop: 12, marginBottom: 0 }]}
                onPress={handleEditProfile}
              >
                <Text style={styles.secondaryButtonText}>Edit Profile Details</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.secondaryButton,
                  {
                    marginTop: 10,
                    marginBottom: 0,
                    backgroundColor: '#FEF2F2',
                    borderColor: '#FEE2E2',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                ]}
                onPress={handleSignOut}
                accessibilityRole="button"
                accessibilityLabel="Sign Out of Farmer Account"
              >
                <Ionicons name="log-out-outline" size={16} color={tokens.colorAlertCrimson} style={{ marginRight: 6 }} />
                <Text style={[styles.secondaryButtonText, { color: tokens.colorAlertCrimson }]}>Sign Out</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      {/* ---------------- Developer Sandbox Toolbar ---------------- */}
      <View style={styles.devToolbar}>
        <Text style={styles.devToolbarCaption}>DEV SANDBOX — SLSI STATUS</Text>
        <View style={styles.devToolbarRow}>
          <Pressable
            style={styles.devButton}
            onPress={() => applyDevVerificationStatus('UNVERIFIED')}
          >
            <Text style={styles.devButtonText}>Set Unverified</Text>
          </Pressable>
          <Pressable
            style={styles.devButton}
            onPress={() => applyDevVerificationStatus('PENDING_VERIFICATION')}
          >
            <Text style={styles.devButtonText}>Set Pending</Text>
          </Pressable>
          <Pressable
            style={styles.devButton}
            onPress={() => applyDevVerificationStatus('VERIFIED')}
          >
            <Text style={styles.devButtonText}>Set Verified</Text>
          </Pressable>
          <Pressable
            style={[styles.devButton, styles.devButtonDanger]}
            onPress={() => applyDevVerificationStatus('REJECTED')}
          >
            <Text style={[styles.devButtonText, styles.devButtonDangerText]}>Set Rejected</Text>
          </Pressable>
          <Pressable
            style={[styles.devButton, styles.devButtonDanger]}
            onPress={handleResetOnboarding}
          >
            <Text style={[styles.devButtonText, styles.devButtonDangerText]}>
              Reset Onboarding
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles — mapped directly to tokens from design.md
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colorBgMain,
  },
  scrollContent: {
    padding: 16,
  },
  screenHeading: {
    fontSize: 24,
    fontWeight: '700',
    color: tokens.colorTextDark,
    marginBottom: 16,
  },
  card: {
    backgroundColor: tokens.colorBgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tokens.colorBorderGray,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '600',
    color: tokens.colorTextDark,
    marginBottom: 12,
  },
  helperText: {
    fontSize: 12,
    color: tokens.colorTextMuted,
    marginBottom: 12,
  },
  fieldWrapper: {
    marginBottom: 14,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: tokens.colorTextDark,
    marginBottom: 6,
  },
  miniLabel: {
    fontSize: 12,
    color: tokens.colorTextMuted,
    marginBottom: 4,
  },
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
  errorText: {
    fontSize: 12,
    color: tokens.colorAlertCrimson,
    marginTop: 4,
  },
  rowGap: {
    flexDirection: 'row',
    gap: 8,
  },
  selectFlex: {
    flex: 1,
  },
  selectInput: {
    justifyContent: 'center',
  },
  selectDisabled: {
    backgroundColor: tokens.colorBgCard,
    opacity: 0.6,
  },
  selectValueText: {
    fontSize: 14,
    color: tokens.colorTextDark,
  },
  placeholderText: {
    fontSize: 14,
    color: tokens.colorTextMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    maxHeight: '60%',
    padding: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: tokens.colorTextDark,
    marginBottom: 8,
  },
  modalOption: {
    paddingVertical: 12,
  },
  modalOptionText: {
    fontSize: 14,
    color: tokens.colorTextDark,
  },
  modalSeparator: {
    height: 1,
    backgroundColor: tokens.colorBorderGray,
  },
  secondaryButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: tokens.colorSecondaryLeaf,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: tokens.colorSecondaryLeaf,
  },
  statusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusTagText: {
    fontSize: 12,
    fontWeight: '500',
  },
  coverPhotoTrigger: {
    height: 140,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: tokens.colorBgCard,
    borderWidth: 1,
    borderColor: tokens.colorBorderGray,
  },
  coverPhotoPreview: {
    width: '100%',
    height: '100%',
  },
  coverPhotoOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(17,24,39,0.55)',
  },
  coverPhotoOverlayText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  coverPhotoUrlToggle: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  coverPhotoUrlToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colorSecondaryLeaf,
  },
  imageTrigger: {
    minHeight: 120,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: tokens.colorBorderGray,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  imagePreview: {
    width: '100%',
    height: 120,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 36,
    borderWidth: 1,
    borderColor: tokens.colorBorderGray,
    borderRadius: 999,
    paddingHorizontal: 14,
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  chipSelected: {
    backgroundColor: tokens.colorPrimaryGreen,
    borderColor: tokens.colorPrimaryGreen,
  },
  chipText: {
    fontSize: 14,
    color: tokens.colorTextDark,
  },
  chipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  primaryButton: {
    minHeight: 44,
    backgroundColor: tokens.colorPrimaryGreen,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  devToolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#111827',
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  devToolbarCaption: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#9CA3AF',
    marginBottom: 8,
    textAlign: 'center',
  },
  devToolbarRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  devButton: {
    minHeight: 36,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4B5563',
    backgroundColor: '#1F2937',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  devButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#E5E7EB',
  },
  devButtonDanger: {
    borderColor: tokens.colorAlertCrimson,
  },
  devButtonDangerText: {
    color: '#FCA5A5',
  },
  // ---------------- System Alerts & Notifications ----------------
  notificationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  notificationSubheading: {
    fontSize: 12,
    color: tokens.colorTextMuted,
    marginTop: 2,
  },
  notificationMarkAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: tokens.colorPrimaryGreen,
  },
  notificationCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  notificationCardUnread: {
    backgroundColor: '#F0FDF4',
    borderColor: `${tokens.colorPrimaryGreen}33`,
  },
  notificationCardRead: {
    backgroundColor: tokens.colorBgCard,
    borderColor: tokens.colorBorderGray,
  },
  notificationUnreadDot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.colorPrimaryGreen,
  },
  notificationTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: tokens.colorTextDark,
    marginBottom: 2,
    paddingRight: 16,
  },
  notificationMessage: {
    fontSize: 12,
    color: tokens.colorTextDark,
    marginBottom: 4,
  },
  notificationTimestamp: {
    fontSize: 11,
    color: tokens.colorTextMuted,
  },
  notificationSandbox: {
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.colorBorderGray,
    gap: 8,
  },
  notificationSandboxLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: tokens.colorTextMuted,
  },
  notificationSandboxRow: {
    flexDirection: 'row',
    gap: 8,
  },
  notificationSandboxButton: {
    flex: 1,
    minHeight: 36,
    borderWidth: 1,
    borderColor: tokens.colorBorderGray,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  notificationSandboxButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: tokens.colorTextDark,
  },
  inquiryCard: {
    borderWidth: 1,
    borderColor: tokens.colorBorderGray,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    padding: 12,
    marginBottom: 10,
  },
  inquiryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  inquiryCustomerName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: tokens.colorTextDark,
    marginRight: 8,
  },
  inquiryTimestamp: {
    fontSize: 11,
    color: tokens.colorTextMuted,
  },
  inquiryContext: {
    fontSize: 12,
    color: tokens.colorSecondaryLeaf,
    fontWeight: '500',
    marginBottom: 4,
  },
  inquiryPreview: {
    fontSize: 13,
    color: tokens.colorTextMuted,
    marginBottom: 10,
  },
  inquiryReplyButton: {
    marginTop: 0,
    marginBottom: 0,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    minHeight: 36,
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
});