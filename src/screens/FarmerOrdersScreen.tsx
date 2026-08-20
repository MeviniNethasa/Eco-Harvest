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
import StandardHeader from '../components/StandardHeader';

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

  return (
    <View style={styles.container}>
      <StandardHeader
        title="Incoming Orders"
        subtitle="Manage and track purchases for your farm"
        showNotificationBell
      />

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={orders.length === 0 ? styles.emptyContent : styles.listContent}
        ListEmptyComponent={
          <View style={styles.centered}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="receipt-outline" size={36} color="#15803D" />
            </View>
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <Text style={styles.emptySubtitle}>
              Customer orders for your farm will show up here automatically.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const group = farmGroupFor(item);
          return (
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.orderIdGroup}>
                  <Text style={styles.orderIdLabel}>Order</Text>
                  <Text style={styles.orderId}>#{item.id.slice(-8)}</Text>
                </View>
                <View
                  style={[styles.statusPill, { backgroundColor: `${STATUS_COLOR[item.status]}1A` }]}
                >
                  <Text style={[styles.statusText, { color: STATUS_COLOR[item.status] }]}>
                    {STATUS_LABEL[item.status]}
                  </Text>
                </View>
              </View>

              <View style={styles.itemsList}>
                {group?.items.map((lineItem) => (
                  <View key={lineItem.cropId} style={styles.lineItemRow}>
                    <Text style={styles.lineItemDot}>•</Text>
                    <Text style={styles.lineItem}>
                      {lineItem.quantity} × {lineItem.name}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={styles.divider} />

              <View style={styles.footerRow}>
                <Text style={styles.subtotalLabel}>Farm Payout:</Text>
                <Text style={styles.subtotal}>
                  LKR {(group?.subtotal ?? 0).toLocaleString()}
                </Text>
              </View>
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
  listContent: { padding: 16, paddingBottom: 32, gap: 12 },
  emptyContent: { flexGrow: 1 },
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 16,
    gap: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  orderIdGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  orderIdLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  orderId: { fontSize: 15, fontWeight: '700', color: '#111827' },
  statusPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  itemsList: {
    gap: 4,
    marginVertical: 4,
  },
  lineItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lineItemDot: {
    color: '#15803D',
    fontSize: 14,
    fontWeight: '700',
  },
  lineItem: { fontSize: 14, color: '#374151', fontWeight: '500' },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 4,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subtotalLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  subtotal: { fontSize: 15, fontWeight: '700', color: '#15803D' },
});