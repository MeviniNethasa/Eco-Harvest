// src/screens/MarketplaceScreen.tsx
//
// PART 2 REFACTOR: "Product-First" -> "Farmer-First" landing view.
// Renders a directory of Farms (FarmerProfile records) with search,
// SLSI verification badges, Heart bookmark buttons for favorite farms,
// and a "Favorites" filter chip.

import React, { useState, useCallback, useMemo } from 'react';
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
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { FarmerProfile, MarketplaceStackParamList } from '../types';
import { getFarmers, getFavoriteFarmerIds, toggleFavoriteFarmer, subscribeToFarmers } from '../utils/storage';
import SLSIBadge from '../components/SLSIBadge';
import HeaderBranding from '../components/HeaderBranding';

type MarketplaceNavProp = NativeStackNavigationProp<
  MarketplaceStackParamList,
  'MarketplaceHome'
>;

type FilterTab = 'ALL' | 'FAVORITES' | 'VERIFIED';

const PLACEHOLDER_COVER =
  'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=400&q=60';

function formatFarmLocation(farm: FarmerProfile): string {
  const parts = [farm.city, farm.district, farm.province].filter(
    (part) => !!part
  );
  return parts.length > 0 ? parts.join(', ') : 'Location unavailable';
}

interface FarmCardProps {
  farm: FarmerProfile;
  isFavorite: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
}

function FarmCard({ farm, isFavorite, onPress, onToggleFavorite }: FarmCardProps) {
  const coverUri = farm.farmCoverPhotoUrl || PLACEHOLDER_COVER;

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
        <Text style={styles.farmName} numberOfLines={1}>
          {farm.farmName}
        </Text>

        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={13} color="#6B7280" />
          <Text style={styles.locationText} numberOfLines={1}>
            {formatFarmLocation(farm)}
          </Text>
        </View>

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
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('ALL');

  const loadData = useCallback(async () => {
    try {
      const [fetchedFarms, favs] = await Promise.all([
        getFarmers(),
        getFavoriteFarmerIds(),
      ]);
      setFarms(fetchedFarms);
      setFavoriteIds(favs);
    } catch (err) {
      console.error('Failed to load marketplace data:', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  React.useEffect(() => {
    const unsubscribe = subscribeToFarmers(() => {
      loadData();
    });
    return unsubscribe;
  }, [loadData]);

  const handleToggleFavorite = useCallback(
    async (farmerId: string) => {
      const updated = await toggleFavoriteFarmer(farmerId);
      setFavoriteIds(updated);
    },
    []
  );

  const filteredFarms = useMemo(() => {
    let list = farms;

    if (activeFilter === 'FAVORITES') {
      list = list.filter((farm) => favoriteIds.includes(farm.id));
    } else if (activeFilter === 'VERIFIED') {
      list = list.filter((farm) => farm.isSLSIVerified);
    }

    const query = searchQuery.trim().toLowerCase();
    if (!query) return list;

    return list.filter((farm) => {
      const nameMatch = farm.farmName.toLowerCase().includes(query);
      const locationMatch = formatFarmLocation(farm).toLowerCase().includes(query);
      return nameMatch || locationMatch;
    });
  }, [farms, favoriteIds, activeFilter, searchQuery]);

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

      {/* Search Header */}
      <View style={styles.header}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#6B7280" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search farms or locations..."
            placeholderTextColor="#6B7280"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {!!searchQuery && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color="#9CA3AF" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Filter Chips Bar */}
      <View style={styles.filterBar}>
        <Pressable
          style={[styles.filterChip, activeFilter === 'ALL' && styles.filterChipActive]}
          onPress={() => setActiveFilter('ALL')}
        >
          <Text style={[styles.filterChipText, activeFilter === 'ALL' && styles.filterChipTextActive]}>
            All Farms
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
                : 'Try adjusting your search terms or filter selection.'}
            </Text>
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
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
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
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 38,
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
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
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
    paddingBottom: 24,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  coverWrap: {
    position: 'relative',
    width: '100%',
    height: 105,
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
  },
  farmName: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    color: '#111827',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 3,
  },
  locationText: {
    fontSize: 12,
    color: '#6B7280',
    flexShrink: 1,
  },
  bioText: {
    fontSize: 12,
    color: '#4B5563',
    marginTop: 6,
    lineHeight: 16,
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
});