// src/components/FilterModal.tsx

import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Pressable,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import {
  CropCategory,
  FilterState,
  DEFAULT_FILTER_STATE,
} from '../types';
import { CROP_CATEGORIES, SL_LOCATIONS } from '../data/mockData';

interface FilterModalProps {
  visible: boolean;
  initialFilters: FilterState;
  onClose: () => void;
  onApply: (filters: FilterState) => void;
}

export default function FilterModal({
  visible,
  initialFilters,
  onClose,
  onApply,
}: FilterModalProps) {
  const [filters, setFilters] = useState<FilterState>(initialFilters);

  useEffect(() => {
    if (visible) setFilters(initialFilters);
  }, [visible, initialFilters]);

  const toggleCategory = (category: CropCategory) => {
    setFilters((prev) => {
      const has = prev.categories.includes(category);
      return {
        ...prev,
        categories: has
          ? prev.categories.filter((c) => c !== category)
          : [...prev.categories, category],
      };
    });
  };

  const selectProvince = (province: string) => {
    setFilters((prev) => ({
      ...prev,
      location: { province, district: null, city: null },
    }));
  };

  const selectDistrict = (district: string) => {
    setFilters((prev) => ({
      ...prev,
      location: { ...prev.location, district, city: null },
    }));
  };

  const selectCity = (city: string) => {
    setFilters((prev) => ({
      ...prev,
      location: { ...prev.location, city },
    }));
  };

  const districts = filters.location.province
    ? Object.keys(SL_LOCATIONS[filters.location.province] ?? {})
    : [];

  const cities =
    filters.location.province && filters.location.district
      ? SL_LOCATIONS[filters.location.province]?.[filters.location.district] ?? []
      : [];

  const handleReset = () => setFilters(DEFAULT_FILTER_STATE);

  const handleApply = () => {
    onApply(filters);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />

        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Filters</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color="#111827" />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Crop Category Grid */}
          <Text style={styles.sectionLabel}>Crop Category</Text>
          <View style={styles.chipRow}>
            {CROP_CATEGORIES.map((category) => {
              const active = filters.categories.includes(category);
              return (
                <TouchableOpacity
                  key={category}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => toggleCategory(category)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {category}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Geographic Range Selector */}
          <Text style={styles.sectionLabel}>Location</Text>

          <Text style={styles.subLabel}>Province</Text>
          <View style={styles.chipRow}>
            {Object.keys(SL_LOCATIONS).map((province) => {
              const active = filters.location.province === province;
              return (
                <TouchableOpacity
                  key={province}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => selectProvince(province)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {province}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {districts.length > 0 && (
            <>
              <Text style={styles.subLabel}>District</Text>
              <View style={styles.chipRow}>
                {districts.map((district) => {
                  const active = filters.location.district === district;
                  return (
                    <TouchableOpacity
                      key={district}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => selectDistrict(district)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {district}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {cities.length > 0 && (
            <>
              <Text style={styles.subLabel}>City</Text>
              <View style={styles.chipRow}>
                {cities.map((city) => {
                  const active = filters.location.city === city;
                  return (
                    <TouchableOpacity
                      key={city}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => selectCity(city)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {city}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* Organic Tier Toggle */}
          <View style={styles.toggleRow}>
            <Text style={styles.sectionLabel}>Verified SLSI Organic Only</Text>
            <Switch
              value={filters.verifiedOnly}
              onValueChange={(value) =>
                setFilters((prev) => ({ ...prev, verifiedOnly: value }))
              }
              trackColor={{ false: '#E5E7EB', true: '#16A34A' }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Price Range Slider (dual-node) */}
          <Text style={styles.sectionLabel}>Price Range (LKR)</Text>
          <Text style={styles.priceValueText}>
            LKR {filters.priceRange.min} — LKR {filters.priceRange.max}
          </Text>

          <Text style={styles.subLabel}>Minimum</Text>
          <Slider
            minimumValue={0}
            maximumValue={2000}
            step={50}
            value={filters.priceRange.min}
            minimumTrackTintColor="#15803D"
            maximumTrackTintColor="#E5E7EB"
            thumbTintColor="#15803D"
            onValueChange={(value) =>
              setFilters((prev) => ({
                ...prev,
                priceRange: {
                  ...prev.priceRange,
                  min: Math.min(value, prev.priceRange.max),
                },
              }))
            }
          />

          <Text style={styles.subLabel}>Maximum</Text>
          <Slider
            minimumValue={0}
            maximumValue={2000}
            step={50}
            value={filters.priceRange.max}
            minimumTrackTintColor="#15803D"
            maximumTrackTintColor="#E5E7EB"
            thumbTintColor="#15803D"
            onValueChange={(value) =>
              setFilters((prev) => ({
                ...prev,
                priceRange: {
                  ...prev.priceRange,
                  max: Math.max(value, prev.priceRange.min),
                },
              }))
            }
          />
        </ScrollView>

        <View style={styles.footerRow}>
          <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
            <Text style={styles.resetButtonText}>Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
            <Text style={styles.applyButtonText}>Apply Filters</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#FAFAFA',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    marginVertical: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  subLabel: {
    fontSize: 12,
    color: '#6B7280',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  chipActive: {
    backgroundColor: '#15803D',
    borderColor: '#15803D',
  },
  chipText: {
    fontSize: 14,
    color: '#111827',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  priceValueText: {
    fontSize: 14,
    color: '#111827',
    marginBottom: 4,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  resetButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  applyButton: {
    flex: 2,
    minHeight: 44,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#15803D',
  },
  applyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.25,
    color: '#FFFFFF',
  },
});