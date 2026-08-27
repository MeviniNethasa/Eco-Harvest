// src/components/HelpDeskFloatingBadge.tsx
//
// Accessible Floating Badge & Support Launcher Widget
// Renders a small floating support pill/badge on mobile screens with real-time
// ticket counter, allowing 1-tap access to the EcoHarvest Help Desk from anywhere.

import React, { useEffect, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HelpTicketCategory } from '../types';
import {
  getActiveMode,
  getOpenHelpTicketCount,
  subscribeToHelpTickets,
} from '../utils/storage';
import HelpDeskModal from './HelpDeskModal';

type HelpDeskOpener = (opts?: { orderId?: string; category?: HelpTicketCategory }) => void;
let globalHelpDeskOpener: HelpDeskOpener | null = null;

/**
 * Programmatically open the Help Desk modal from anywhere (e.g. Header, Order Card, Profile).
 */
export function openHelpDesk(opts?: { orderId?: string; category?: HelpTicketCategory }): void {
  if (globalHelpDeskOpener) {
    globalHelpDeskOpener(opts);
  }
}

export default function HelpDeskFloatingBadge() {
  const [modalVisible, setModalVisible] = useState(false);
  const [openCount, setOpenCount] = useState(0);
  const [modalOpts, setModalOpts] = useState<{ orderId?: string; category?: HelpTicketCategory }>({});
  const [isFarmer, setIsFarmer] = useState(false);

  // Subtle floating pulse animation
  const pulseScale = new Animated.Value(1);

  const refreshCount = async () => {
    const mode = await getActiveMode();
    const role = mode === 'farmer' ? 'FARMER' : 'CUSTOMER';
    setIsFarmer(mode === 'farmer');
    const count = await getOpenHelpTicketCount(role);
    setOpenCount(count);
  };

  useEffect(() => {
    refreshCount();
    const unsub = subscribeToHelpTickets(() => {
      refreshCount();
    });

    globalHelpDeskOpener = (opts) => {
      if (opts) setModalOpts(opts);
      setModalVisible(true);
    };

    return () => {
      unsub();
      globalHelpDeskOpener = null;
    };
  }, []);

  const handlePress = () => {
    setModalVisible(true);
  };

  return (
    <>
      <View style={styles.floatingContainer} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.floatingBadge}
          onPress={handlePress}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Open Help Desk Support"
        >
          <View style={styles.iconCircle}>
            <Ionicons name="headset" size={18} color="#FFFFFF" />
          </View>
          <View style={styles.labelContainer}>
            <Text style={styles.badgeLabel}>Help Desk</Text>
            <Text style={styles.subLabel}>{isFarmer ? 'Farmer Support' : 'Customer Care'}</Text>
          </View>

          {openCount > 0 && (
            <View style={styles.counterBadge}>
              <Text style={styles.counterText}>{openCount > 9 ? '9+' : openCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <HelpDeskModal
        visible={modalVisible}
        onClose={() => {
          setModalVisible(false);
          refreshCount();
        }}
        initialOrderId={modalOpts.orderId}
        initialCategory={modalOpts.category}
      />
    </>
  );
}

const styles = StyleSheet.create({
  floatingContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 82 : 74,
    right: 14,
    zIndex: 9999,
  },
  floatingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#374151',
    gap: 8,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#15803D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelContainer: {
    justifyContent: 'center',
  },
  badgeLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  subLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  counterBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginLeft: 2,
    borderWidth: 1.5,
    borderColor: '#111827',
  },
  counterText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
});
