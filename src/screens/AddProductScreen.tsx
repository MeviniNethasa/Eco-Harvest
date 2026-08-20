// src/screens/AddProductScreen.tsx
//
// Farmer Mode tab 2 ("Add Product"): the publish-crop form for Screen M-02's
// `publishCrop` (storage.ts). Denormalized farm fields (`farmName`,
// `province`, `district`, `city`, `farmerId`) are pulled from the current
// on-device `FarmerProfile` rather than re-asked here, matching how
// `Crop`/`CartItem` already carry them.

import React, { useCallback, useState } from 'react';
import {
  Alert,
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
import { CropCategory, FarmerProfile, FarmerTabParamList } from '../types';
import { getFarmerProfile, publishCrop } from '../utils/storage';

type NavProp = BottomTabNavigationProp<FarmerTabParamList, 'AddProduct'>;

const CATEGORIES: CropCategory[] = ['Vegetables', 'Fruits', 'Grains', 'Spices'];

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
  const [submitting, setSubmitting] = useState(false);

  // Re-check the farmer profile every time this tab regains focus, in case
  // it was edited (e.g. farm name) from the Profile tab in the meantime.
  useFocusEffect(
    useCallback(() => {
      getFarmerProfile().then(setProfile);
    }, [])
  );

  const updateField = (field: keyof typeof EMPTY_FORM, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
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
      await publishCrop({
        farmerId: profile.id,
        name: form.name.trim(),
        category: form.category,
        pricePerUnit: price,
        unit: form.unit.trim(),
        imageUrl: form.imageUrl.trim() || 'https://placehold.co/400x400?text=Crop',
        farmName: profile.farmName,
        province: profile.province,
        district: profile.district,
        city: profile.city,
        availableQtyKg: form.availableQtyKg ? Number(form.availableQtyKg) : undefined,
      });
      setForm(EMPTY_FORM);
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
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Add Product</Text>
        <Text style={styles.subtitle}>
          Publish a new crop listing to {profile?.farmName ?? 'your farm'}'s storefront.
        </Text>

        <Field label="Product name">
          <TextInput
            style={styles.input}
            placeholder="e.g. Organic Carrots"
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
              keyboardType="numeric"
              value={form.pricePerUnit}
              onChangeText={(v) => updateField('pricePerUnit', v)}
            />
          </Field>
          <Field label="Unit" style={{ flex: 1 }}>
            <TextInput
              style={styles.input}
              placeholder="1kg"
              value={form.unit}
              onChangeText={(v) => updateField('unit', v)}
            />
          </Field>
        </View>

        <Field label="Available bulk stock (kg, optional)">
          <TextInput
            style={styles.input}
            placeholder="e.g. 500"
            keyboardType="numeric"
            value={form.availableQtyKg}
            onChangeText={(v) => updateField('availableQtyKg', v)}
          />
        </Field>

        <Field label="Image URL (optional)">
          <TextInput
            style={styles.input}
            placeholder="https://..."
            autoCapitalize="none"
            value={form.imageUrl}
            onChangeText={(v) => updateField('imageUrl', v)}
          />
        </Field>

        <Pressable
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handlePublish}
          disabled={submitting}
        >
          <Text style={styles.submitButtonText}>
            {submitting ? 'Publishing…' : 'Publish Listing'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
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
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 13, color: '#6B7280', marginTop: -8, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 12 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#FFFFFF',
    color: '#111827',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
  },
  chipActive: { backgroundColor: '#15803D', borderColor: '#15803D' },
  chipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  chipTextActive: { color: '#FFFFFF' },
  submitButton: {
    backgroundColor: '#15803D',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});