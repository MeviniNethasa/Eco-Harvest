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
import {
  BankDetails,
  ChatMessage,
  ChatThread,
  Crop,
  CropCategory,
  FarmerProfile,
  VerificationStatus,
} from '../types';
import {
  clearFarmerProfile,
  generateFarmerId,
  getAllChatThreads,
  getChatMessages,
  getFarmerProfile,
  publishCrop,
  saveFarmerProfile,
} from '../utils/storage';
import { PROVINCES, getDistricts, getCities } from '../data/sriLankaLocations';

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
};

const PLACEHOLDER_CROP_IMAGE = 'https://placehold.co/400x400/16A34A/FFFFFF?text=Crop';

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

  // --- Onboarding form fields (shared by first-time setup + "Edit Profile") ---
  const [legalName, setLegalName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [farmName, setFarmName] = useState('');
  const [province, setProvince] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [bankName, setBankName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [certificateUri, setCertificateUri] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('UNVERIFIED');
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

  // ---- Load the persisted profile once on mount ----
  useEffect(() => {
    (async () => {
      const existing = await getFarmerProfile();
      setProfile(existing);
      setIsLoadingProfile(false);
    })();
  }, []);

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

  const resetOnboardingFormFields = () => {
    setLegalName('');
    setMobileNumber('');
    setFarmName('');
    setProvince(null);
    setDistrict(null);
    setCity(null);
    setBankName('');
    setBranchCode('');
    setAccountNumber('');
    setAccountHolderName('');
    setCertificateUri(null);
    setVerificationStatus('UNVERIFIED');
    setOnboardingErrors({});
  };

  const prefillFormFromProfile = (p: FarmerProfile) => {
    setLegalName(p.legalName);
    setMobileNumber(p.mobileNumber);
    setFarmName(p.farmName);
    setProvince(p.province);
    setDistrict(p.district);
    setCity(p.city);
    setBankName(p.bankDetails.bankName);
    setBranchCode(p.bankDetails.branchCode);
    setAccountNumber(p.bankDetails.accountNumber);
    setAccountHolderName(p.bankDetails.accountHolderName);
    setCertificateUri(p.slsiCertificateUri);
    setVerificationStatus(p.verificationStatus);
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
      });
      if (!result.canceled && result.assets?.length) {
        setCertificateUri(result.assets[0].uri);
        setVerificationStatus('PENDING_VERIFICATION');
      }
    } catch (err) {
      console.error('Failed to open image library for SLSI certificate:', err);
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
      };

      const saved = await saveFarmerProfile(profileToSave);
      const wasFirstTime = !profile;
      setProfile(saved);
      setIsEditingProfile(false);

      Alert.alert(
        wasFirstTime ? 'Onboarding Complete' : 'Profile Updated',
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

  const handleEditProfile = () => {
    if (profile) prefillFormFromProfile(profile);
    setIsEditingProfile(true);
  };

  const handleCancelEdit = () => {
    if (profile) prefillFormFromProfile(profile); // discard unsaved edits
    setIsEditingProfile(false);
  };

  // ---- Developer Sandbox: manual verification-status toggles ----
  const applyDevVerificationStatus = async (status: VerificationStatus) => {
    setVerificationStatus(status);
    if (!profile) return; // no profile saved yet — just previews in the form
    try {
      const updated = await saveFarmerProfile({
        ...profile,
        verificationStatus: status,
        isSLSIVerified: status === 'VERIFIED',
      });
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
                {profile ? 'Edit Profile Details' : 'Farmer Account Onboarding'}
              </Text>

              <Field label="Legal Name" error={onboardingErrors.legalName}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter full legal name"
                  placeholderTextColor={tokens.colorTextMuted}
                  value={legalName}
                  onChangeText={setLegalName}
                />
              </Field>

              <Field label="Mobile Number" error={onboardingErrors.mobileNumber}>
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

              <Field label="Farm Name" error={onboardingErrors.farmName}>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Green Valley Organic Farm"
                  placeholderTextColor={tokens.colorTextMuted}
                  value={farmName}
                  onChangeText={setFarmName}
                />
              </Field>

              <Field label="Location" error={onboardingErrors.location}>
                <View style={styles.rowGap}>
                  <SelectField
                    label="Province"
                    value={province}
                    placeholder="Select"
                    options={PROVINCES}
                    onSelect={handleProvinceSelect}
                  />
                  <SelectField
                    label="District"
                    value={district}
                    placeholder="Select"
                    options={districts}
                    disabled={!province}
                    onSelect={handleDistrictSelect}
                  />
                  <SelectField
                    label="City"
                    value={city}
                    placeholder="Select"
                    options={cities}
                    disabled={!district}
                    onSelect={setCity}
                  />
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
                    : 'Complete Onboarding'}
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

              <Pressable
                style={[styles.secondaryButton, { marginTop: 12, marginBottom: 0 }]}
                onPress={handleEditProfile}
              >
                <Text style={styles.secondaryButtonText}>Edit Profile Details</Text>
              </Pressable>
            </View>

            {/* ---------------- Customer Inquiries & Messages ---------------- */}
            <View style={styles.card}>
              <Text style={styles.sectionHeading}>Customer Inquiries & Messages</Text>

              {isLoadingThreads ? (
                <ActivityIndicator color={tokens.colorPrimaryGreen} />
              ) : chatThreads.length === 0 ? (
                <Text style={styles.helperText}>No customer messages yet.</Text>
              ) : (
                chatThreads.map(({ thread, lastMessage }) => (
                  <View key={thread.id} style={styles.inquiryCard}>
                    <View style={styles.inquiryHeaderRow}>
                      <Text style={styles.inquiryCustomerName} numberOfLines={1}>
                        {thread.recipientName}
                      </Text>
                      {lastMessage && (
                        <Text style={styles.inquiryTimestamp}>
                          {formatInquiryTimestamp(lastMessage.timestamp)}
                        </Text>
                      )}
                    </View>

                    <Text style={styles.inquiryContext} numberOfLines={1}>
                      Order #{thread.orderId.replace(/^#/, '')} • {thread.cropSummary}
                    </Text>

                    <Text style={styles.inquiryPreview} numberOfLines={2}>
                      {lastMessage
                        ? lastMessage.isBlocked
                          ? '[ Message Blocked: off-platform contact info ]'
                          : lastMessage.text
                        : 'No messages yet.'}
                    </Text>

                    <Pressable
                      style={[styles.secondaryButton, styles.inquiryReplyButton]}
                      onPress={() =>
                        (navigation as any).navigate('Chat', {
                          threadId: thread.id,
                          recipientName: thread.recipientName,
                          userRole: 'FARMER',
                        })
                      }
                    >
                      <Text style={styles.secondaryButtonText}>Reply to Customer</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </View>

            {/* ---------------- Product Publisher ---------------- */}
            <View style={styles.card}>
              <Text style={styles.sectionHeading}>Publish New Crop to Marketplace</Text>

              <Pressable style={styles.imageTrigger} onPress={handleSelectCropImage}>
                {cropImageUri ? (
                  <Image source={{ uri: cropImageUri }} style={styles.imagePreview} />
                ) : (
                  <Text style={styles.secondaryButtonText}>Select Crop Image</Text>
                )}
              </Pressable>

              <Field label="Crop Name" error={publishErrors.cropName}>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Organic Carrot"
                  placeholderTextColor={tokens.colorTextMuted}
                  value={cropName}
                  onChangeText={setCropName}
                />
              </Field>

              <Field label="Baseline Unit Price" error={publishErrors.pricePerUnit}>
                <TextInput
                  style={styles.input}
                  placeholder="Price in LKR per 1kg"
                  placeholderTextColor={tokens.colorTextMuted}
                  keyboardType="numeric"
                  value={pricePerUnit}
                  onChangeText={setPricePerUnit}
                />
              </Field>

              <Field label="Category" error={publishErrors.category}>
                <View style={styles.chipRow}>
                  {CATEGORIES.map((cat) => {
                    const selected = category === cat;
                    return (
                      <Pressable
                        key={cat}
                        style={[styles.chip, selected && styles.chipSelected]}
                        onPress={() => setCategory(cat)}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                          {cat}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Field>

              <Field label="Available Stock (kg)" error={publishErrors.availableQtyKg}>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 150"
                  placeholderTextColor={tokens.colorTextMuted}
                  keyboardType="numeric"
                  value={availableQtyKg}
                  onChangeText={setAvailableQtyKg}
                />
              </Field>

              <Field label="Low-Stock Alert Threshold" error={publishErrors.lowStockThreshold}>
                <TextInput
                  style={styles.input}
                  placeholder="Minimum stock threshold (e.g., 10kg)"
                  placeholderTextColor={tokens.colorTextMuted}
                  keyboardType="numeric"
                  value={lowStockThreshold}
                  onChangeText={setLowStockThreshold}
                />
              </Field>

              <Pressable
                style={[styles.primaryButton, isPublishing && { opacity: 0.6 }]}
                onPress={handlePublish}
                disabled={isPublishing}
              >
                <Text style={styles.primaryButtonText}>
                  {isPublishing ? 'Publishing…' : 'Publish Crop Listing'}
                </Text>
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
});