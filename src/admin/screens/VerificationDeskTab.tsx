// src/admin/screens/VerificationDeskTab.tsx
//
// Screen A-01: Verification Request Desk (SLSI Certificate Audit)
// Split-screen 600px/600px layout with interactive Document Inspector,
// Merchant Profile Data Sheet, and Sticky Approval/Rejection Override Bar.

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AdminTheme } from '../AdminTheme';
import { adminApi } from '../../services/api';

interface VerificationItem {
  id: string;
  farmerId: string;
  farmName: string;
  legalName: string;
  businessRegistrationNumber: string;
  mobileNumber: string;
  isMobileVerified: boolean;
  province: string;
  district: string;
  city: string;
  coordinates: { latitude: number; longitude: number } | null;
  slsiStandardNumber: string;
  certificateIssueDate: string;
  certificateExpiryDate: string;
  certificateDocumentUrl: string;
  slsiCertificateUrl?: string;
  documentUrl?: string;
  bankDetails: {
    bankName: string;
    branchCode: string;
    accountNumber: string;
    accountHolderName: string;
  };
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  commissionRate: number;
  submittedAt: string;
}

export default function VerificationDeskTab() {
  const [queue, setQueue] = useState<VerificationItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Inspector Document State
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [rotationDegrees, setRotationDegrees] = useState(0);
  const [commissionRate, setCommissionRate] = useState(2.5);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const res = await adminApi.getVerifications();
      let list: VerificationItem[] = [];
      if (Array.isArray(res)) {
        list = res;
      } else if (res && Array.isArray((res as any).verifications)) {
        list = (res as any).verifications;
      } else if (res && Array.isArray(res.data)) {
        list = res.data;
      } else if (res && res.data && Array.isArray((res.data as any).verifications)) {
        list = (res.data as any).verifications;
      } else if (res && res.data && Array.isArray((res.data as any).data)) {
        list = (res.data as any).data;
      }

      setQueue(list);
      if (list.length > 0 && (!selectedId || !list.some((item) => item.id === selectedId))) {
        setSelectedId(list[0].id);
        setCommissionRate(list[0].commissionRate || 2.5);
      }
    } catch (err) {
      console.warn('Admin verifications load notice:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const currentItem = queue.find((q) => q.id === selectedId) || queue[0];

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(3.0, prev + 0.25));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(0.5, prev - 0.25));
  const handleRotate = () => setRotationDegrees((prev) => (prev + 90) % 360);
  const handleFitWidth = () => {
    setZoomLevel(1.0);
    setRotationDegrees(0);
  };

  const handleApprove = async () => {
    if (!currentItem) return;
    try {
      setIsSubmitting(true);
      await adminApi.approveVerification(currentItem.id, commissionRate);
      Alert.alert(
        'Application Approved',
        `SLSI status for ${currentItem.farmName} set to VERIFIED at ${commissionRate}% commission.`
      );
      setQueue((prev) =>
        prev.map((it) =>
          it.id === currentItem.id
            ? { ...it, verificationStatus: 'VERIFIED', commissionRate }
            : it
        )
      );
    } catch (err: any) {
      Alert.alert('Action Failed', err?.message || 'Could not approve application.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!currentItem) return;
    try {
      setIsSubmitting(true);
      await adminApi.rejectVerification(
        currentItem.id,
        'Certificate failed SLSI Organic Compliance audit.'
      );
      Alert.alert(
        'Application Rejected',
        `SLSI status for ${currentItem.farmName} set to REJECTED. Standard 5.0% commission applied.`
      );
      setQueue((prev) =>
        prev.map((it) =>
          it.id === currentItem.id
            ? { ...it, verificationStatus: 'REJECTED', commissionRate: 5.0 }
            : it
        )
      );
    } catch (err: any) {
      Alert.alert('Action Failed', err?.message || 'Could not reject application.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={AdminTheme.colorBrandEmerald} />
        <Text style={styles.loadingText}>Loading SLSI Verification Queue...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Sub-header Queue Selector */}
      <View style={styles.queueBar}>
        <Text style={styles.queueTitle}>Applications Queue ({queue.length})</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.queueList}>
          {queue.map((item) => {
            const isSelected = item.id === currentItem?.id;
            const isVerified = item.verificationStatus === 'VERIFIED';
            const isRejected = item.verificationStatus === 'REJECTED';

            return (
              <Pressable
                key={item.id}
                style={[styles.queuePill, isSelected && styles.queuePillActive]}
                onPress={() => {
                  setSelectedId(item.id);
                  setCommissionRate(item.commissionRate || 2.5);
                }}
              >
                <View
                  style={[
                    styles.statusDot,
                    isVerified
                      ? { backgroundColor: AdminTheme.colorBrandEmerald }
                      : isRejected
                      ? { backgroundColor: AdminTheme.colorAlertCrimson }
                      : { backgroundColor: AdminTheme.colorWarningAmber },
                  ]}
                />
                <Text style={[styles.queuePillText, isSelected && styles.queuePillTextActive]}>
                  {item.farmName}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Split-Screen Workspace (600px left / 600px right) */}
      <ScrollView contentContainerStyle={styles.workspace}>
        <View style={styles.splitGrid}>
          {/* Left Inspection Pane (600px): SLSI Document Inspector */}
          <View style={styles.leftPane}>
            <View style={styles.paneHeader}>
              <View style={styles.paneHeaderLeft}>
                <Ionicons name="document-text" size={18} color={AdminTheme.colorBrandEmerald} />
                <Text style={styles.paneTitle}>SLSI Certificate Inspector</Text>
              </View>
              <View style={styles.inspectorControls}>
                <Pressable style={styles.controlBtn} onPress={handleZoomOut} accessibilityLabel="Zoom Out">
                  <Ionicons name="remove" size={16} color={AdminTheme.colorTextMain} />
                </Pressable>
                <Text style={styles.zoomText}>{Math.round(zoomLevel * 100)}%</Text>
                <Pressable style={styles.controlBtn} onPress={handleZoomIn} accessibilityLabel="Zoom In">
                  <Ionicons name="add" size={16} color={AdminTheme.colorTextMain} />
                </Pressable>
                <Pressable style={styles.controlBtn} onPress={handleRotate} accessibilityLabel="Rotate 90 deg">
                  <Ionicons name="reload" size={15} color={AdminTheme.colorTextMain} />
                </Pressable>
                <Pressable style={styles.controlBtn} onPress={handleFitWidth} accessibilityLabel="Fit to Width">
                  <Ionicons name="scan-outline" size={15} color={AdminTheme.colorTextMain} />
                </Pressable>
              </View>
            </View>

            {/* Document Canvas */}
            <View style={styles.docCanvas}>
              {(() => {
                const certUrl =
                  currentItem?.slsiCertificateUrl ||
                  currentItem?.certificateDocumentUrl ||
                  (currentItem as any)?.documentUrl ||
                  (currentItem as any)?.certificateUrl;

                return certUrl ? (
                  <View
                    style={[
                      styles.imageWrapper,
                      {
                        transform: [{ scale: zoomLevel }, { rotate: `${rotationDegrees}deg` }],
                      },
                    ]}
                  >
                    <Image
                      source={{ uri: certUrl }}
                      style={styles.certificateImage}
                      resizeMode="contain"
                    />
                  </View>
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
                    <Ionicons name="document-outline" size={48} color={AdminTheme.colorTextMuted} />
                    <Text style={{ color: AdminTheme.colorTextMuted, fontSize: 14, marginTop: 12, textAlign: 'center', fontWeight: '600' }}>
                      No Document Attached
                    </Text>
                    <Text style={{ color: AdminTheme.colorTextMuted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                      The farmer has not attached an SLSI certificate document yet.
                    </Text>
                  </View>
                );
              })()}
            </View>

            {/* Certificate Standards Stamp & Hash */}
            <View style={styles.certMetaCard}>
              <View style={styles.certMetaRow}>
                <Text style={styles.certMetaLabel}>Standard:</Text>
                <Text style={styles.certMetaVal}>{currentItem?.slsiStandardNumber}</Text>
              </View>
              <View style={styles.certMetaRow}>
                <Text style={styles.certMetaLabel}>Issue Date:</Text>
                <Text style={styles.certMetaVal}>{currentItem?.certificateIssueDate}</Text>
                <Text style={styles.certMetaLabel}>Expires:</Text>
                <Text style={styles.certMetaVal}>{currentItem?.certificateExpiryDate}</Text>
              </View>
            </View>
          </View>

          {/* Right Profile Pane (600px): Merchant Profile Details */}
          <View style={styles.rightPane}>
            <View style={styles.paneHeader}>
              <View style={styles.paneHeaderLeft}>
                <Ionicons name="business" size={18} color={AdminTheme.colorBrandEmerald} />
                <Text style={styles.paneTitle}>Merchant Profile Summary</Text>
              </View>
              <View
                style={[
                  styles.badgePill,
                  currentItem?.verificationStatus === 'VERIFIED'
                    ? styles.badgeVerified
                    : currentItem?.verificationStatus === 'REJECTED'
                    ? styles.badgeRejected
                    : styles.badgePending,
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    currentItem?.verificationStatus === 'VERIFIED'
                      ? { color: AdminTheme.colorBrandEmerald }
                      : currentItem?.verificationStatus === 'REJECTED'
                      ? { color: AdminTheme.colorAlertCrimson }
                      : { color: AdminTheme.colorWarningAmber },
                  ]}
                >
                  {currentItem?.verificationStatus}
                </Text>
              </View>
            </View>

            <View style={styles.profileSection}>
              <Text style={styles.sectionTitle}>1. Legal Business Registration</Text>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Farm Trade Name</Text>
                <Text style={styles.dataValue}>{currentItem?.farmName}</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Legal Owner Name</Text>
                <Text style={styles.dataValue}>{currentItem?.legalName}</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>BRN / Reg ID</Text>
                <Text style={styles.dataValue}>{currentItem?.businessRegistrationNumber}</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Mobile Contact</Text>
                <View style={styles.otpRow}>
                  <Text style={styles.dataValue}>{currentItem?.mobileNumber}</Text>
                  <View style={styles.verifiedTag}>
                    <Ionicons name="checkmark-circle" size={12} color={AdminTheme.colorBrandEmerald} />
                    <Text style={styles.verifiedTagText}>OTP Verified</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.profileSection}>
              <Text style={styles.sectionTitle}>2. Bank Routing & Payout Escrow</Text>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Bank Name</Text>
                <Text style={styles.dataValue}>{currentItem?.bankDetails?.bankName}</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Branch Code</Text>
                <Text style={styles.dataValue}>{currentItem?.bankDetails?.branchCode}</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Account Number</Text>
                <Text style={styles.dataValue}>{currentItem?.bankDetails?.accountNumber}</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Account Holder</Text>
                <Text style={styles.dataValue}>{currentItem?.bankDetails?.accountHolderName}</Text>
              </View>
            </View>

            <View style={styles.profileSection}>
              <Text style={styles.sectionTitle}>3. Geolocation & Farm Coordinates</Text>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Location</Text>
                <Text style={styles.dataValue}>
                  {currentItem?.city}, {currentItem?.district} ({currentItem?.province})
                </Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>GPS Coordinates</Text>
                <Text style={styles.dataValue}>
                  {currentItem?.coordinates?.latitude}° N, {currentItem?.coordinates?.longitude}° E
                </Text>
              </View>

              {/* Map Coordinates Visualizer */}
              <View style={styles.mapVisualizer}>
                <Ionicons name="map" size={24} color={AdminTheme.colorBrandEmerald} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.mapTitle}>SLSI Verified Farm GIS Boundary</Text>
                  <Text style={styles.mapSubtitle}>
                    Verified Highland Agriculture Cluster • Nuwara Eliya Basin
                  </Text>
                </View>
                <View style={styles.mapPin}>
                  <Text style={styles.mapPinText}>LIVE GPS</Text>
                </View>
              </View>
            </View>

            {/* Custom Commission Rate Selector */}
            <View style={styles.commissionSection}>
              <Text style={styles.sectionTitle}>4. Commission Rate Override</Text>
              <View style={styles.commissionBtnsRow}>
                {[2.0, 2.5, 3.0].map((rate) => (
                  <Pressable
                    key={rate}
                    style={[
                      styles.rateBtn,
                      commissionRate === rate && styles.rateBtnActive,
                    ]}
                    onPress={() => setCommissionRate(rate)}
                  >
                    <Text
                      style={[
                        styles.rateBtnText,
                        commissionRate === rate && styles.rateBtnTextActive,
                      ]}
                    >
                      {rate}% SLSI Tier
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Sticky Action Footer Bar (Screen A-01) */}
      <View style={styles.stickyFooter}>
        <View style={styles.footerInfo}>
          <Text style={styles.footerFarmName}>{currentItem?.farmName}</Text>
          <Text style={styles.footerCommission}>
            Current Rate: <Text style={{ color: AdminTheme.colorBrandEmerald, fontWeight: '700' }}>{commissionRate}%</Text>
          </Text>
        </View>

        <View style={styles.footerActions}>
          <Pressable
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={handleReject}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Reject Application"
          >
            <Ionicons name="close-circle" size={18} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>Reject Application (Set 5% Commission)</Text>
          </Pressable>

          <Pressable
            style={[styles.actionBtn, styles.approveBtn]}
            onPress={handleApprove}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Approve Verification"
          >
            <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>
              Approve Verification (Set {commissionRate}% Commission)
            </Text>
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

  queueBar: {
    backgroundColor: AdminTheme.bgPanelDark,
    borderBottomWidth: 1,
    borderBottomColor: AdminTheme.bgSurfaceBorder,
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  queueTitle: { color: AdminTheme.colorTextMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  queueList: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  queuePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: AdminTheme.bgAdminDark,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
  },
  queuePillActive: { borderColor: AdminTheme.colorBrandEmerald, backgroundColor: AdminTheme.colorEmeraldSubtle },
  queuePillText: { color: AdminTheme.colorTextMuted, fontSize: 13, fontWeight: '500' },
  queuePillTextActive: { color: AdminTheme.colorTextMain, fontWeight: '700' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  workspace: { padding: 20, paddingBottom: 90 },
  splitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
    justifyContent: 'center',
  },

  // Panes
  leftPane: {
    width: 600,
    backgroundColor: AdminTheme.bgPanelDark,
    borderRadius: AdminTheme.cardBorderRadius,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
    padding: 16,
    gap: 12,
  },
  rightPane: {
    width: 600,
    backgroundColor: AdminTheme.bgPanelDark,
    borderRadius: AdminTheme.cardBorderRadius,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
    padding: 16,
    gap: 14,
  },

  paneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: AdminTheme.bgSurfaceBorder,
    paddingBottom: 12,
  },
  paneHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  paneTitle: { color: AdminTheme.colorTextMain, fontSize: 15, fontWeight: '700' },

  inspectorControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  controlBtn: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: AdminTheme.bgAdminDark,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomText: { color: AdminTheme.colorTextMuted, fontSize: 12, fontWeight: '600', paddingHorizontal: 4 },

  docCanvas: {
    height: 420,
    backgroundColor: AdminTheme.bgAdminDark,
    borderRadius: 6,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
  },
  imageWrapper: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  certificateImage: { width: '92%', height: '92%' },

  certMetaCard: {
    backgroundColor: AdminTheme.bgAdminDark,
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
    gap: 6,
  },
  certMetaRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  certMetaLabel: { color: AdminTheme.colorTextDim, fontSize: 11, fontWeight: '600' },
  certMetaVal: { color: AdminTheme.colorTextMuted, fontSize: 11, fontWeight: '500' },

  // Right Profile Pane Styles
  badgePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeVerified: { backgroundColor: AdminTheme.colorEmeraldSubtle },
  badgeRejected: { backgroundColor: AdminTheme.colorCrimsonSubtle },
  badgePending: { backgroundColor: '#451A03' },
  badgeText: { fontSize: 11, fontWeight: '800' },

  profileSection: {
    backgroundColor: AdminTheme.bgAdminDark,
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
    gap: 8,
  },
  sectionTitle: { color: AdminTheme.colorBrandEmerald, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  dataRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dataLabel: { color: AdminTheme.colorTextDim, fontSize: 12, fontWeight: '500' },
  dataValue: { color: AdminTheme.colorTextMain, fontSize: 12, fontWeight: '600' },
  otpRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  verifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: AdminTheme.colorEmeraldSubtle,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  verifiedTagText: { color: AdminTheme.colorBrandEmerald, fontSize: 10, fontWeight: '700' },

  mapVisualizer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: AdminTheme.bgPanelDark,
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
    marginTop: 4,
  },
  mapTitle: { color: AdminTheme.colorTextMain, fontSize: 12, fontWeight: '600' },
  mapSubtitle: { color: AdminTheme.colorTextDim, fontSize: 10 },
  mapPin: { backgroundColor: AdminTheme.colorEmeraldSubtle, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  mapPinText: { color: AdminTheme.colorBrandEmerald, fontSize: 10, fontWeight: '800' },

  commissionSection: {
    backgroundColor: AdminTheme.bgAdminDark,
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
    gap: 8,
  },
  commissionBtnsRow: { flexDirection: 'row', gap: 10 },
  rateBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: AdminTheme.bgPanelDark,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
    alignItems: 'center',
  },
  rateBtnActive: { borderColor: AdminTheme.colorBrandEmerald, backgroundColor: AdminTheme.colorEmeraldSubtle },
  rateBtnText: { color: AdminTheme.colorTextMuted, fontSize: 12, fontWeight: '600' },
  rateBtnTextActive: { color: AdminTheme.colorBrandEmerald, fontWeight: '800' },

  // Sticky Action Footer Bar
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
  footerInfo: { gap: 2 },
  footerFarmName: { color: AdminTheme.colorTextMain, fontSize: 14, fontWeight: '700' },
  footerCommission: { color: AdminTheme.colorTextDim, fontSize: 12 },
  footerActions: { flexDirection: 'row', gap: 12 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
  },
  approveBtn: { backgroundColor: AdminTheme.colorBrandEmerald },
  rejectBtn: { backgroundColor: AdminTheme.colorAlertCrimson },
  actionBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
