// src/components/NotificationModal.tsx

import React, { useCallback, useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppNotification, NotificationCategory, NotificationRole } from '../types';
import {
  addNotification,
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  subscribeToNotifications,
} from '../utils/storage';

const colors = {
  primaryGreen: '#15803D',
  infoBlue: '#2563EB',
  amberWarning: '#D97706',
  bgCard: '#F4F4F5',
  bgUnread: '#F0FDF4',
  borderGray: '#E5E7EB',
  textDark: '#111827',
  textMuted: '#6B7280',
  bgMain: '#FAFAFA',
};

const CATEGORY_META: Record<NotificationCategory, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  ORDER: { icon: 'checkmark-circle-outline', color: colors.primaryGreen },
  DISPATCH: { icon: 'car-outline', color: colors.infoBlue },
  RECOMMENDATION: { icon: 'leaf-outline', color: colors.primaryGreen },
  INVENTORY: { icon: 'alert-circle-outline', color: colors.amberWarning },
  REVIEW: { icon: 'star-outline', color: colors.primaryGreen },
  BULK_MATCH: { icon: 'cube-outline', color: colors.infoBlue },
};

/**
 * Renders a compact relative-time label ("Just now", "5m ago", "3h ago",
 * "2d ago") for a notification's ISO timestamp, matching Notification.md
 * Section 3.2's examples. Falls back to the raw ISO string if the
 * timestamp can't be parsed rather than throwing.
 */
function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Just now';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function NotificationCard({
  notification,
  onPress,
}: {
  notification: AppNotification;
  onPress: (notification: AppNotification) => void;
}) {
  const meta = CATEGORY_META[notification.category] ?? CATEGORY_META.ORDER;

  return (
    <Pressable
      style={[
        styles.card,
        notification.isRead ? styles.cardRead : styles.cardUnread,
      ]}
      onPress={() => onPress(notification)}
    >
      {!notification.isRead && <View style={styles.unreadDot} />}
      <View style={[styles.iconWrap, { backgroundColor: `${meta.color}1A` }]}>
        <Ionicons name={meta.icon} size={18} color={meta.color} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {notification.title}
        </Text>
        <Text style={styles.cardMessage}>{notification.message}</Text>
        <Text style={styles.cardTimestamp}>{formatRelativeTime(notification.timestamp)}</Text>
      </View>
    </Pressable>
  );
}

interface NotificationModalProps {
  visible: boolean;
  onClose: () => void;
  // Which viewport tab is active when the drawer first opens. Defaults to
  // 'CUSTOMER' since most entry points (e.g. OrdersScreen) are customer-
  // facing; the Farmer Portal can pass 'FARMER' instead.
  initialRole?: NotificationRole;
}

