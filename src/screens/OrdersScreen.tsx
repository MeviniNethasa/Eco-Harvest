// src/screens/OrdersScreen.tsx

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Order, OrderStatus, OrdersStackParamList } from '../types';
import { getOrders, getUnreadNotificationCount, subscribeToNotifications, subscribeToOrders } from '../utils/storage';
import ReviewModal from '../components/ReviewModal';
import NotificationModal from '../components/NotificationModal';
import HeaderBranding from '../components/HeaderBranding';

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

function OrderCard({
  order,
  onWriteReview,
}: {
  order: Order;
  onWriteReview: (order: Order) => void;
}) {
  const navigation = useNavigation<OrdersNavProp>();
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const isTrackable = TRACKABLE_STATUSES.includes(order.status);
  // Screen M-07: only delivered orders are eligible for a review.
  const isDelivered = order.status === 'delivered';
  const isReviewed = Boolean(order.isReviewed);

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

      <View style={styles.actionRow}>
        {isTrackable && (
          <Pressable
            style={[styles.actionButton, styles.trackButton]}
            onPress={() => navigation.navigate('OrderTracking', { orderId: order.id })}
          >
            <Ionicons name="navigate-outline" size={16} color={colors.primaryGreen} />
            <Text style={styles.trackButtonText}>Track Delivery</Text>
          </Pressable>
        )}

        {/* Screen M-06: opens (or resumes) the Moderated In-App Chat thread
            tied to this order, keyed by orderId so re-opening the same
            order's chat always lands back on the same thread/history. */}
        <Pressable
          style={[styles.actionButton, styles.messageButton]}
          onPress={() =>
            navigation.navigate('Chat', {
              threadId: order.id,
              recipientName: order.farmGroups?.[0]?.farmName || 'Verified Farmer',
            })
          }
        >
          <Ionicons name="chatbubble-outline" size={16} color={colors.primaryGreen} />
          <Text style={styles.trackButtonText}>Message Farmer</Text>
        </Pressable>
      </View>

      {/* Screen M-07: only delivered orders can be reviewed. Already-
          reviewed orders show a disabled confirmation pill instead of
          re-opening the modal. */}
      {isDelivered && (
        <View style={styles.actionRow}>
          {isReviewed ? (
            <View style={[styles.actionButton, styles.reviewedButton]}>
              <Ionicons name="checkmark-circle" size={16} color={colors.primaryGreen} />
              <Text style={styles.trackButtonText}>Reviewed ✓</Text>
            </View>
          ) : (
            <Pressable
              style={[styles.actionButton, styles.reviewButton]}
              onPress={() => onWriteReview(order)}
            >
              <Ionicons name="star-outline" size={16} color="#FFFFFF" />
              <Text style={styles.reviewButtonText}>Write Review</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

// System Notification Push Matrix: header Bell icon + unread badge counter
// (Notification.md Section 3.1). Lives in its own component so the badge
// count can update live via `subscribeToNotifications` without re-rendering
// the rest of the header.
function NotificationBell({ onPress }: { onPress: () => void }) {
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnreadCount = useCallback(async () => {
    const count = await getUnreadNotificationCount('CUSTOMER');
    setUnreadCount(count);
  }, []);

  useEffect(() => {
    refreshUnreadCount();
    const unsubscribe = subscribeToNotifications(refreshUnreadCount);
    return unsubscribe;
  }, [refreshUnreadCount]);

  return (
    <Pressable style={styles.bellButton} onPress={onPress} hitSlop={8}>
      <Ionicons name="notifications-outline" size={22} color={colors.textDark} />
      {unreadCount > 0 && (
        <View style={styles.bellBadge}>
          <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  // Screen M-07: which order (if any) the review modal is currently open
  // for. `null` keeps the modal closed.
  const [reviewOrder, setReviewOrder] = useState<Order | null>(null);
  // System Notification Push Matrix: whether the notification drawer is open.
  const [notificationsVisible, setNotificationsVisible] = useState(false);

  const refreshOrders = useCallback(async () => {
    const latest = await getOrders();
    setOrders(latest);
    setLoading(false);
  }, []);

  const handleWriteReview = useCallback((order: Order) => {
    setReviewOrder(order);
  }, []);

  const handleReviewModalClose = useCallback(() => {
    setReviewOrder(null);
  }, []);

  const handleReviewSubmitted = useCallback(() => {
    // submitProductReview already persists `isReviewed` on the order and
    // notifies subscribeToOrders listeners, so the live subscription below
    // will refresh this list — closing here is just for immediate feedback.
    setReviewOrder(null);
  }, []);

  const handleOpenNotifications = useCallback(() => {
    setNotificationsVisible(true);
  }, []);

  const handleCloseNotifications = useCallback(() => {
    setNotificationsVisible(false);
  }, []);

  // Catch up whenever the Orders tab regains focus and keep live via interval.
  useFocusEffect(
    useCallback(() => {
      refreshOrders();
      const interval = setInterval(() => {
        getOrders().then(setOrders);
      }, 4000);
      return () => clearInterval(interval);
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
      <SafeAreaView style={styles.loadingScreen} edges={['top']}>
        <View style={styles.brandRow}>
          <HeaderBranding />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primaryGreen} />
        </View>
      </SafeAreaView>
    );
  }

  if (orders.length === 0) {
    return (
      <SafeAreaView style={styles.emptyStateScreen} edges={['top']}>
        <View style={styles.brandRow}>
          <HeaderBranding />
        </View>
        <View style={styles.emptyState}>
          <View style={styles.emptyStateBellRow}>
            <NotificationBell onPress={handleOpenNotifications} />
          </View>
          <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyStateText}>No orders yet</Text>
          <Text style={styles.emptyStateSubtext}>
            Orders you place at checkout will show up here.
          </Text>
        </View>

        <NotificationModal
          visible={notificationsVisible}
          onClose={handleCloseNotifications}
          initialRole="CUSTOMER"
        />
      </SafeAreaView>
    );
  }

  return (
    // edges={['top']} only insets the top edge — this screen sits inside a
    // bottom tab bar that already accounts for the bottom safe area, so we
    // don't want to double-pad the bottom.
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* Brand Row — Header Branding Standardization Spec Section 3.2.
          Sits above the existing title/bell row rather than replacing it,
          so the "Your Orders" heading and notification badge stay intact. */}
      <View style={styles.brandRow}>
        <HeaderBranding />
      </View>

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your Orders</Text>
        <NotificationBell onPress={handleOpenNotifications} />
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {orders.map((order) => (
          <OrderCard key={order.id} order={order} onWriteReview={handleWriteReview} />
        ))}
      </ScrollView>

      <ReviewModal
        visible={reviewOrder !== null}
        order={reviewOrder}
        onClose={handleReviewModalClose}
        onSubmitted={handleReviewSubmitted}
      />

      <NotificationModal
        visible={notificationsVisible}
        onClose={handleCloseNotifications}
        initialRole="CUSTOMER"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgMain,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderGray,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  emptyStateScreen: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 32,
    backgroundColor: colors.bgMain,
  },
  emptyStateBellRow: {
    position: 'absolute',
    top: 8,
    right: 16,
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

  // System Notification Push Matrix: header Bell icon + unread badge.
  bellButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  bellBadgeText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '700',
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

  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
  },
  trackButton: {
    borderColor: colors.primaryGreen,
    backgroundColor: `${colors.primaryGreen}0D`,
  },
  messageButton: {
    borderColor: colors.primaryGreen,
    backgroundColor: '#FFFFFF',
  },
  trackButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primaryGreen,
  },

  // Screen M-07
  reviewButton: {
    borderColor: colors.primaryGreen,
    backgroundColor: colors.primaryGreen,
  },
  reviewButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  reviewedButton: {
    borderColor: colors.borderGray,
    backgroundColor: colors.bgCard,
  },
});