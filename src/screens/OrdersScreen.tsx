// src/screens/OrdersScreen.tsx

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FarmGroup, Order, OrderStatus, OrdersStackParamList } from '../types';
import {
  getOrders,
  getUnreadNotificationCount,
  subscribeToNotifications,
  subscribeToOrders,
} from '../utils/storage';
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
  onMessageFarmer,
}: {
  order: Order;
  onWriteReview: (order: Order) => void;
  onMessageFarmer: (order: Order) => void;
}) {
  const navigation = useNavigation<OrdersNavProp>();
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const isTrackable = TRACKABLE_STATUSES.includes(order.status);
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

        {/* Message Farmer Launcher (supports single & multi-farmer selection) */}
        <Pressable
          style={[styles.actionButton, styles.messageButton]}
          onPress={() => onMessageFarmer(order)}
        >
          <Ionicons name="chatbubble-outline" size={16} color={colors.primaryGreen} />
          <Text style={styles.trackButtonText}>Message Farmer</Text>
        </Pressable>
      </View>

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

// Multi-Farmer Selection Modal for Orders with multiple distinct farms
function MultiFarmerSelectModal({
  visible,
  order,
  onClose,
  onSelectFarmer,
}: {
  visible: boolean;
  order: Order | null;
  onClose: () => void;
  onSelectFarmer: (group: FarmGroup, index: number) => void;
}) {
  if (!order) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={styles.modalTouchable} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Select Farm to Message</Text>
              <Text style={styles.modalSubtitle}>
                Order #{order.id} contains produce from {order.farmGroups.length} independent farms:
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={styles.farmGroupsList} showsVerticalScrollIndicator={false}>
            {order.farmGroups.map((group, idx) => {
              const groupTotal = group.items.reduce(
                (sum, item) => sum + item.pricePerUnit * item.quantity,
                0
              );
              const itemsListText = group.items
                .map((i) => `${i.quantity}x ${i.name}`)
                .join(', ');

              return (
                <Pressable
                  key={group.farmerId || `${group.farmName}_${idx}`}
                  style={styles.farmGroupSelectCard}
                  onPress={() => onSelectFarmer(group, idx)}
                >
                  <View style={styles.farmGroupCardHeader}>
                    <View style={styles.farmIconCircle}>
                      <Ionicons name="leaf" size={18} color="#15803D" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.farmGroupCardTitle}>{group.farmName}</Text>
                      <Text style={styles.farmGroupCardLocation}>{group.district}</Text>
                    </View>
                    <View style={styles.chatActionPill}>
                      <Text style={styles.chatActionText}>Chat</Text>
                      <Ionicons name="chevron-forward" size={14} color="#15803D" />
                    </View>
                  </View>

                  <View style={styles.farmGroupCardItemsRow}>
                    <Text style={styles.farmGroupItemsText} numberOfLines={1}>
                      {itemsListText}
                    </Text>
                    <Text style={styles.farmGroupTotalText}>{formatLKR(groupTotal)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// System Notification Push Matrix: header Bell icon + unread badge counter
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
    <Pressable
      style={styles.bellButton}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Notifications"
    >
      <Ionicons name="notifications-outline" size={22} color={colors.textDark} />
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function OrdersScreen() {
  const navigation = useNavigation<OrdersNavProp>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewOrder, setReviewOrder] = useState<Order | null>(null);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [multiFarmerModalOrder, setMultiFarmerModalOrder] = useState<Order | null>(null);

  const refreshOrders = useCallback(async () => {
    const latest = await getOrders();
    setOrders(latest);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshOrders();
      const interval = setInterval(refreshOrders, 3000);
      return () => clearInterval(interval);
    }, [refreshOrders])
  );

  useEffect(() => {
    const unsubscribe = subscribeToOrders(setOrders);
    return unsubscribe;
  }, []);

  const handleMessageFarmer = useCallback(
    (order: Order) => {
      if (order.farmGroups && order.farmGroups.length > 1) {
        setMultiFarmerModalOrder(order);
      } else if (order.farmGroups && order.farmGroups.length === 1) {
        const fg = order.farmGroups[0];
        (navigation as any).navigate('Chat', {
          threadId: `${order.id}_${fg.farmerId || '0'}`,
          recipientName: fg.farmName || 'Verified Farmer',
          farmerId: fg.farmerId,
        });
      } else {
        (navigation as any).navigate('Chat', {
          threadId: order.id,
          recipientName: 'Verified Farmer',
        });
      }
    },
    [navigation]
  );

  const handleSelectFarmerFromModal = useCallback(
    (group: FarmGroup, index: number) => {
      if (!multiFarmerModalOrder) return;
      const order = multiFarmerModalOrder;
      setMultiFarmerModalOrder(null);

      (navigation as any).navigate('Chat', {
        threadId: `${order.id}_${group.farmerId || index}`,
        recipientName: group.farmName || 'Verified Farmer',
        farmerId: group.farmerId,
      });
    },
    [multiFarmerModalOrder, navigation]
  );

  const handleWriteReview = useCallback((order: Order) => {
    setReviewOrder(order);
  }, []);

  const handleReviewModalClose = useCallback(() => {
    setReviewOrder(null);
  }, []);

  const handleReviewSubmitted = useCallback(() => {
    setReviewOrder(null);
    refreshOrders();
  }, [refreshOrders]);

  const handleOpenNotifications = useCallback(() => {
    setNotificationsVisible(true);
  }, []);

  const handleCloseNotifications = useCallback(() => {
    setNotificationsVisible(false);
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
    <SafeAreaView style={styles.screen} edges={['top']}>
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
          <OrderCard
            key={order.id}
            order={order}
            onWriteReview={handleWriteReview}
            onMessageFarmer={handleMessageFarmer}
          />
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

      <MultiFarmerSelectModal
        visible={multiFarmerModalOrder !== null}
        order={multiFarmerModalOrder}
        onClose={() => setMultiFarmerModalOrder(null)}
        onSelectFarmer={handleSelectFarmerFromModal}
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
    backgroundColor: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textDark,
  },
  bellButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: colors.danger,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderGray,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  orderId: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textDark,
  },
  orderDate: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  itemsList: {
    gap: 6,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderGray,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    fontSize: 14,
    color: colors.textDark,
    flex: 1,
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textDark,
    marginLeft: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemCountText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  grandTotal: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textDark,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  trackButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.primaryGreen,
  },
  messageButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.primaryGreen,
  },
  reviewButton: {
    backgroundColor: colors.primaryGreen,
  },
  reviewedButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.primaryGreen,
  },
  trackButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primaryGreen,
  },
  reviewButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyStateScreen: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
  },
  emptyStateBellRow: {
    alignSelf: 'flex-end',
    marginBottom: 40,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textDark,
    marginTop: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // Multi-Farmer Selection Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalTouchable: {
    flex: 1,
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '75%',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderGray,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textDark,
  },
  modalSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 3,
    maxWidth: 280,
  },
  modalCloseBtn: {
    padding: 4,
  },
  farmGroupsList: {
    paddingTop: 12,
  },
  farmGroupSelectCard: {
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: colors.borderGray,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  farmGroupCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  farmIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  farmGroupCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textDark,
  },
  farmGroupCardLocation: {
    fontSize: 11,
    color: colors.textMuted,
  },
  chatActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  chatActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  farmGroupCardItemsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    paddingTop: 6,
  },
  farmGroupItemsText: {
    fontSize: 12,
    color: colors.textMuted,
    flex: 1,
    marginRight: 8,
  },
  farmGroupTotalText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textDark,
  },
});