export default function NotificationModal({
  visible,
  onClose,
  initialRole = 'CUSTOMER',
}: NotificationModalProps) {
  const [activeRole, setActiveRole] = useState<NotificationRole>(initialRole);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const refresh = useCallback(async () => {
    const all = await getNotifications();
    setNotifications(all);
  }, []);

  // Re-sync the active tab and refresh data every time the drawer opens.
  useEffect(() => {
    if (visible) {
      setActiveRole(initialRole);
      refresh();
    }
  }, [visible, initialRole, refresh]);

  // Stay live while mounted, so a simulated push (or a real one triggered
  // elsewhere in the app) shows up immediately without re-opening the modal.
  useEffect(() => {
    const unsubscribe = subscribeToNotifications(setNotifications);
    return unsubscribe;
  }, []);

  const visibleNotifications = notifications
    .filter((n) => n.role === activeRole)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const unreadCount = visibleNotifications.filter((n) => !n.isRead).length;

  const handleCardPress = useCallback((notification: AppNotification) => {
    if (!notification.isRead) {
      markNotificationAsRead(notification.id);
    }
  }, []);

  const handleMarkAllRead = useCallback(() => {
    markAllNotificationsAsRead(activeRole);
  }, [activeRole]);

  // --- Section 3.3: Developer Sandbox Simulation Bar ---
  // Each preset pushes a notification whose copy matches the corresponding
  // channel entry in Notification.md Section 2, then switches the active
  // tab to that channel so the result is immediately visible.
  const handleSimOrderAccepted = useCallback(async () => {
    await addNotification({
      role: 'CUSTOMER',
      title: 'Order Accepted',
      message: 'Farmer has verified harvest stock and locked inventory',
      category: 'ORDER',
    });
    setActiveRole('CUSTOMER');
  }, []);

  const handleSimDriverDispatch = useCallback(async () => {
    await addNotification({
      role: 'CUSTOMER',
      title: 'Uber Dispatch',
      message: 'Driver assigned and en route to farm pickup',
      category: 'DISPATCH',
    });
    setActiveRole('CUSTOMER');
  }, []);

  const handleSimBulkMatch = useCallback(async () => {
    await addNotification({
      role: 'FARMER',
      title: 'AI Demand Match',
      message: 'New bulk requirement query matches your active crops',
      category: 'BULK_MATCH',
    });
    setActiveRole('FARMER');
  }, []);

  const handleSimLowStock = useCallback(async () => {
    await addNotification({
      role: 'FARMER',
      title: 'High Priority Alert',
      message: 'Inventory levels fallen below configured threshold',
      category: 'INVENTORY',
    });
    setActiveRole('FARMER');
  }, []);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouchable} onPress={onClose} />

        <SafeAreaView style={styles.sheet} edges={['bottom']}>
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Notifications</Text>
              <Text style={styles.headerSubtitle}>
                {unreadCount} unread {unreadCount === 1 ? 'alert' : 'alerts'}
              </Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable onPress={handleMarkAllRead} hitSlop={8}>
                <Text style={styles.markAllText}>Mark All as Read</Text>
              </Pressable>
              <Pressable onPress={onClose} hitSlop={8} style={styles.closeButton}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          </View>

          <View style={styles.tabRow}>
            <Pressable
              style={[styles.tab, activeRole === 'CUSTOMER' && styles.tabActive]}
              onPress={() => setActiveRole('CUSTOMER')}
            >
              <Text
                style={[styles.tabText, activeRole === 'CUSTOMER' && styles.tabTextActive]}
              >
                Customer Alerts
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tab, activeRole === 'FARMER' && styles.tabActive]}
              onPress={() => setActiveRole('FARMER')}
            >
              <Text
                style={[styles.tabText, activeRole === 'FARMER' && styles.tabTextActive]}
              >
                Farmer Alerts
              </Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {visibleNotifications.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="notifications-outline" size={36} color={colors.textMuted} />
                <Text style={styles.emptyStateText}>No notifications yet</Text>
              </View>
            ) : (
              visibleNotifications.map((notification) => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  onPress={handleCardPress}
                />
              ))
            )}
          </ScrollView>

          <View style={styles.sandboxBar}>
            <Text style={styles.sandboxLabel}>Developer Sandbox</Text>
            <View style={styles.sandboxButtonRow}>
              <Pressable style={styles.sandboxButton} onPress={handleSimOrderAccepted}>
                <Text style={styles.sandboxButtonText}>Sim: Order Accepted</Text>
              </Pressable>
              <Pressable style={styles.sandboxButton} onPress={handleSimDriverDispatch}>
                <Text style={styles.sandboxButtonText}>Sim: Driver Dispatch</Text>
              </Pressable>
            </View>
            <View style={styles.sandboxButtonRow}>
              <Pressable style={styles.sandboxButton} onPress={handleSimBulkMatch}>
                <Text style={styles.sandboxButtonText}>Sim: Bulk Match</Text>
              </Pressable>
              <Pressable style={styles.sandboxButton} onPress={handleSimLowStock}>
                <Text style={styles.sandboxButtonText}>Sim: Low Stock Alert</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  backdropTouchable: {
    flex: 1,
  },
  sheet: {
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderGray,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textDark,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  markAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primaryGreen,
  },
  closeButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tab: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderGray,
    backgroundColor: colors.bgCard,
  },
  tabActive: {
    borderColor: colors.primaryGreen,
    backgroundColor: `${colors.primaryGreen}1A`,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primaryGreen,
  },

  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 13,
    color: colors.textMuted,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  cardUnread: {
    backgroundColor: colors.bgUnread,
    borderColor: `${colors.primaryGreen}33`,
  },
  cardRead: {
    backgroundColor: colors.bgCard,
    borderColor: colors.borderGray,
  },
  unreadDot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primaryGreen,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textDark,
    marginBottom: 2,
    paddingRight: 12,
  },
  cardMessage: {
    fontSize: 12,
    color: colors.textDark,
    marginBottom: 4,
  },
  cardTimestamp: {
    fontSize: 11,
    color: colors.textMuted,
  },

  sandboxBar: {
    borderTopWidth: 1,
    borderTopColor: colors.borderGray,
    backgroundColor: colors.bgMain,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    gap: 8,
  },
  sandboxLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sandboxButtonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sandboxButton: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderGray,
    backgroundColor: '#FFFFFF',
  },
  sandboxButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textDark,
  },
});