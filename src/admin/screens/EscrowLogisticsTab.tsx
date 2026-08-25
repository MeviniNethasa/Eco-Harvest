// src/admin/screens/EscrowLogisticsTab.tsx
//
// Screen A-03: Active Escrow Ledger & Uber Logistics Tracker
// Tracks Master Stripe Payment Intents, Child Supplier Order IDs, Uber Delivery Status,
// Handshake OTP verification state, and Sticky Manual Override Bar (Force Release / Refund).

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AdminTheme } from '../AdminTheme';
import { adminApi } from '../../services/api';

interface EscrowLedgerItem {
  masterPaymentIntentId: string;
  orderId: string;
  childOrders: string[];
  customerName: string;
  farmerName: string;
  totalHoldLKR: number;
  stripeStatus: string;
  escrowStatus: 'HELD_IN_ESCROW' | 'RELEASED_TO_FARMER' | 'REFUNDED_TO_CUSTOMER';
  uberDeliveryStatus: 'DISPATCHED' | 'IN_TRANSIT' | 'DELIVERED' | 'DRIVER_ASSIGNED' | 'FAILED';
  uberTrackingId: string;
  driverName: string;
  driverPhone: string;
  handshakeOtpStatus: string;
  etaMinutes: number;
  createdAt: string;
  lineItems: Array<{ crop: string; qty: string; farm: string; subtotal: number }>;
}

function formatLKR(val: number): string {
  return `LKR ${Math.round(val).toLocaleString('en-LK')}`;
}

