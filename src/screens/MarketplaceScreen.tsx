// src/screens/MarketplaceScreen.tsx
//
// PART 2 REFACTOR: "Product-First" -> "Farmer-First" landing view.
// Renders a directory of Farms (FarmerProfile records) with advanced reverse product
// search, active query filter panels (Category, Max Price, District), SLSI verification
// badges, and heart bookmark buttons.

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Image,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Pressable,
  ScrollView,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Crop, CropCategory, FarmerProfile, MarketplaceStackParamList } from '../types';
import {
  getCrops,
  getFarmers,
  getFavoriteFarmerIds,
  toggleFavoriteFarmer,
  subscribeToFarmers,
  subscribeToCrops,
  sanitizeImageUrl,
} from '../utils/storage';
import { MOCK_CROPS } from '../data/mockData';
import { productApi } from '../services/api';
import SLSIBadge from '../components/SLSIBadge';
import HeaderBranding from '../components/HeaderBranding';

type MarketplaceNavProp = NativeStackNavigationProp<
  MarketplaceStackParamList,
  'MarketplaceHome'
>;

type FilterTab = 'ALL' | 'FAVORITES' | 'VERIFIED';

const PLACEHOLDER_COVER =
  'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=800';

const CATEGORIES: (CropCategory | 'ALL')[] = [
  'ALL',
  'Vegetables',
  'Fruits',
  'Grains',
  'Spices',
];

const DISTRICTS = [
  'All Districts',
  'Colombo',
  'Kandy',
  'Nuwara Eliya',
  'Badulla',
  'Matale',
  'Galle',
  'Kurunegala',
  'Gampaha',
  'Anuradhapura',
  'Jaffna',
  'Kalutara',
];

const PRICE_PRESETS = [
  { label: 'Any Price', max: null },
  { label: '≤ LKR 200', max: 200 },
  { label: '≤ LKR 350', max: 350 },
  { label: '≤ LKR 500', max: 500 },
  { label: '≤ LKR 800', max: 800 },
];

function formatFarmLocation(farm: FarmerProfile): string {
  const parts = [farm.city, farm.district, farm.province].filter((part) => !!part);
  return parts.length > 0 ? parts.join(', ') : 'Location unavailable';
}

interface FarmCardProps {
  farm: FarmerProfile;
  isFavorite: boolean;
  farmCrops: Crop[];
  searchQuery: string;
  onPress: () => void;
  onToggleFavorite: () => void;
}

