// src/screens/MyProductsScreen.tsx
//
// Farmer Mode tab 1 ("My Products"): the current farm's own published crop
// listings, pulled via `getProductsByFarmerId` (storage.ts) and kept live
// with `subscribeToCrops`, same pattern MarketplaceScreen uses for the
// public catalog. Tapping "+ Add Product" jumps to the sibling "Add
// Product" tab instead of pushing a stack screen, since Add Product is a
// first-class tab of its own in the Farmer Mode bar (see TabNavigator.tsx).

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Crop, FarmerTabParamList } from '../types';
import { getFarmerProfile, getProductsByFarmerId, subscribeToCrops } from '../utils/storage';

type NavProp = BottomTabNavigationProp<FarmerTabParamList, 'MyProducts'>;

export default function MyProductsScreen() {
  const navigation = useNavigation<NavProp>();
  const [farmerId, setFarmerId] = useState<string | null>(null);
  const [products, setProducts] = useState<Crop[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const profile = await getFarmerProfile();
    setFarmerId(profile?.id ?? null);
    if (profile?.id) {
      setProducts(await getProductsByFarmerId(profile.id));
    } else {
      setProducts([]);
    }
    setLoading(false);
  }, []);

  // Catch up whenever the tab regains focus (e.g. right after publishing on
  // the Add Product tab).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Stay live while mounted too, e.g. if a product is edited/removed from
  // elsewhere while this tab is already focused.
  useEffect(() => {
    const unsubscribe = subscribeToCrops(() => {
      if (farmerId) {
        getProductsByFarmerId(farmerId).then(setProducts);
      }
    });
    return unsubscribe;
  }, [farmerId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#15803D" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Products</Text>
        <Pressable
          style={styles.addButton}
          onPress={() => navigation.navigate('AddProduct')}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Add Product</Text>
        </Pressable>
      </View>

      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          products.length === 0 ? styles.emptyListContent : styles.listContent
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#15803D" />
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Ionicons name="leaf-outline" size={40} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No products yet</Text>
            <Text style={styles.emptySubtitle}>
              Publish your first crop to see it here and on the marketplace.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Image source={{ uri: item.imageUrl }} style={styles.thumbnail} />
            <View style={{ flex: 1 }}>
              <Text style={styles.productName}>{item.name}</Text>
              <Text style={styles.productMeta}>
                {item.category} • LKR {item.pricePerUnit.toLocaleString()} / {item.unit}
              </Text>
              {item.isSLSIVerified && (
                <View style={styles.verifiedPill}>
                  <Ionicons name="shield-checkmark" size={12} color="#15803D" />
                  <Text style={styles.verifiedPillText}>SLSI Verified</Text>
                </View>
              )}
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#15803D',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  emptyListContent: { flexGrow: 1 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#374151' },
  emptySubtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', maxWidth: 260 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
  },
  thumbnail: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#F4F4F5' },
  productName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  productMeta: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#F0FDF4',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 6,
  },
  verifiedPillText: { fontSize: 11, color: '#15803D', fontWeight: '600' },
});