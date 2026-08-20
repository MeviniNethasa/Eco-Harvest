// src/components/FarmerNotificationModal.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppNotification } from '../types';
import {
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  subscribeToNotifications,
} from '../utils/storage';

interface FarmerNotificationModalProps {
  visible: boolean;
  onClose: () => void;
}

const TYPE_ICONS: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  ORDER: { icon: 'receipt-outline', color: '#15803D', bg: '#DCFCE7' },
  DISPATCH: { icon: 'car-outline', color: '#2563EB', bg: '#DBEAFE' },
  INVENTORY: { icon: 'alert-circle-outline', color: '#D97706', bg: '#FEF3C7' },
  REVIEW: { icon: 'star-outline', color: '#CA8A04', bg: '#FEF08A' },
  BULK_MATCH: { icon: 'sparkles-outline', color: '#7C3AED', bg: '#F3E8FF' },
  RECOMMENDATION: { icon: 'leaf-outline', color: '#16A34A', bg: '#DCFCE7' },
  GENERAL: { icon: 'notifications-outline', color: '#15803D', bg: '#DCFCE7' },
};

function formatRelativeTime(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return '';
  }
}

export default function FarmerNotificationModal({
  visible,
  onClose,
}: FarmerNotificationModalProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await getNotifications('FARMER');
      setNotifications(list);
    } catch (err) {
      console.error('Failed to load farmer notifications:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadNotifications();
    }
    const unsub = subscribeToNotifications(() => {
      getNotifications('FARMER').then(setNotifications);
    });
    return unsub;
  }, [visible, loadNotifications]);

  const handleMarkAllRead = async () => {
    try {
      const updated = await markAllNotificationsAsRead('FARMER');
      setNotifications(updated.filter((n) => n.role === 'FARMER'));
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleNotificationPress = async (item: AppNotification) => {
    if (!item.isRead) {
      await markNotificationAsRead(item.id);
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleGroup}>
              <View style={styles.bellIconCircle}>
                <Ionicons name="notifications" size={20} color="#15803D" />
                {unreadCount > 0 && <View style={styles.unreadBadgeDot} />}
              </View>
              <View>
                <Text style={styles.title}>Farmer Notifications</Text>
                <Text style={styles.subtitle}>
                  {unreadCount > 0 ? `${unreadCount} unread alert(s)` : 'All caught up'}
                </Text>
              </View>
            </View>

            <Pressable onPress={onClose} style={styles.closeButton} hitSlop={10}>
              <Ionicons name="close" size={22} color="#6B7280" />
            </Pressable>
          </View>

          {unreadCount > 0 && (
            <View style={styles.actionsBar}>
              <Pressable onPress={handleMarkAllRead} style={styles.markAllButton}>
                <Ionicons name="checkmark-done" size={16} color="#15803D" />
                <Text style={styles.markAllText}>Mark all as read</Text>
              </Pressable>
            </View>
          )}

          {/* List */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="#15803D" size="large" />
            </View>
          ) : (
            <FlatList
              data={notifications}
              keyExtractor={(item) => item.id}
              contentContainerStyle={
                notifications.length === 0 ? styles.emptyListContent : styles.listContent
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <View style={styles.emptyIconCircle}>
                    <Ionicons name="notifications-off-outline" size={32} color="#9CA3AF" />
                  </View>
                  <Text style={styles.emptyTitle}>No notifications</Text>
                  <Text style={styles.emptySubtitle}>
                    New orders, customer inquiries, and payout alerts will appear here.
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const config = TYPE_ICONS[item.category] || TYPE_ICONS.GENERAL;
                const messageText = item.message || '';

                return (
                  <Pressable
                    style={[styles.notificationCard, !item.isRead && styles.notificationCardUnread]}
                    onPress={() => handleNotificationPress(item)}
                  >
                    <View style={[styles.typeIconContainer, { backgroundColor: config.bg }]}>
                      <Ionicons name={config.icon} size={20} color={config.color} />
                    </View>

                    <View style={styles.cardContent}>
                      <View style={styles.cardHeaderRow}>
                        <Text style={[styles.cardTitle, !item.isRead && styles.cardTitleUnread]}>
                          {item.title}
                        </Text>
                        <Text style={styles.timeText}>{formatRelativeTime(item.timestamp)}</Text>
                      </View>
                      {!!messageText && (
                        <Text style={styles.cardMessage} numberOfLines={2}>
                          {messageText}
                        </Text>
                      )}
                    </View>

                    {!item.isRead && <View style={styles.unreadIndicator} />}
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: 380,
    paddingTop: 16,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bellIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  unreadBadgeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#DC2626',
    position: 'absolute',
    top: 6,
    right: 6,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },
  closeButton: {
    padding: 6,
  },
  actionsBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 18,
    paddingVertical: 8,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  markAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  markAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#15803D',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 18,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  notificationCardUnread: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  typeIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    gap: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    flex: 1,
    marginRight: 6,
  },
  cardTitleUnread: {
    fontWeight: '700',
    color: '#111827',
  },
  timeText: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  cardMessage: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    marginTop: 2,
  },
  unreadIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#15803D',
    marginTop: 6,
  },
});
