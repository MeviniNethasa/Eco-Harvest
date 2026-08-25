// src/screens/FarmerDetailScreen.tsx
//
// PART 2: Per-farm storefront. Reached by tapping a Farm Card on the
// Farmer-First MarketplaceScreen. Shows the farm's cover/bio header, then
// that farm's crops rendered with the existing ProductCard so shoppers can
// still adjust quantity and add to cart directly from here.

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { RouteProp, useFocusEffect, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { Crop, FarmerProfile, MarketplaceStackParamList } from '../types';
import {
  getFarmerById,
  getFarmerRating,
  getFarmerFreshnessScore,
  FarmerFreshnessScore,
  getProductsByFarmerId,
} from '../utils/storage';
import ProductCard from '../components/ProductCard';
import SLSIBadge from '../components/SLSIBadge';

type FarmerDetailRouteProp = RouteProp<
  MarketplaceStackParamList,
  'FarmerDetailScreen'
>;

const PLACEHOLDER_COVER =
  'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=800&q=60';

// FarmerProfile has no single pre-formatted `location` field — build one
// from its required city/district/province strings (same helper as
// MarketplaceScreen.tsx).
function formatFarmLocation(farm: FarmerProfile | null): string {
  if (!farm) return '';
  const parts = [farm.city, farm.district, farm.province].filter(
    (part) => !!part
  );
  return parts.join(', ');
}

export default function FarmerDetailScreen() {
  const route = useRoute<FarmerDetailRouteProp>();
  const { farmerId, farmName } = route.params;

  const [farm, setFarm] = useState<FarmerProfile | null>(null);
  const [products, setProducts] = useState<Crop[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [rating, setRating] = useState<{ average: number; count: number } | null>(null);
  const [freshness, setFreshness] = useState<FarmerFreshnessScore | null>(null);

  // getFarmerById reads AsyncStorage
  useEffect(() => {
    let isActive = true;
    getFarmerById(farmerId).then((result) => {
      if (isActive) setFarm(result);
    });
    return () => {
      isActive = false;
    };
  }, [farmerId]);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const farmCrops = await getProductsByFarmerId(farmerId);
      setProducts(farmCrops);
    } finally {
      setLoadingProducts(false);
    }
  }, [farmerId]);

  const loadRatingAndFreshness = useCallback(async () => {
    const [farmRating, farmFreshness] = await Promise.all([
      getFarmerRating(farmerId),
      getFarmerFreshnessScore(farmerId),
    ]);
    setRating(farmRating);
    setFreshness(farmFreshness);
  }, [farmerId]);

  useFocusEffect(
    useCallback(() => {
      loadProducts();
      loadRatingAndFreshness();
    }, [loadProducts, loadRatingAndFreshness])
  );

  const handleAddedToCart = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const coverUri = farm?.farmCoverPhotoUrl || PLACEHOLDER_COVER;

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        key={refreshKey}
        data={products}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.gridContent}
        renderItem={({ item }) => (
          <ProductCard crop={item} onAddedToCart={handleAddedToCart} />
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.coverWrap}>
              <Image source={{ uri: coverUri }} style={styles.coverImage} />
              {farm?.isSLSIVerified && <SLSIBadge style={styles.slsiBadge} />}
            </View>

            <View style={styles.headerBody}>
              <View style={styles.farmNameRow}>
                <Text style={styles.farmName}>{farm?.farmName || farmName}</Text>

                <View style={styles.badgesCluster}>
                  {rating && (
                    <View style={styles.ratingBadge}>
                      <Ionicons
                        name="star"
                        size={13}
                        color={rating.count > 0 ? '#D97706' : '#9CA3AF'}
                      />
                      <Text style={styles.ratingBadgeText}>
                        {rating.count > 0
                          ? `${rating.average.toFixed(1)} (${rating.count})`
                          : 'New'}
                      </Text>
                    </View>
                  )}

                  {freshness && (
                    <View style={styles.freshnessBadge}>
                      <Ionicons name="leaf" size={13} color="#15803D" />
                      <Text style={styles.freshnessBadgeText}>
                        {freshness.average}% Fresh
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {freshness && (
                <View style={styles.freshnessSummaryRow}>
                  <View style={styles.freshnessPill}>
                    <Text style={styles.freshnessPillLabel}>
                      VGG16 AI Quality Score:
                    </Text>
                    <Text style={styles.freshnessPillValue}>
                      {freshness.average}% ({freshness.grade})
                    </Text>
                  </View>
                  <Text style={styles.freshnessGlobalComparison}>
                    Platform Avg: {freshness.globalAverage}%
                  </Text>
                </View>
              )}

              {formatFarmLocation(farm) ? (
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={14} color="#6B7280" />
                  <Text style={styles.locationText}>{formatFarmLocation(farm)}</Text>
                </View>
              ) : null}

              {farm?.description ? (
                <Text style={styles.bioText}>{farm.description}</Text>
              ) : null}
            </View>

            <Text style={styles.sectionTitle}>Available Crops</Text>
          </View>
        }
        ListEmptyComponent={
          loadingProducts ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color="#15803D" />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                No active crops listed for this farm yet.
              </Text>
            </View>
          )
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
  header: {
    marginBottom: 8,
  },
  coverWrap: {
    position: 'relative',
    width: '100%',
    height: 180,
    backgroundColor: '#E5E7EB',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  // Pins the badge to the cover image's top-right corner instead of its
  // default in-flow position, so it never overlaps headerBody content.
  slsiBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  headerBody: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  farmNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  farmName: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  badgesCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  ratingBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
  },
  freshnessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  freshnessBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  freshnessSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  freshnessPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  freshnessPillLabel: {
    fontSize: 12,
    color: '#166534',
    fontWeight: '500',
  },
  freshnessPillValue: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: '700',
  },
  freshnessGlobalComparison: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  locationText: {
    fontSize: 13,
    color: '#6B7280',
  },
  bioText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
  },
  gridContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  emptyState: {
    marginTop: 48,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});