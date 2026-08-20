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
import { getFarmerById, getFarmerRating, getProductsByFarmerId } from '../utils/storage';
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
  // Average star rating + review count for this farm (the "★ 4.5 (2)"
  // badge in the header). null while it hasn't loaded yet — distinct from
  // { average: 0, count: 0 }, which means "loaded, but no reviews yet".
  const [rating, setRating] = useState<{ average: number; count: number } | null>(null);

  // getFarmerById reads AsyncStorage (it checks the on-device farmer
  // profile before falling back to MOCK_FARMERS) so it's async.
  useEffect(() => {
    let isActive = true;
    getFarmerById(farmerId).then((result) => {
      if (isActive) setFarm(result);
    });
    return () => {
      isActive = false;
    };
  }, [farmerId]);

  // getProductsByFarmerId is async (filters the shared crop catalog down to
  // this farm), so it's loaded separately with its own loading state.
  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const farmCrops = await getProductsByFarmerId(farmerId);
      setProducts(farmCrops);
    } finally {
      setLoadingProducts(false);
    }
  }, [farmerId]);

  // Same reasoning as loadProducts below re: why this is a separate
  // useFocusEffect-driven load rather than a mount-only useEffect — a
  // review submitted from the Orders tab's ReviewModal after a delivery
  // should update this farm's average rating the moment the shopper
  // navigates back here, not only after a full app remount.
  const loadRating = useCallback(async () => {
    const farmRating = await getFarmerRating(farmerId);
    setRating(farmRating);
  }, [farmerId]);

  // useFocusEffect (rather than a plain mount-only useEffect) so crops
  // re-query AsyncStorage every time this screen comes back into focus —
  // e.g. after navigating away to add/publish a crop for this farm and
  // returning. A one-shot useEffect only fired on first mount, so a crop
  // added after that point never appeared here until the app remounted the
  // screen from scratch.
  useFocusEffect(
    useCallback(() => {
      loadProducts();
      loadRating();
    }, [loadProducts, loadRating])
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
            {/* position: 'relative' required so SLSIBadge (position:
                absolute internally) anchors within the cover image. */}
            <View style={styles.coverWrap}>
              <Image source={{ uri: coverUri }} style={styles.coverImage} />
              {/* SLSIBadge has no isVerified prop by design (see
                  SLSIBadge.tsx) — mount it only when the farm is verified.
                  Pinned to the top-right corner of the cover image so it
                  never sits on top of farmName/description in headerBody
                  below. */}
              {farm?.isSLSIVerified && <SLSIBadge style={styles.slsiBadge} />}
            </View>

            <View style={styles.headerBody}>
              <View style={styles.farmNameRow}>
                <Text style={styles.farmName}>{farm?.farmName || farmName}</Text>

                {/* rating === null means "hasn't loaded yet" — render
                    nothing rather than flash a "New" badge that then
                    jumps to a real average once getFarmerRating resolves. */}
                {rating && (
                  <View style={styles.ratingBadge}>
                    <Ionicons
                      name="star"
                      size={14}
                      color={rating.count > 0 ? '#D97706' : '#9CA3AF'}
                    />
                    <Text style={styles.ratingBadgeText}>
                      {rating.count > 0
                        ? `${rating.average.toFixed(1)} (${rating.count})`
                        : 'New'}
                    </Text>
                  </View>
                )}
              </View>

              {formatFarmLocation(farm) ? (
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={14} color="#6B7280" />
                  <Text style={styles.locationText}>{formatFarmLocation(farm)}</Text>
                </View>
              ) : null}

              {/* FarmerProfile's "About this farm" field is `description`,
                  not `bio` — see src/types/index.ts. */}
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
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ratingBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
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