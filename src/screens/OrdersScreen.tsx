// src/screens/OrdersScreen.tsx

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Order, OrderStatus, OrdersStackParamList } from '../types';
import { getOrders, subscribeToOrders } from '../utils/storage';

// "Active" orders are the ones a courier is still moving toward the buyer
// for — delivered/cancelled orders have nothing left to track on Screen M-04.
const TRACKABLE_STATUSES: OrderStatus[] = ['placed', 'confirmed', 'in_transit'];

type OrdersNavProp = NativeStackNavigationProp<OrdersStackParamList, 'OrdersHome'>;

const colors = {
  primaryGreen: '#15803D',
  bgMain: '#FAFAFA',
  bgCard: '#F4F4F5',
  borderGray: '#E5E7EB',
  textDark: '#111827',
  textMuted: '#6B7280',
  warning: '#D97706',
  danger: '#DC2626',
};

const STATUS_META: Record<OrderStatus, { label: string; color: string }> = {
  placed: { label: 'Placed', color: colors.primaryGreen },
  confirmed: { label: 'Confirmed', color: colors.primaryGreen },
  in_transit: { label: 'In Transit', color: colors.warning },
  delivered: { label: 'Delivered', color: colors.primaryGreen },
  cancelled: { label: 'Cancelled', color: colors.danger },
};

function formatLKR(amount: number): string {
  return `LKR ${amount.toLocaleString('en-LK')}`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-LK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.placed;
  return (
    <View style={[styles.statusBadge, { backgroundColor: `${meta.color}1A` }]}>
      <Text style={[styles.statusBadgeText, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

function OrderCard({ order }: { order: Order }) {
  const navigation = useNavigation<OrdersNavProp>();
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const isTrackable = TRACKABLE_STATUSES.includes(order.status);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.orderId} numberOfLines={1}>
            Order #{order.id}
          </Text>
          <Text style={styles.orderDate}>{formatDate(order.createdAt)}</Text>
        </View>
        <StatusBadge status={order.status} />
      </View>

      <View style={styles.itemsList}>
        {order.items.map((item) => (
          <View key={item.cropId} style={styles.itemRow}>
            <Text style={styles.itemName} numberOfLines={1}>
              {item.quantity} × {item.name}
            </Text>
            <Text style={styles.itemTotal}>
              {formatLKR(item.pricePerUnit * item.quantity)}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.itemCountText}>
          {itemCount} item{itemCount === 1 ? '' : 's'} • {order.farmGroups.length} farm
          {order.farmGroups.length === 1 ? '' : 's'}
        </Text>
        <Text style={styles.grandTotal}>{formatLKR(order.summary.grandTotal)}</Text>
      </View>

      {isTrackable && (
        <Pressable
          style={styles.trackButton}
          onPress={() => navigation.navigate('OrderTracking', { orderId: order.id })}
        >
          <Ionicons name="navigate-outline" size={16} color={colors.primaryGreen} />
          <Text style={styles.trackButtonText}>Track Delivery</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshOrders = useCallback(async () => {
    const latest = await getOrders();
    setOrders(latest);
    setLoading(false);
  }, []);

  // Catch up whenever the Orders tab regains focus.
  useFocusEffect(
    useCallback(() => {
      refreshOrders();
    }, [refreshOrders])
  );

  // Stay live while mounted, so an order placed on Screen M-03 while this
  // tab isn't focused shows up the instant it's persisted.
  useEffect(() => {
    const unsubscribe = subscribeToOrders(setOrders);
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primaryGreen} />
      </View>
    );
  }

  if (orders.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
        <Text style={styles.emptyStateText}>No orders yet</Text>
        <Text style={styles.emptyStateSubtext}>
          Orders you place at checkout will show up here.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your Orders</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {orders.map((order) => (
          <OrderCard key={order.id} order={order} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgMain,
  },
  header: {
    height: 56,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderGray,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textDark,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 12,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 32,
    backgroundColor: colors.bgMain,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textDark,
    marginTop: 4,
  },
  emptyStateSubtext: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },

  card: {
    borderWidth: 1,
    borderColor: colors.borderGray,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  orderId: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textDark,
  },
  orderDate: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },

  itemsList: {
    borderTopWidth: 1,
    borderTopColor: colors.borderGray,
    paddingTop: 8,
    gap: 4,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemName: {
    flex: 1,
    fontSize: 13,
    color: colors.textDark,
    marginRight: 8,
  },
  itemTotal: {
    fontSize: 13,
    color: colors.textMuted,
  },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.borderGray,
    marginTop: 8,
    paddingTop: 8,
  },
  itemCountText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  grandTotal: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textDark,
  },

  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primaryGreen,
    backgroundColor: `${colors.primaryGreen}0D`,
  },
  trackButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primaryGreen,
  },
});