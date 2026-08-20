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
import StandardHeader from '../components/StandardHeader';

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
        <ActivityIndicator color="#15803D" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StandardHeader
        title="My Products"
        subtitle="Manage your active marketplace listings"
        rightElement={
          <Pressable
            style={styles.addButton}
            onPress={() => navigation.navigate('AddProduct')}
            accessibilityRole="button"
            accessibilityLabel="Add New Product"
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.addButtonText}>Add Product</Text>
          </Pressable>
        }
      />

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
            <View style={styles.emptyIconCircle}>
              <Ionicons name="leaf-outline" size={36} color="#15803D" />
            </View>
            <Text style={styles.emptyTitle}>No products yet</Text>
            <Text style={styles.emptySubtitle}>
              Publish your first crop to see it here and live on the marketplace.
            </Text>
            <Pressable
              style={[styles.addButton, { marginTop: 14 }]}
              onPress={() => navigation.navigate('AddProduct')}
            >
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Publish Crop</Text>
            </Pressable>
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
              {item.availableQtyKg !== undefined && (
                <Text style={styles.stockText}>Stock: {item.availableQtyKg} kg</Text>
              )}
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#15803D',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  addButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  listContent: { padding: 16, paddingBottom: 32, gap: 12 },
  emptyListContent: { flexGrow: 1 },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  emptySubtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', maxWidth: 280, lineHeight: 18 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  thumbnail: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#F4F4F5' },
  productName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  productMeta: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  stockText: { fontSize: 12, color: '#15803D', fontWeight: '500', marginTop: 2 },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#F0FDF4',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 6,
  },
  verifiedPillText: { fontSize: 11, color: '#15803D', fontWeight: '600' },
});