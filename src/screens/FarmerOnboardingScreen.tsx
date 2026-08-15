// src/screens/FarmerOnboardingScreen.tsx
import React, { useMemo, useState } from 'react';
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Crop, CropCategory } from '../types';
import { publishCrop } from '../utils/storage';
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
};

const CATEGORIES: CropCategory[] = ['Vegetables', 'Fruits', 'Grains', 'Spices'];

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
// Screen
// ---------------------------------------------------------------------------
export default function FarmerOnboardingScreen() {
  // --- Section 1: Personal & Farm Metadata ---
  const [legalName, setLegalName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [farmName, setFarmName] = useState('');
  const [province, setProvince] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);

  // --- Section 2: SLSI Certification ---
  const [isSLSIVerified, setIsSLSIVerified] = useState(false);
  const [certificateUri, setCertificateUri] = useState<string | null>(null);

  // --- Section 3: Bank Payout Routing ---
  // (Not part of the `Crop` type — kept as local form state for the farmer's
  // profile; wire to a farmer-profile storage key if/when you add one.)
  const [bankName, setBankName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');

  // --- Section 4: Product Publisher ---
  const [cropImageUri, setCropImageUri] = useState<string | null>(null);
  const [cropName, setCropName] = useState('');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [category, setCategory] = useState<CropCategory | null>(null);
  const [lowStockThreshold, setLowStockThreshold] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPublishing, setIsPublishing] = useState(false);

  const districts = useMemo(() => getDistricts(province), [province]);
  const cities = useMemo(() => getCities(province, district), [province, district]);

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
        setIsSLSIVerified(true);
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

  // ---- Validation ----
  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!legalName.trim()) next.legalName = 'Legal name is required.';
    if (!mobileNumber.trim()) next.mobileNumber = 'Mobile number is required.';
    if (!farmName.trim()) next.farmName = 'Farm name is required.';
    if (!province || !district || !city) next.location = 'Select province, district and city.';
    if (!cropName.trim()) next.cropName = 'Crop name is required.';
    if (!pricePerUnit.trim() || isNaN(Number(pricePerUnit)) || Number(pricePerUnit) <= 0) {
      next.pricePerUnit = 'Enter a valid price in LKR.';
    }
    if (!category) next.category = 'Select a category.';
    if (
      lowStockThreshold.trim() &&
      (isNaN(Number(lowStockThreshold)) || Number(lowStockThreshold) < 0)
    ) {
      next.lowStockThreshold = 'Enter a valid stock threshold.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  // ---- Publish ----
  const handlePublish = async () => {
    if (!validate()) return;
    setIsPublishing(true);
    try {
      // Note: no `id` here — publishCrop() in storage.ts is the single
      // source of truth for ID generation, so it can't drift out of sync
      // with whatever ends up persisted.
      const cropInput: Omit<Crop, 'id'> = {
        name: cropName.trim(),
        category: category as CropCategory,
        pricePerUnit: Number(pricePerUnit),
        unit: '1kg',
        imageUrl: cropImageUri ?? 'https://placehold.co/400x400/16A34A/FFFFFF?text=Crop',
        isSLSIVerified,
        farmName: farmName.trim(),
        province: province as string,
        district: district as string,
        city: city as string,
        lowStockThreshold: lowStockThreshold.trim() ? Number(lowStockThreshold) : undefined,
      };

      const updatedCatalog = await publishCrop(cropInput);
      const published = updatedCatalog[0];

      Alert.alert('Crop Published', `${published.name} is now live on the Marketplace.`, [{ text: 'OK' }]);

      // Reset only the product-publisher section — farmer profile & bank
      // details persist for the next listing.
      setCropImageUri(null);
      setCropName('');
      setPricePerUnit('');
      setCategory(null);
      setLowStockThreshold('');
      setErrors({});
    } catch (err) {
      // publishCrop/saveCrops now throw on failure instead of failing
      // silently, so a broken save is never mistaken for success.
      console.error('Failed to publish crop:', err);
      Alert.alert(
        'Publish failed',
        'We couldn\'t save this listing. Please check your connection/storage and try again.',
      );
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: tokens.colorBgMain }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.screenHeading}>Farmer Portal</Text>

        {/* ---------------- Section 1: Personal & Farm Details ---------------- */}
        <View style={styles.card}>
          <Text style={styles.sectionHeading}>Farmer Account Onboarding</Text>

          <Field label="Legal Name" error={errors.legalName}>
            <TextInput
              style={styles.input}
              placeholder="Enter full legal name"
              placeholderTextColor={tokens.colorTextMuted}
              value={legalName}
              onChangeText={setLegalName}
            />
          </Field>

          <Field label="Mobile Number" error={errors.mobileNumber}>
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

          <Field label="Farm Name" error={errors.farmName}>
            <TextInput
              style={styles.input}
              placeholder="e.g., Green Valley Organic Farm"
              placeholderTextColor={tokens.colorTextMuted}
              value={farmName}
              onChangeText={setFarmName}
            />
          </Field>

          <Field label="Location" error={errors.location}>
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

        {/* ---------------- Section 2: SLSI Certification ---------------- */}
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

          <View
            style={[
              styles.statusTag,
              { backgroundColor: isSLSIVerified ? '#DCFCE7' : '#F4F4F5' },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isSLSIVerified ? tokens.colorPrimaryGreen : tokens.colorTextMuted },
              ]}
            />
            <Text
              style={[
                styles.statusTagText,
                { color: isSLSIVerified ? tokens.colorPrimaryGreen : tokens.colorTextMuted },
              ]}
            >
              {isSLSIVerified ? 'SLSI Verified' : 'Pending Verification / Unverified'}
            </Text>
          </View>
        </View>

        {/* ---------------- Section 3: Bank Payout Routing ---------------- */}
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

        {/* ---------------- Section 4: Product Publisher ---------------- */}
        <View style={styles.card}>
          <Text style={styles.sectionHeading}>Publish New Crop to Marketplace</Text>

          <Pressable style={styles.imageTrigger} onPress={handleSelectCropImage}>
            {cropImageUri ? (
              <Image source={{ uri: cropImageUri }} style={styles.imagePreview} />
            ) : (
              <Text style={styles.secondaryButtonText}>Select Crop Image</Text>
            )}
          </Pressable>

          <Field label="Crop Name" error={errors.cropName}>
            <TextInput
              style={styles.input}
              placeholder="e.g., Organic Carrot"
              placeholderTextColor={tokens.colorTextMuted}
              value={cropName}
              onChangeText={setCropName}
            />
          </Field>

          <Field label="Baseline Unit Price" error={errors.pricePerUnit}>
            <TextInput
              style={styles.input}
              placeholder="Price in LKR per 1kg"
              placeholderTextColor={tokens.colorTextMuted}
              keyboardType="numeric"
              value={pricePerUnit}
              onChangeText={setPricePerUnit}
            />
          </Field>

          <Field label="Category" error={errors.category}>
            <View style={styles.chipRow}>
              {CATEGORIES.map((cat) => {
                const selected = category === cat;
                return (
                  <Pressable
                    key={cat}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{cat}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <Field label="Low-Stock Alert Threshold" error={errors.lowStockThreshold}>
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles — mapped directly to tokens from design.md
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
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
});