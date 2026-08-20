// src/components/StandardHeader.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import HeaderBranding from './HeaderBranding';
import FarmerNotificationModal from './FarmerNotificationModal';
import { getUnreadNotificationCount, subscribeToNotifications } from '../utils/storage';

interface StandardHeaderProps {
  title?: string;
  subtitle?: string;
  showBranding?: boolean;
  showNotificationBell?: boolean;
  rightElement?: React.ReactNode;
  onBack?: () => void;
}

export default function StandardHeader({
  title,
  subtitle,
  showBranding = true,
  showNotificationBell = false,
  rightElement,
  onBack,
}: StandardHeaderProps) {
  const insets = useSafeAreaInsets();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isModalVisible, setIsModalVisible] = useState(false);

  useEffect(() => {
    if (showNotificationBell) {
      getUnreadNotificationCount('FARMER').then(setUnreadCount);
      const unsub = subscribeToNotifications(() => {
        getUnreadNotificationCount('FARMER').then(setUnreadCount);
      });
      return unsub;
    }
  }, [showNotificationBell]);

  const renderBell = () => {
    if (!showNotificationBell) return null;
    return (
      <Pressable
        style={styles.bellButton}
        onPress={() => setIsModalVisible(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Farmer Notifications"
      >
        <Ionicons name="notifications-outline" size={22} color="#15803D" />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View style={[styles.wrapper, { paddingTop: Math.max(insets.top, 12) }]}>
      {showBranding && (
        <View style={styles.brandingRow}>
          <HeaderBranding />
          <View style={styles.rightSlot}>
            {renderBell()}
            {rightElement}
          </View>
        </View>
      )}

      {(title || onBack) && (
        <View style={[styles.titleRow, !showBranding && styles.titleRowNoBranding]}>
          {onBack && (
            <Pressable
              style={styles.backButton}
              onPress={onBack}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={24} color="#111827" />
            </Pressable>
          )}
          <View style={styles.titleTextContainer}>
            {title && <Text style={styles.titleText}>{title}</Text>}
            {subtitle && <Text style={styles.subtitleText}>{subtitle}</Text>}
          </View>
          {!showBranding && (
            <View style={styles.rightSlot}>
              {renderBell()}
              {rightElement}
            </View>
          )}
        </View>
      )}

      <FarmerNotificationModal
        visible={isModalVisible}
        onClose={() => {
          setIsModalVisible(false);
          getUnreadNotificationCount('FARMER').then(setUnreadCount);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  brandingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  rightSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bellButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#DC2626',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRowNoBranding: {
    marginTop: 4,
  },
  backButton: {
    marginRight: 8,
    padding: 2,
  },
  titleTextContainer: {
    flex: 1,
  },
  titleText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  subtitleText: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 1,
  },
});
