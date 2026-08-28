// src/screens/MyProductsScreen.tsx
//
// Farmer Mode tab 1 ("My Products"): the current farm's own published crop
// listings, pulled via `getProductsByFarmerId` (storage.ts) and kept live
// with `subscribeToCrops`, same pattern MarketplaceScreen uses for the
// public catalog.

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Crop, FarmerTabParamList } from '../types';
import { getFarmerProfile, getProductsByFarmerId, subscribeToCrops, updateCrop } from '../utils/storage';
import { productApi } from '../services/api';
import StandardHeader from '../components/StandardHeader';

type NavProp = BottomTabNavigationProp<FarmerTabParamList, 'MyProducts'>;

export default function MyProductsScreen() {
  const navigation = useNavigation<NavProp>();
  const [farmerId, setFarmerId] = useState<string | null>(null);
  const [products, setProducts] = useState<Crop[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Edit Product Modal State
  const [editingProduct, setEditingProduct] = useState<Crop | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editThreshold, setEditThreshold] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

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

  // Catch up whenever the tab regains focus
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Stay live while mounted
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

  const openEditModal = (crop: Crop) => {
    setEditingProduct(crop);
    setEditPrice(crop.pricePerUnit.toString());
    setEditQty(crop.availableQtyKg !== undefined ? crop.availableQtyKg.toString() : '');
    setEditThreshold(crop.lowStockThreshold !== undefined ? crop.lowStockThreshold.toString() : '');
    setEditIsActive(crop.isActive !== false);
  };

  const handleSaveEdit = async () => {
    if (!editingProduct) return;
    const priceNum = Number(editPrice);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      Alert.alert('Invalid Price', 'Please enter a valid positive numerical price.');
      return;
    }
    const qtyNum = editQty.trim() ? Number(editQty) : undefined;
    const thresholdNum = editThreshold.trim() ? Number(editThreshold) : undefined;

    setIsSavingEdit(true);
    try {
      const patch: Partial<Crop> = {
        pricePerUnit: priceNum,
        availableQtyKg: qtyNum,
        lowStockThreshold: thresholdNum,
        isActive: editIsActive,
      };

      // 1. Update local storage
      await updateCrop(editingProduct.id, patch);

      // 2. Sync to Node.js backend
      productApi
        .update(editingProduct.id, {
          pricePerUnit: priceNum,
          pricePerKg: priceNum,
          availableQtyKg: qtyNum,
          availableQuantity: qtyNum,
          lowStockThreshold: thresholdNum,
          isActive: editIsActive,
        })
        .catch((err: any) => console.log('Product update backend sync notice:', err?.message));

      // 3. Update local list view
      setProducts((prev) =>
        prev.map((p) => (p.id === editingProduct.id ? { ...p, ...patch } : p))
      );

      setEditingProduct(null);
      Alert.alert('Product Updated', `${editingProduct.name} has been updated successfully.`);
    } catch (err: any) {
      console.error('Failed to update product:', err);
      Alert.alert('Update Failed', err?.message || 'Could not update product details.');
    } finally {
      setIsSavingEdit(false);
    }
  };

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
        showNotificationBell
        rightElement={
          products.length > 0 ? (
            <Pressable
              style={styles.addButton}
              onPress={() => navigation.navigate('AddProduct' as any)}
              accessibilityRole="button"
              accessibilityLabel="Add product"
            >
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Add product</Text>
            </Pressable>
          ) : undefined
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
              Add your first product to see it here and live on the marketplace.
            </Text>
            <Pressable
              style={[styles.addButton, { marginTop: 14 }]}
              onPress={() => navigation.navigate('AddProduct' as any)}
              accessibilityRole="button"
              accessibilityLabel="Add product"
            >
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Add product</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => {
          const isListingActive = item.isActive !== false;
          const isLowStock =
            item.lowStockThreshold !== undefined &&
            item.availableQtyKg !== undefined &&
            item.availableQtyKg <= item.lowStockThreshold;

          return (
            <View style={[styles.card, !isListingActive && styles.cardInactive]}>
              <Image source={{ uri: item.imageUrl }} style={styles.thumbnail} />
              <View style={{ flex: 1 }}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.productName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View style={isListingActive ? styles.activeBadge : styles.inactiveBadge}>
                    <View
                      style={[
                        styles.statusIndicatorDot,
                        { backgroundColor: isListingActive ? '#15803D' : '#6B7280' },
                      ]}
                    />
                    <Text style={isListingActive ? styles.activeBadgeText : styles.inactiveBadgeText}>
                      {isListingActive ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.productMeta}>
                  {item.category} • LKR {item.pricePerUnit.toLocaleString()} / {item.unit}
                </Text>

                <View style={styles.badgesRow}>
                  {item.availableQtyKg !== undefined && (
                    <Text style={[styles.stockText, isLowStock && styles.lowStockText]}>
                      Stock: {item.availableQtyKg} kg
                      {isLowStock && ' (Low Stock!)'}
                    </Text>
                  )}
                  {item.isSLSIVerified && (
                    <View style={styles.verifiedPill}>
                      <Ionicons name="shield-checkmark" size={12} color="#15803D" />
                      <Text style={styles.verifiedPillText}>SLSI</Text>
                    </View>
                  )}
                </View>

                {item.lowStockThreshold !== undefined && (
                  <Text style={styles.thresholdCaption}>
                    Warning limit: {item.lowStockThreshold} kg
                  </Text>
                )}
              </View>

              <Pressable
                style={styles.editBtn}
                onPress={() => openEditModal(item)}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${item.name}`}
              >
                <Ionicons name="pencil-outline" size={15} color="#15803D" />
                <Text style={styles.editBtnText}>Edit</Text>
              </Pressable>
            </View>
          );
        }}
      />

      {/* Edit Product Modal */}
      <Modal
        visible={!!editingProduct}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isSavingEdit) setEditingProduct(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.modalIconCircle}>
                  <Ionicons name="create-outline" size={20} color="#15803D" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Edit Product</Text>
                  <Text style={styles.modalSubtitle} numberOfLines={1}>
                    {editingProduct?.name} ({editingProduct?.category})
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => {
                  if (!isSavingEdit) setEditingProduct(null);
                }}
                hitSlop={10}
              >
                <Ionicons name="close" size={22} color="#6B7280" />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
              {/* Active Listing Switch */}
              <View style={styles.switchRowContainer}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.fieldLabel}>Active Listing Status</Text>
                  <Text style={styles.switchHelpText}>
                    {editIsActive
                      ? 'Visible to all customers on the marketplace'
                      : 'Paused — hidden from marketplace search & orders'}
                  </Text>
                </View>
                <Switch
                  value={editIsActive}
                  onValueChange={setEditIsActive}
                  trackColor={{ false: '#D1D5DB', true: '#86EFAC' }}
                  thumbColor={editIsActive ? '#15803D' : '#9CA3AF'}
                />
              </View>

              {/* Price Per Unit */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Price (LKR) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 360"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                  value={editPrice}
                  onChangeText={setEditPrice}
                />
              </View>

              {/* Available Stock & Low Stock Threshold */}
              <View style={styles.row}>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Available Stock (kg)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 500"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                    value={editQty}
                    onChangeText={setEditQty}
                  />
                </View>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Low Stock Alert (kg)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 20"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                    value={editThreshold}
                    onChangeText={setEditThreshold}
                  />
                </View>
              </View>
              <Text style={styles.helperNotice}>
                You will be sent an in-app notification as soon as inventory reaches this warning limit.
              </Text>
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setEditingProduct(null)}
                disabled={isSavingEdit}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.modalSaveBtn, isSavingEdit && { opacity: 0.6 }]}
                onPress={handleSaveEdit}
                disabled={isSavingEdit}
              >
                {isSavingEdit ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.modalSaveBtnText}>Save Changes</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    gap: 12,
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
  cardInactive: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    opacity: 0.85,
  },
  thumbnail: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#F4F4F5' },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  productName: { flex: 1, fontSize: 15, fontWeight: '700', color: '#111827' },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 12,
  },
  activeBadgeText: { fontSize: 10, fontWeight: '700', color: '#15803D' },
  inactiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 12,
  },
  inactiveBadgeText: { fontSize: 10, fontWeight: '700', color: '#6B7280' },
  statusIndicatorDot: { width: 6, height: 6, borderRadius: 3 },
  productMeta: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  badgesRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  stockText: { fontSize: 12, color: '#15803D', fontWeight: '600' },
  lowStockText: { color: '#DC2626' },
  thresholdCaption: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F0FDF4',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  verifiedPillText: { fontSize: 10, color: '#15803D', fontWeight: '700' },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'center',
  },
  editBtnText: { fontSize: 12, fontWeight: '700', color: '#15803D' },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 20,
    gap: 14,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  modalSubtitle: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  switchRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 12,
  },
  switchHelpText: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  row: { flexDirection: 'row', gap: 10 },
  field: { gap: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#374151' },
  input: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    backgroundColor: '#F9FAFB',
    color: '#111827',
  },
  helperNotice: { fontSize: 11, color: '#6B7280', fontStyle: 'italic' },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: { fontSize: 13, fontWeight: '600', color: '#4B5563' },
  modalSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#15803D',
  },
  modalSaveBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
});