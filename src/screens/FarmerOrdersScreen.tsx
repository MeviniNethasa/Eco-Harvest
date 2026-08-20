// src/screens/FarmerOrdersScreen.tsx
//
// Farmer Mode tab 3 ("Orders"): incoming customer orders for the current
// farm, via `getOrdersByFarmerId` (storage.ts) — distinct from Customer
// Mode's OrdersScreen, which lists the current device's own *purchases*.
// Kept live with `subscribeToOrders` so a newly placed order (or a status
// change from Screen M-04's tracking flow) shows up without a manual pull.

import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { FarmGroup, Order } from '../types';
import { getFarmerProfile, getOrdersByFarmerId, subscribeToOrders } from '../utils/storage';

const STATUS_LABEL: Record<Order['status'], string> = {
  placed: 'Placed',
  confirmed: 'Confirmed',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const STATUS_COLOR: Record<Order['status'], string> = {
  placed: '#B45309',
  confirmed: '#15803D',
  in_transit: '#1D4ED8',
  delivered: '#15803D',
  cancelled: '#B91C1C',
};

export default function FarmerOrdersScreen() {
  const [farmerId, setFarmerId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const profile = await getFarmerProfile();
    setFarmerId(profile?.id ?? null);
    setOrders(profile?.id ? await getOrdersByFarmerId(profile.id) : []);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  React.useEffect(() => {
    return subscribeToOrders(() => {
      if (farmerId) getOrdersByFarmerId(farmerId).then(setOrders);
    });
  }, [farmerId]);

  // Only this farm's line items within an order, so "Total" reflects what
  // the farm is actually owed, not the customer's whole multi-farm cart.
  const farmGroupFor = (order: Order): FarmGroup | undefined =>
    order.farmGroups.find((group) =>
      group.items.some((item) => item.farmerId === farmerId)
    );

  if (loading) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Incoming Orders</Text>
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={orders.length === 0 ? styles.emptyContent : styles.listContent}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Ionicons name="receipt-outline" size={40} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <Text style={styles.emptySubtitle}>
              Customer orders for your farm will show up here.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const group = farmGroupFor(item);
          return (
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.orderId}>#{item.id.slice(-8)}</Text>
                <View
                  style={[styles.statusPill, { backgroundColor: `${STATUS_COLOR[item.status]}1A` }]}
                >
                  <Text style={[styles.statusText, { color: STATUS_COLOR[item.status] }]}>
                    {STATUS_LABEL[item.status]}
                  </Text>
                </View>
              </View>
              {group?.items.map((lineItem) => (
                <Text key={lineItem.cropId} style={styles.lineItem}>
                  {lineItem.quantity} × {lineItem.name}
                </Text>
              ))}
              <Text style={styles.subtotal}>
                Subtotal: LKR {(group?.subtotal ?? 0).toLocaleString()}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 24 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#111827', padding: 16, paddingBottom: 8 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  emptyContent: { flexGrow: 1 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#374151' },
  emptySubtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', maxWidth: 260 },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  orderId: { fontSize: 14, fontWeight: '700', color: '#111827' },
  statusPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  lineItem: { fontSize: 13, color: '#374151' },
  subtotal: { fontSize: 13, fontWeight: '600', color: '#15803D', marginTop: 6 },
});