export default function EscrowLogisticsTab() {
  const [ledger, setLedger] = useState<EscrowLedgerItem[]>([]);
  const [selectedIntentId, setSelectedIntentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadLedger = async () => {
    try {
      setIsLoading(true);
      const res = await adminApi.getEscrowLedger();
      if (res && res.data) {
        setLedger(res.data);
        if (res.data.length > 0 && !selectedIntentId) {
          setSelectedIntentId(res.data[0].masterPaymentIntentId);
        }
      }
    } catch (err) {
      console.warn('Escrow ledger load notice:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLedger();
  }, []);

  const currentItem =
    ledger.find((l) => l.masterPaymentIntentId === selectedIntentId) || ledger[0];

  const handleForceRelease = async () => {
    if (!currentItem) return;
    try {
      setIsSubmitting(true);
      await adminApi.forceReleaseEscrow(
        currentItem.masterPaymentIntentId,
        'Admin manual transport loop override'
      );
      Alert.alert(
        'Funds Released',
        `Escrow funds of ${formatLKR(currentItem.totalHoldLKR)} dispatched to farmer bank account.`
      );
      setLedger((prev) =>
        prev.map((it) =>
          it.masterPaymentIntentId === currentItem.masterPaymentIntentId
            ? {
                ...it,
                escrowStatus: 'RELEASED_TO_FARMER',
                handshakeOtpStatus: 'OVERRIDDEN_BY_ADMIN',
                uberDeliveryStatus: 'DELIVERED',
              }
            : it
        )
      );
    } catch (err: any) {
      Alert.alert('Action Failed', err?.message || 'Could not release escrow.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTriggerRefund = async () => {
    if (!currentItem) return;
    try {
      setIsSubmitting(true);
      await adminApi.refundEscrow(
        currentItem.masterPaymentIntentId,
        'Admin initiated client refund'
      );
      Alert.alert(
        'Refund Initiated',
        `Full Stripe refund of ${formatLKR(currentItem.totalHoldLKR)} issued to customer.`
      );
      setLedger((prev) =>
        prev.map((it) =>
          it.masterPaymentIntentId === currentItem.masterPaymentIntentId
            ? {
                ...it,
                escrowStatus: 'REFUNDED_TO_CUSTOMER',
                stripeStatus: 'REFUNDED',
                uberDeliveryStatus: 'FAILED',
              }
            : it
        )
      );
    } catch (err: any) {
      Alert.alert('Action Failed', err?.message || 'Could not process refund.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={AdminTheme.colorBrandEmerald} />
        <Text style={styles.loadingText}>Loading Escrow & Logistics Ledger...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.workspace}>
        {/* Master Escrow Table */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="card" size={18} color={AdminTheme.colorBrandEmerald} />
            <Text style={styles.cardTitle}>Master Escrow & Payment Intent Ledger</Text>
          </View>

          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableColHeader, { flex: 1.8 }]}>Stripe Payment Intent</Text>
            <Text style={[styles.tableColHeader, { flex: 1.4 }]}>Order & Farm</Text>
            <Text style={[styles.tableColHeader, { flex: 1.2 }]}>Hold Total</Text>
            <Text style={[styles.tableColHeader, { flex: 1.2 }]}>Uber Delivery</Text>
            <Text style={[styles.tableColHeader, { flex: 1.4 }]}>Handshake OTP</Text>
            <Text style={[styles.tableColHeader, { flex: 1.2 }]}>Escrow State</Text>
          </View>

          {ledger.map((item) => {
            const isSelected = item.masterPaymentIntentId === currentItem?.masterPaymentIntentId;
            const isDelivered = item.uberDeliveryStatus === 'DELIVERED';
            const isTransit = item.uberDeliveryStatus === 'IN_TRANSIT';

            return (
              <Pressable
                key={item.masterPaymentIntentId}
                style={[styles.tableRow, isSelected && styles.tableRowSelected]}
                onPress={() => setSelectedIntentId(item.masterPaymentIntentId)}
              >
                <View style={{ flex: 1.8 }}>
                  <Text style={styles.intentIdText}>{item.masterPaymentIntentId}</Text>
                  <Text style={styles.customerSubtext}>👤 {item.customerName}</Text>
                </View>

                <View style={{ flex: 1.4 }}>
                  <Text style={styles.orderIdText}>{item.orderId}</Text>
                  <Text style={styles.farmerSubtext}>🏡 {item.farmerName.split('&')[0]}</Text>
                </View>

                <View style={{ flex: 1.2 }}>
                  <Text style={styles.priceHoldText}>{formatLKR(item.totalHoldLKR)}</Text>
                  <Text style={styles.stripeBadge}>Stripe Escrow</Text>
                </View>

                <View style={{ flex: 1.2 }}>
                  <View
                    style={[
                      styles.deliveryBadge,
                      isDelivered
                        ? styles.badgeDelivered
                        : isTransit
                        ? styles.badgeInTransit
                        : styles.badgeDispatched,
                    ]}
                  >
                    <Ionicons
                      name={isDelivered ? 'checkmark-circle' : 'car-outline'}
                      size={11}
                      color={
                        isDelivered
                          ? AdminTheme.colorBrandEmerald
                          : isTransit
                          ? AdminTheme.colorInfoBlue
                          : AdminTheme.colorWarningAmber
                      }
                    />
                    <Text
                      style={[
                        styles.deliveryBadgeText,
                        isDelivered
                          ? { color: AdminTheme.colorBrandEmerald }
                          : isTransit
                          ? { color: AdminTheme.colorInfoBlue }
                          : { color: AdminTheme.colorWarningAmber },
                      ]}
                    >
                      {item.uberDeliveryStatus}
                    </Text>
                  </View>
                </View>

                <View style={{ flex: 1.4 }}>
                  <View style={styles.otpPill}>
                    <Ionicons
                      name={
                        item.handshakeOtpStatus.includes('VERIFIED') ||
                        item.handshakeOtpStatus.includes('OVERRIDDEN')
                          ? 'shield-checkmark'
                          : 'time'
                      }
                      size={12}
                      color={
                        item.handshakeOtpStatus.includes('VERIFIED')
                          ? AdminTheme.colorBrandEmerald
                          : AdminTheme.colorWarningAmber
                      }
                    />
                    <Text style={styles.otpPillText}>
                      {item.handshakeOtpStatus.replace(/_/g, ' ')}
                    </Text>
                  </View>
                </View>

                <View style={{ flex: 1.2 }}>
                  <View
                    style={[
                      styles.escrowStatePill,
                      item.escrowStatus === 'RELEASED_TO_FARMER'
                        ? styles.escrowReleased
                        : item.escrowStatus === 'REFUNDED_TO_CUSTOMER'
                        ? styles.escrowRefunded
                        : styles.escrowHeld,
                    ]}
                  >
                    <Text
                      style={[
                        styles.escrowStateText,
                        item.escrowStatus === 'RELEASED_TO_FARMER'
                          ? { color: AdminTheme.colorBrandEmerald }
                          : item.escrowStatus === 'REFUNDED_TO_CUSTOMER'
                          ? { color: AdminTheme.colorAlertCrimson }
                          : { color: AdminTheme.colorWarningAmber },
                      ]}
                    >
                      {item.escrowStatus.replace(/_/g, ' ')}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Selected Order & Logistics Details Card */}
        {currentItem && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="cube" size={18} color={AdminTheme.colorInfoBlue} />
              <Text style={styles.cardTitle}>
                Delivery Breakdown & Uber Direct Tracking ({currentItem.orderId})
              </Text>
            </View>

            <View style={styles.detailsSplit}>
              {/* Left: Line Items */}
              <View style={styles.detailBox}>
                <Text style={styles.boxTitle}>Consolidated Multi-Farm Line Items</Text>
                {currentItem.lineItems.map((li, idx) => (
                  <View key={idx} style={styles.lineItemRow}>
                    <View>
                      <Text style={styles.cropTitle}>
                        {li.qty} {li.crop}
                      </Text>
                      <Text style={styles.farmSource}>🏡 {li.farm}</Text>
                    </View>
                    <Text style={styles.cropPrice}>{formatLKR(li.subtotal)}</Text>
                  </View>
                ))}
              </View>

              {/* Right: Driver & Vehicle Logistics */}
              <View style={styles.detailBox}>
                <Text style={styles.boxTitle}>Uber Direct Logistics Sandbox</Text>
                <View style={styles.dataField}>
                  <Text style={styles.fieldLabel}>Tracking Token</Text>
                  <Text style={styles.fieldValue}>{currentItem.uberTrackingId}</Text>
                </View>
                <View style={styles.dataField}>
                  <Text style={styles.fieldLabel}>Assigned Driver</Text>
                  <Text style={styles.fieldValue}>{currentItem.driverName}</Text>
                </View>
                <View style={styles.dataField}>
                  <Text style={styles.fieldLabel}>Driver Hotline</Text>
                  <Text style={styles.fieldValue}>{currentItem.driverPhone}</Text>
                </View>
                <View style={styles.dataField}>
                  <Text style={styles.fieldLabel}>Estimated ETA</Text>
                  <Text style={[styles.fieldValue, { color: AdminTheme.colorInfoBlue, fontWeight: '700' }]}>
                    {currentItem.etaMinutes > 0 ? `${currentItem.etaMinutes} minutes` : 'Arrived / Delivered'}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Sticky Manual System Override Action Bar */}
      <View style={styles.stickyFooter}>
        <View style={styles.footerLeft}>
          <Text style={styles.footerOrderLabel}>Selected Intent: {currentItem?.masterPaymentIntentId}</Text>
          <Text style={styles.footerHoldAmount}>
            Hold Total: <Text style={{ color: AdminTheme.colorBrandEmerald, fontWeight: '800' }}>{formatLKR(currentItem?.totalHoldLKR || 0)}</Text>
          </Text>
        </View>

        <View style={styles.footerActions}>
          <Pressable
            style={[styles.actionBtn, styles.refundBtn]}
            onPress={handleTriggerRefund}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Trigger Stripe Refund"
          >
            <Ionicons name="arrow-undo" size={16} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>Trigger Stripe Refund</Text>
          </Pressable>

          <Pressable
            style={[styles.actionBtn, styles.releaseBtn]}
            onPress={handleForceRelease}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Force Transfer Release"
          >
            <Ionicons name="flash" size={16} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>Force Transfer Release</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AdminTheme.bgAdminDark },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: AdminTheme.bgAdminDark },
  loadingText: { color: AdminTheme.colorTextMuted, marginTop: 12, fontSize: 14 },

  workspace: { padding: 20, paddingBottom: 90, gap: 20 },

  card: {
    backgroundColor: AdminTheme.bgPanelDark,
    borderRadius: AdminTheme.cardBorderRadius,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
    padding: 16,
    gap: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 6 },
  cardTitle: { color: AdminTheme.colorTextMain, fontSize: 15, fontWeight: '700' },

  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: AdminTheme.bgAdminDark,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
  },
  tableColHeader: { color: AdminTheme.colorTextDim, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },

  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 6,
    backgroundColor: AdminTheme.bgPanelDark,
    borderBottomWidth: 1,
    borderBottomColor: AdminTheme.bgSurfaceBorder,
  },
  tableRowSelected: { backgroundColor: AdminTheme.colorBlueSubtle, borderColor: AdminTheme.colorInfoBlue, borderWidth: 1 },
  intentIdText: { color: AdminTheme.colorTextMain, fontSize: 11, fontWeight: '700' },
  customerSubtext: { color: AdminTheme.colorTextDim, fontSize: 10 },
  orderIdText: { color: AdminTheme.colorTextMain, fontSize: 12, fontWeight: '700' },
  farmerSubtext: { color: AdminTheme.colorTextDim, fontSize: 10 },
  priceHoldText: { color: AdminTheme.colorBrandEmerald, fontSize: 12, fontWeight: '800' },
  stripeBadge: { color: AdminTheme.colorTextDim, fontSize: 9 },

  deliveryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  badgeDelivered: { backgroundColor: AdminTheme.colorEmeraldSubtle },
  badgeInTransit: { backgroundColor: AdminTheme.colorBlueSubtle },
  badgeDispatched: { backgroundColor: AdminTheme.colorAmberSubtle },
  deliveryBadgeText: { fontSize: 10, fontWeight: '700' },

  otpPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  otpPillText: { color: AdminTheme.colorTextMuted, fontSize: 10, fontWeight: '600' },

  escrowStatePill: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, alignSelf: 'flex-start' },
  escrowReleased: { backgroundColor: AdminTheme.colorEmeraldSubtle },
  escrowRefunded: { backgroundColor: AdminTheme.colorCrimsonSubtle },
  escrowHeld: { backgroundColor: AdminTheme.colorAmberSubtle },
  escrowStateText: { fontSize: 10, fontWeight: '700' },

  // Details
  detailsSplit: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  detailBox: {
    flex: 1,
    minWidth: 280,
    backgroundColor: AdminTheme.bgAdminDark,
    borderRadius: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
    gap: 8,
  },
  boxTitle: { color: AdminTheme.colorTextMain, fontSize: 13, fontWeight: '700', marginBottom: 4 },
  lineItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: AdminTheme.bgSurfaceBorder,
  },
  cropTitle: { color: AdminTheme.colorTextMain, fontSize: 12, fontWeight: '600' },
  farmSource: { color: AdminTheme.colorTextDim, fontSize: 10 },
  cropPrice: { color: AdminTheme.colorBrandEmerald, fontSize: 12, fontWeight: '700' },

  dataField: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  fieldLabel: { color: AdminTheme.colorTextDim, fontSize: 12 },
  fieldValue: { color: AdminTheme.colorTextMain, fontSize: 12, fontWeight: '500' },

  // Sticky Action Footer
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: AdminTheme.actionBarHeight,
    backgroundColor: AdminTheme.bgPanelDark,
    borderTopWidth: 1,
    borderTopColor: AdminTheme.bgSurfaceBorder,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerLeft: { gap: 2 },
  footerOrderLabel: { color: AdminTheme.colorTextDim, fontSize: 11 },
  footerHoldAmount: { color: AdminTheme.colorTextMain, fontSize: 13 },
  footerActions: { flexDirection: 'row', gap: 12 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
  },
  refundBtn: { backgroundColor: AdminTheme.colorAlertCrimson },
  releaseBtn: { backgroundColor: AdminTheme.colorBrandEmerald },
  actionBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
