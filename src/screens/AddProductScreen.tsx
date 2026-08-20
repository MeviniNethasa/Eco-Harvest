// src/screens/AddProductScreen.tsx
//
// Farmer Mode tab 2 ("Add Product"): the publish-crop form for Screen M-02's
// `publishCrop` (storage.ts). Denormalized farm fields (`farmName`,
// `province`, `district`, `city`, `farmerId`) are pulled from the current
// on-device `FarmerProfile` rather than re-asked here.
// Integrated with Native Gallery Image Picker (expo-image-picker) and
// backend REST API syncing.

import React, { useCallback, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { CropCategory, FarmerProfile, FarmerTabParamList } from '../types';
import { getFarmerProfile, publishCrop } from '../utils/storage';
import { productApi } from '../services/api';
import StandardHeader from '../components/StandardHeader';

type NavProp = BottomTabNavigationProp<FarmerTabParamList, 'AddProduct'>;

const CATEGORIES: CropCategory[] = ['Vegetables', 'Fruits', 'Grains', 'Spices'];

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&q=60';

const EMPTY_FORM = {
  name: '',
  category: 'Vegetables' as CropCategory,
  pricePerUnit: '',
  unit: '1kg',
  imageUrl: '',
  availableQtyKg: '',
};

export default function AddProductScreen() {
  const navigation = useNavigation<NavProp>();
  const [profile, setProfile] = useState<FarmerProfile | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getFarmerProfile().then(setProfile);
    }, [])
  );

  const updateField = (field: keyof typeof EMPTY_FORM, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePickFromGallery = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission Required',
          'EcoHarvest needs access to your photo library to select crop pictures.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        setSelectedImageUri(uri);
        updateField('imageUrl', uri);
      }
    } catch (err) {
      console.error('Gallery picker error:', err);
      Alert.alert('Error', 'Could not open image library.');
    }
  };

  const handleTakePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Camera Permission',
          'EcoHarvest needs camera access to take crop pictures.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        setSelectedImageUri(uri);
        updateField('imageUrl', uri);
      }
    } catch (err) {
      console.error('Camera error:', err);
      Alert.alert('Error', 'Could not access camera.');
    }
  };

  const handleRemoveImage = () => {
    setSelectedImageUri(null);
    updateField('imageUrl', '');
  };

  const handlePublish = async () => {
    if (!profile) {
      Alert.alert('Farm profile required', 'Complete your Farmer Portal profile first.');
      return;
    }
    const price = Number(form.pricePerUnit);
    if (!form.name.trim() || !Number.isFinite(price) || price <= 0 || !form.unit.trim()) {
      Alert.alert('Missing details', 'Enter a product name, a valid price, and a unit.');
      return;
    }

    setSubmitting(true);
    try {
      const finalImage = form.imageUrl.trim() || selectedImageUri || DEFAULT_IMAGE;

      // 1. Save to local device storage
      const newCrop = await publishCrop({
        farmerId: profile.id,
        name: form.name.trim(),
        category: form.category,
        pricePerUnit: price,
        unit: form.unit.trim(),
        imageUrl: finalImage,
        farmName: profile.farmName,
        province: profile.province,
        district: profile.district,
        city: profile.city,
        availableQtyKg: form.availableQtyKg ? Number(form.availableQtyKg) : undefined,
      });

      // 2. Sync to Node.js backend
      productApi
        .createProduct({
          farmerId: profile.id,
          title: form.name.trim(),
          name: form.name.trim(),
          category: form.category,
          pricePerKg: price,
          pricePerUnit: price,
          unit: form.unit.trim(),
          availableQuantity: form.availableQtyKg ? Number(form.availableQtyKg) : 100,
          availableQtyKg: form.availableQtyKg ? Number(form.availableQtyKg) : 100,
          imageUrl: finalImage,
          farmName: profile.farmName,
          province: profile.province,
          district: profile.district,
          city: profile.city,
          isSLSIVerified: profile.isSLSIVerified ?? false,
        })
        .catch((e: any) => console.log('Product backend sync notice:', e?.message));

      setForm(EMPTY_FORM);
      setSelectedImageUri(null);

      Alert.alert('Published', `${form.name.trim()} is now live on the marketplace.`, [
        { text: 'View My Products', onPress: () => navigation.navigate('MyProducts') },
        { text: 'Add Another', style: 'cancel' },
      ]);
    } catch (error) {
      console.error('Failed to publish crop:', error);
      Alert.alert('Publish failed', 'Something went wrong — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StandardHeader
        title="Add Product"
        subtitle={`Publish a new crop to ${profile?.farmName ?? 'your farm'}'s catalog`}
        showNotificationBell
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.formCard}>
            <Field label="Product Name">
              <TextInput
                style={styles.input}
                placeholder="e.g. Organic Carrots"
                placeholderTextColor="#9CA3AF"
                value={form.name}
                onChangeText={(v) => updateField('name', v)}
              />
            </Field>

            <Field label="Category">
              <View style={styles.chipRow}>
                {CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat}
                    style={[styles.chip, form.category === cat && styles.chipActive]}
                    onPress={() => setForm((prev) => ({ ...prev, category: cat }))}
                  >
                    <Text style={[styles.chipText, form.category === cat && styles.chipTextActive]}>
                      {cat}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Field>

            <View style={styles.row}>
              <Field label="Price (LKR)" style={{ flex: 1 }}>
                <TextInput
                  style={styles.input}
                  placeholder="250"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                  value={form.pricePerUnit}
                  onChangeText={(v) => updateField('pricePerUnit', v)}
                />
              </Field>
              <Field label="Unit" style={{ flex: 1 }}>
                <TextInput
                  style={styles.input}
                  placeholder="1kg"
                  placeholderTextColor="#9CA3AF"
                  value={form.unit}
                  onChangeText={(v) => updateField('unit', v)}
                />
              </Field>
            </View>

            <Field label="Available Bulk Stock (kg, optional)">
              <TextInput
                style={styles.input}
                placeholder="e.g. 500"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
                value={form.availableQtyKg}
                onChangeText={(v) => updateField('availableQtyKg', v)}
              />
            </Field>

            {/* Native Gallery & Camera Image Picker */}
            <Field label="Crop Photo">
              {selectedImageUri || form.imageUrl ? (
                <View style={styles.imagePreviewContainer}>
                  <Image
                    source={{ uri: selectedImageUri || form.imageUrl }}
                    style={styles.imagePreview}
                  />
                  <View style={styles.previewActionsOverlay}>
                    <Pressable
                      style={styles.previewActionButton}
                      onPress={handlePickFromGallery}
                    >
                      <Ionicons name="images-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.previewActionText}>Change</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.previewActionButton, styles.removeActionButton]}
                      onPress={handleRemoveImage}
                    >
                      <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.previewActionText}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.pickerBox}>
                  <Pressable
                    style={styles.galleryButton}
                    onPress={handlePickFromGallery}
                    accessibilityRole="button"
                    accessibilityLabel="Upload from Photo Gallery"
                  >
                    <View style={styles.pickerIconCircle}>
                      <Ionicons name="images" size={24} color="#15803D" />
                    </View>
                    <Text style={styles.galleryButtonTitle}>Upload from Gallery</Text>
                    <Text style={styles.galleryButtonSubtitle}>Choose high-res crop photo</Text>
                  </Pressable>

                  <View style={styles.orDivider}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.orText}>OR</Text>
                    <View style={styles.dividerLine} />
                  </View>

                  <Pressable
                    style={styles.cameraButton}
                    onPress={handleTakePhoto}
                    accessibilityRole="button"
                    accessibilityLabel="Take Photo with Camera"
                  >
                    <Ionicons name="camera-outline" size={18} color="#4B5563" />
                    <Text style={styles.cameraButtonText}>Take Photo</Text>
                  </Pressable>
                </View>
              )}
            </Field>

            <Pressable
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handlePublish}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Publish Crop Listing"
            >
              <Text style={styles.submitButtonText}>
                {submitting ? 'Publishing…' : 'Publish Listing'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  content: { padding: 16, paddingBottom: 40 },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 18,
    gap: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  row: { flexDirection: 'row', gap: 12 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: '#FAFAFA',
    color: '#111827',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#FAFAFA',
  },
  chipActive: { backgroundColor: '#15803D', borderColor: '#15803D' },
  chipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  chipTextActive: { color: '#FFFFFF', fontWeight: '600' },
  pickerBox: {
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    gap: 10,
  },
  galleryButton: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    width: '100%',
  },
  pickerIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  galleryButtonTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#15803D',
  },
  galleryButtonSubtitle: {
    fontSize: 12,
    color: '#6B7280',
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '80%',
    gap: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  orText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  cameraButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  cameraButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  imagePreviewContainer: {
    position: 'relative',
    width: '100%',
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  previewActionsOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    gap: 8,
  },
  previewActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(17,24,39,0.75)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  removeActionButton: {
    backgroundColor: 'rgba(220,38,38,0.85)',
  },
  previewActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#15803D',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});