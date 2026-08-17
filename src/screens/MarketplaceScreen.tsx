// src/screens/MarketplaceScreen.tsx

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Crop, FilterState, DEFAULT_FILTER_STATE } from '../types';
import { MOCK_CROPS } from '../data/mockData';
import { getCrops, subscribeToCrops } from '../utils/storage';
import ProductCard from '../components/ProductCard';
import FilterModal from '../components/FilterModal';
import HeaderBranding from '../components/HeaderBranding';

export default function MarketplaceScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Crops published from Screen M-02 (Farmer Onboarding), loaded from
  // AsyncStorage via storage.ts. Kept separate from MOCK_CROPS (the static
  // seed catalog) and merged below.
  const [publishedCrops, setPublishedCrops] = useState<Crop[]>([]);

  // Re-fetch published crops every time this screen gains focus (e.g. after
  // navigating back from Screen M-02 right after publishing).
  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      getCrops().then((crops) => {
        if (isActive) setPublishedCrops(crops);
      });
      return () => {
        isActive = false;
      };
    }, [])
  );

  // Also stay live while this screen is mounted, in case a crop is
  // published/edited/removed without a focus change in between.
  useEffect(() => {
    const unsubscribe = subscribeToCrops(setPublishedCrops);
    return unsubscribe;
  }, []);

  // Merge the static seed catalog with dynamically published crops.
  // Published crops are listed first (most-recent-first, since
  // storage.ts's publishCrop() prepends), and de-duped by id in case a
  // published crop ever reuses a seed id.
  const allCrops = useMemo<Crop[]>(() => {
    const seenIds = new Set(publishedCrops.map((crop) => crop.id));
    const seedCrops = MOCK_CROPS.filter((crop: Crop) => !seenIds.has(crop.id));
    return [...publishedCrops, ...seedCrops];
  }, [publishedCrops]);

  const activeFilterCount =
    filters.categories.length +
    (filters.verifiedOnly ? 1 : 0) +
    (filters.location.province ? 1 : 0) +
    (filters.priceRange.min > 0 || filters.priceRange.max < 2000 ? 1 : 0);

  const filteredCrops = useMemo(() => {
    return allCrops.filter((crop: Crop) => {
      // Search filter (crop name or farm name)
      const query = searchQuery.trim().toLowerCase();
      if (query) {
        const matchesSearch =
          crop.name.toLowerCase().includes(query) ||
          crop.farmName.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Category filter
      if (
        filters.categories.length > 0 &&
        !filters.categories.includes(crop.category)
      ) {
        return false;
      }

      // Location filter (cascading: city > district > province)
      if (filters.location.city && crop.city !== filters.location.city) {
        return false;
      }
      if (
        !filters.location.city &&
        filters.location.district &&
        crop.district !== filters.location.district
      ) {
        return false;
      }
      if (
        !filters.location.district &&
        filters.location.province &&
        crop.province !== filters.location.province
      ) {
        return false;
      }

      // SLSI Verified filter
      if (filters.verifiedOnly && !crop.isSLSIVerified) {
        return false;
      }

      // Price range filter
      if (
        crop.pricePerUnit < filters.priceRange.min ||
        crop.pricePerUnit > filters.priceRange.max
      ) {
        return false;
      }

      return true;
    });
  }, [allCrops, searchQuery, filters]);

  const handleApplyFilters = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
  }, []);

  const handleAddedToCart = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      {/* Brand Row — Screen 3.2 (HeaderBranding), sits above the sticky
          search/filter row rather than replacing it, so the search UX is
          untouched. */}
      <View style={styles.brandRow}>
        <HeaderBranding />
      </View>

      {/* Sticky Top Header */}
      <View style={styles.header}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#6B7280" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search fresh crops or farms..."
            placeholderTextColor="#6B7280"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setFilterModalVisible(true)}
        >
          <Ionicons name="options-outline" size={22} color="#111827" />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Scrolling Canvas */}
      <FlatList
        key={refreshKey}
        data={filteredCrops}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.gridContent}
        renderItem={({ item }) => (
          <ProductCard crop={item} onAddedToCart={handleAddedToCart} />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No crops match your search or filters.
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      <FilterModal
        visible={filterModalVisible}
        initialFilters={filters}
        onClose={() => setFilterModalVisible(false)}
        onApply={handleApplyFilters}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E2EB',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F4F5',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    padding: 0,
  },
  filterButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#15803D',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterBadgeText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  gridContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  emptyState: {
    marginTop: 64,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});