function FarmCard({
  farm,
  isFavorite,
  farmCrops,
  searchQuery,
  onPress,
  onToggleFavorite,
}: FarmCardProps) {
  const coverUri = sanitizeImageUrl(farm.farmCoverPhotoUrl);

  // Identify if any product matched the search query
  const query = searchQuery.trim().toLowerCase();
  const matchedCrop = useMemo(() => {
    if (!query) return null;
    return farmCrops.find((c) => c.name.toLowerCase().includes(query));
  }, [farmCrops, query]);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.coverWrap}>
        <Image source={{ uri: coverUri }} style={styles.coverImage} />

        {/* Top-Left Favorite Bookmark Heart Button */}
        <Pressable
          style={styles.heartButton}
          onPress={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={18}
            color={isFavorite ? '#DC2626' : '#FFFFFF'}
          />
        </Pressable>

        {/* Top-Right SLSI Verification Badge */}
        {farm.isSLSIVerified && <SLSIBadge style={styles.slsiBadge} />}
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.farmName} numberOfLines={2}>
          {farm.farmName}
        </Text>

        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={13} color="#6B7280" />
          <Text style={styles.locationText} numberOfLines={1}>
            {formatFarmLocation(farm)}
          </Text>
        </View>

        {/* Reverse Product Search Match Highlight */}
        {matchedCrop ? (
          <View style={styles.productMatchBadge}>
            <Ionicons name="sparkles" size={11} color="#15803D" />
            <Text style={styles.productMatchText} numberOfLines={1}>
              Lists: {matchedCrop.name} (LKR {matchedCrop.pricePerUnit}/{matchedCrop.unit || '1kg'})
            </Text>
          </View>
        ) : farmCrops.length > 0 ? (
          <View style={styles.cropsCountBadge}>
            <Ionicons name="leaf-outline" size={11} color="#4B5563" />
            <Text style={styles.cropsCountText} numberOfLines={1}>
              {farmCrops.length} crop{farmCrops.length === 1 ? '' : 's'} available
            </Text>
          </View>
        ) : null}

        {farm.description ? (
          <Text style={styles.bioText} numberOfLines={2}>
            {farm.description}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default function MarketplaceScreen() {
  const navigation = useNavigation<MarketplaceNavProp>();
  const [searchQuery, setSearchQuery] = useState('');
  const [farms, setFarms] = useState<FarmerProfile[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('ALL');

  // Search Filter Panel State
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CropCategory | 'ALL'>('ALL');
  const [selectedDistrict, setSelectedDistrict] = useState('All Districts');
  const [maxPrice, setMaxPrice] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [fetchedFarms, favs, storedCrops] = await Promise.all([
        getFarmers(),
        getFavoriteFarmerIds(),
        getCrops(),
      ]);

      setFarms(fetchedFarms);
      setFavoriteIds(favs);

      // Merge backend crops with local crops
      let allCrops = [...storedCrops, ...MOCK_CROPS];
      try {
        const res = await productApi.getAll();
        if (res && res.success && Array.isArray(res.data)) {
          const backendCrops: Crop[] = res.data.map((bp: any) => ({
            id: bp._id?.toString() || bp.id,
            farmerId: bp.farmerId,
            name: bp.title || bp.name || 'Produce',
            category: bp.category || 'Vegetables',
            pricePerUnit: bp.pricePerKg || bp.pricePerUnit || 100,
            unit: bp.unit || '1kg',
            availableQtyKg: bp.availableQuantity || bp.availableQtyKg || 100,
            imageUrl: bp.imageUrl || '',
            isSLSIVerified: bp.isSLSIVerified ?? false,
            farmName: bp.farmName || '',
            province: bp.province || '',
            district: bp.district || '',
            city: bp.city || '',
            isActive: bp.isActive !== false,
          }));
          allCrops = [...backendCrops, ...allCrops];
        }
      } catch (_) {}

      // Deduplicate crops
      const seen = new Set<string>();
      const dedupedCrops: Crop[] = [];
      for (const c of allCrops) {
        if (!c || !c.name) continue;
        const key = `${c.id || ''}_${c.name.toLowerCase()}_${c.farmName || ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          dedupedCrops.push(c);
        }
      }
      setCrops(dedupedCrops);
    } catch (err) {
      console.error('Failed to load marketplace data:', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    const unsubFarmers = subscribeToFarmers(() => {
      loadData();
    });
    const unsubCrops = subscribeToCrops(() => {
      loadData();
    });
    return () => {
      unsubFarmers();
      unsubCrops();
    };
  }, [loadData]);

  const handleToggleFavorite = useCallback(async (farmerId: string) => {
    const updated = await toggleFavoriteFarmer(farmerId);
    setFavoriteIds(updated);
  }, []);

  // Map products accurately to each farm (deduplicated by crop name)
  const farmCropsMap = useMemo(() => {
    const map = new Map<string, Crop[]>();

    farms.forEach((farm) => {
      const fId = farm.id?.toString().trim();
      const fName = (farm.farmName || '').trim().toLowerCase();

      const seenCropNames = new Set<string>();
      const farmCrops: Crop[] = [];

      crops.forEach((c) => {
        if (c.isActive === false) return;
        const cFarmerId = c.farmerId?.toString().trim();
        const cFarmName = (c.farmName || '').trim().toLowerCase();

        const isMatch =
          (cFarmerId && fId && cFarmerId === fId) ||
          (fName && cFarmName && (
            cFarmName === fName ||
            cFarmName.includes(fName) ||
            fName.includes(cFarmName)
          ));

        if (isMatch) {
          const cropKey = c.name.trim().toLowerCase();
          if (!seenCropNames.has(cropKey)) {
            seenCropNames.add(cropKey);
            farmCrops.push(c);
          }
        }
      });

      map.set(farm.id, farmCrops);
    });

    return map;
  }, [farms, crops]);

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedCategory !== 'ALL') count++;
    if (selectedDistrict !== 'All Districts') count++;
    if (maxPrice !== null) count++;
    return count;
  }, [selectedCategory, selectedDistrict, maxPrice]);

  const handleClearFilters = () => {
    setSelectedCategory('ALL');
    setSelectedDistrict('All Districts');
    setMaxPrice(null);
  };

  // Filtered and searched farms (Reverse Product Search & Multi-criteria Filtering)
  const filteredFarms = useMemo(() => {
    let list = farms;

    // 1. Tab Filters
    if (activeFilter === 'FAVORITES') {
      list = list.filter((farm) => favoriteIds.includes(farm.id));
    } else if (activeFilter === 'VERIFIED') {
      list = list.filter((farm) => farm.isSLSIVerified);
    }

    // 2. Region / District Filter
    if (selectedDistrict !== 'All Districts') {
      const targetDist = selectedDistrict.toLowerCase().trim();
      list = list.filter((farm) => {
        const farmDist = (farm.district || '').toLowerCase().trim();
        const farmLoc = formatFarmLocation(farm).toLowerCase().trim();
        return farmDist.includes(targetDist) || farmLoc.includes(targetDist);
      });
    }

    // 3. Category Filter (Farm must hold at least 1 product in this category)
    if (selectedCategory !== 'ALL') {
      list = list.filter((farm) => {
        const farmCrops = farmCropsMap.get(farm.id) || [];
        return farmCrops.some(
          (c) => (c.category || '').toLowerCase() === selectedCategory.toLowerCase()
        );
      });
    }

    // 4. Maximum Price Filter (Farm must hold at least 1 product <= maxPrice)
    if (maxPrice !== null) {
      list = list.filter((farm) => {
        const farmCrops = farmCropsMap.get(farm.id) || [];
        return farmCrops.some((c) => c.pricePerUnit <= maxPrice);
      });
    }

    // 5. Search Query (Searches Farm Name, Location, AND Product Catalog)
    const query = searchQuery.trim().toLowerCase();
    if (!query) return list;

    return list.filter((farm) => {
      const nameMatch = farm.farmName.toLowerCase().includes(query);
      const locationMatch = formatFarmLocation(farm).toLowerCase().includes(query);
      const farmCrops = farmCropsMap.get(farm.id) || [];
      const productMatch = farmCrops.some(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          (c.category && c.category.toLowerCase().includes(query))
      );

      return nameMatch || locationMatch || productMatch;
    });
  }, [
    farms,
    favoriteIds,
    activeFilter,
    selectedDistrict,
    selectedCategory,
    maxPrice,
    searchQuery,
    farmCropsMap,
  ]);

  const handlePressFarm = useCallback(
    (farm: FarmerProfile) => {
      navigation.navigate('FarmerDetailScreen', {
        farmerId: farm.id,
        farmName: farm.farmName,
      });
    },
    [navigation]
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.brandRow}>
        <HeaderBranding />
      </View>

      {/* Search Bar & Filter Toggle Button */}
      <View style={styles.header}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#6B7280" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search products (e.g. Carrots) or farms..."
            placeholderTextColor="#6B7280"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {!!searchQuery && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8} style={{ marginRight: 4 }}>
              <Ionicons name="close-circle" size={16} color="#9CA3AF" />
            </Pressable>
          )}
        </View>

        <Pressable
          style={[
            styles.filterToggleBtn,
            (showFilterPanel || activeFiltersCount > 0) && styles.filterToggleBtnActive,
          ]}
          onPress={() => setShowFilterPanel((prev) => !prev)}
          accessibilityRole="button"
          accessibilityLabel="Toggle Search Filters"
        >
          <Ionicons
            name="options-outline"
            size={18}
            color={showFilterPanel || activeFiltersCount > 0 ? '#FFFFFF' : '#15803D'}
          />
          {activeFiltersCount > 0 && (
            <View style={styles.filterBadgeCount}>
              <Text style={styles.filterBadgeCountText}>{activeFiltersCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Expandable Search Filter Panels */}
      {showFilterPanel && (
        <View style={styles.filterPanelContainer}>
          {/* Header Row */}
          <View style={styles.filterPanelHeader}>
            <Text style={styles.filterPanelTitle}>Search Filters</Text>
            {activeFiltersCount > 0 && (
              <Pressable onPress={handleClearFilters}>
                <Text style={styles.clearFiltersText}>Reset All</Text>
              </Pressable>
            )}
          </View>

          {/* 1. Category Selector */}
          <View style={styles.filterGroup}>
            <Text style={styles.filterGroupLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
              {CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  style={[styles.smallChip, selectedCategory === cat && styles.smallChipActive]}
                  onPress={() => setSelectedCategory(cat)}
                >
                  <Text style={[styles.smallChipText, selectedCategory === cat && styles.smallChipTextActive]}>
                    {cat === 'ALL' ? 'All Categories' : cat}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* 2. Region / District Selector */}
          <View style={styles.filterGroup}>
            <Text style={styles.filterGroupLabel}>Region / District</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
              {DISTRICTS.map((dist) => (
                <Pressable
                  key={dist}
                  style={[styles.smallChip, selectedDistrict === dist && styles.smallChipActive]}
                  onPress={() => setSelectedDistrict(dist)}
                >
                  <Text style={[styles.smallChipText, selectedDistrict === dist && styles.smallChipTextActive]}>
                    {dist}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* 3. Max Price Selector */}
          <View style={styles.filterGroup}>
            <Text style={styles.filterGroupLabel}>Max Unit Price (LKR)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
              {PRICE_PRESETS.map((preset) => (
                <Pressable
                  key={preset.label}
                  style={[styles.smallChip, maxPrice === preset.max && styles.smallChipActive]}
                  onPress={() => setMaxPrice(preset.max)}
                >
                  <Text style={[styles.smallChipText, maxPrice === preset.max && styles.smallChipTextActive]}>
                    {preset.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Filter Chips Bar (All / Favorites / SLSI Verified) */}
      <View style={styles.filterBar}>
        <Pressable
          style={[styles.filterChip, activeFilter === 'ALL' && styles.filterChipActive]}
          onPress={() => setActiveFilter('ALL')}
        >
          <Text style={[styles.filterChipText, activeFilter === 'ALL' && styles.filterChipTextActive]}>
            All Farms ({farms.length})
          </Text>
        </Pressable>

        <Pressable
          style={[styles.filterChip, activeFilter === 'FAVORITES' && styles.filterChipActive]}
          onPress={() => setActiveFilter('FAVORITES')}
        >
          <Ionicons
            name={activeFilter === 'FAVORITES' ? 'heart' : 'heart-outline'}
            size={14}
            color={activeFilter === 'FAVORITES' ? '#FFFFFF' : '#DC2626'}
            style={{ marginRight: 4 }}
          />
          <Text
            style={[
              styles.filterChipText,
              activeFilter === 'FAVORITES' && styles.filterChipTextActive,
            ]}
          >
            Favorites {favoriteIds.length > 0 ? `(${favoriteIds.length})` : ''}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.filterChip, activeFilter === 'VERIFIED' && styles.filterChipActive]}
          onPress={() => setActiveFilter('VERIFIED')}
        >
          <Ionicons
            name="shield-checkmark"
            size={14}
            color={activeFilter === 'VERIFIED' ? '#FFFFFF' : '#15803D'}
            style={{ marginRight: 4 }}
          />
          <Text
            style={[
              styles.filterChipText,
              activeFilter === 'VERIFIED' && styles.filterChipTextActive,
            ]}
          >
            SLSI Verified
          </Text>
        </Pressable>
      </View>

      {/* Farm Directory Grid */}
      <FlatList
        data={filteredFarms}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.gridContent}
        renderItem={({ item }) => (
          <FarmCard
            farm={item}
            isFavorite={favoriteIds.includes(item.id)}
            farmCrops={farmCropsMap.get(item.id) || []}
            searchQuery={searchQuery}
            onPress={() => handlePressFarm(item)}
            onToggleFavorite={() => handleToggleFavorite(item.id)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Ionicons
                name={
                  activeFilter === 'FAVORITES'
                    ? 'heart-outline'
                    : 'leaf-outline'
                }
                size={36}
                color="#9CA3AF"
              />
            </View>
            <Text style={styles.emptyStateTitle}>
              {activeFilter === 'FAVORITES'
                ? 'No favorite farms saved'
                : 'No farms match your search'}
            </Text>
            <Text style={styles.emptyStateText}>
              {activeFilter === 'FAVORITES'
                ? 'Tap the heart icon on any farm card to bookmark your favorite local growers.'
                : 'Try adjusting your product name, category, or maximum price filter.'}
            </Text>
            {activeFiltersCount > 0 && (
              <Pressable style={styles.resetFiltersButton} onPress={handleClearFilters}>
                <Text style={styles.resetFiltersButtonText}>Reset Filters</Text>
              </Pressable>
            )}
          </View>
        }
        showsVerticalScrollIndicator={false}
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
    borderBottomColor: '#E5E7EB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#FAFAFA',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F4F5',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#111827',
    padding: 0,
  },
  filterToggleBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  filterToggleBtnActive: {
    backgroundColor: '#15803D',
    borderColor: '#15803D',
  },
  filterBadgeCount: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#DC2626',
    borderRadius: 9,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeCountText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },

  // Expandable Filter Panels
  filterPanelContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  filterPanelTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  clearFiltersText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
  filterGroup: {
    gap: 4,
  },
  filterGroupLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chipsScroll: {
    gap: 6,
    paddingVertical: 2,
  },
  smallChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  smallChipActive: {
    backgroundColor: '#15803D',
    borderColor: '#15803D',
  },
  smallChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
  },
  smallChipTextActive: {
    color: '#FFFFFF',
  },

  // Filter Bar
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterChipActive: {
    backgroundColor: '#15803D',
    borderColor: '#15803D',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  gridContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 32,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  coverWrap: {
    position: 'relative',
    width: '100%',
    height: 110,
    backgroundColor: '#E5E7EB',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  heartButton: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  slsiBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  cardBody: {
    padding: 10,
    gap: 2,
  },
  farmName: {
    width: '100%',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
    color: '#111827',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 3,
  },
  locationText: {
    fontSize: 11,
    color: '#6B7280',
    flexShrink: 1,
  },
  productMatchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  productMatchText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },
  cropsCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  cropsCountText: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '500',
  },
  bioText: {
    fontSize: 11,
    color: '#4B5563',
    marginTop: 4,
    lineHeight: 15,
  },
  emptyState: {
    marginTop: 48,
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  emptyStateText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  resetFiltersButton: {
    marginTop: 10,
    backgroundColor: '#15803D',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  resetFiltersButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});