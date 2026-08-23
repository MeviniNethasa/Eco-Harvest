// src/admin/AdminVerificationDeskScreen.tsx
//
// Screen A-01: Verification Request Desk (SLSI Certificate Audit)
// Web-only Desktop Admin Command Panel.
//
// ARCHITECTURE NOTE: this screen is intentionally isolated from the mobile
// app's tab navigation. It is not registered in `TabNavigator.tsx` and does
// not import from it — it's meant to be mounted as its own top-level web
// route/entry point (e.g. an Expo Router `app/admin/verification-desk.tsx`,
// or a separate web bundle entry) alongside the mobile navigator, not
// nested inside it. Nothing in this file assumes React Navigation's mobile
// tab/stack context.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Image, StyleSheet, Platform } from 'react-native';
import { VerificationRequest } from '../types';
import {
  approveVerificationRequest,
  getSampleVerificationRequests,
  getVerificationRequests,
  rejectVerificationRequest,
  subscribeToVerificationQueueAcrossTabs,
  subscribeToVerificationRequests,
  upsertVerificationRequest,
} from '../utils/storage';
import { adminApi } from '../services/api';

// ---------------------------------------------------------------------------
// Design tokens (from Screen A-01's design.md — Section 1: Color Tokens)
// ---------------------------------------------------------------------------
const tokens = {
  colorPrimaryGreen: '#15803D',
  colorAlertCrimson: '#DC2626',
  colorBgSidebar: '#1E293B',
  colorBgWorkspace: '#F8FAFC',
  colorBgPane: '#FFFFFF',
  colorBorderGray: '#E2E8F0',
  colorTextDark: '#0F172A',
  colorTextMuted: '#64748B',
};

const SIDEBAR_WIDTH = 240;
const PANE_WIDTH = 600;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

const SIDEBAR_NAV_ITEMS = [
  'Admin Dashboard',
  'SLSI Verification Desk',
  'Marketplace Oversight',
  'Settings',
] as const;

// ---------------------------------------------------------------------------
// Small formatting helpers
// ---------------------------------------------------------------------------
function formatSubmittedAt(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusBadgeStyle(status: VerificationRequest['verificationStatus']) {
  switch (status) {
    case 'VERIFIED':
      return { bg: '#DCFCE7', fg: tokens.colorPrimaryGreen, label: 'Verified' };
    case 'REJECTED':
      return { bg: '#FEE2E2', fg: tokens.colorAlertCrimson, label: 'Rejected' };
    case 'PENDING':
    default:
      return { bg: '#FEF3C7', fg: '#D97706', label: 'Pending Review' };
  }
}

// ---------------------------------------------------------------------------
// Right Profile Pane: one labeled row of the merchant summary data sheet
// ---------------------------------------------------------------------------
const ProfileRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.profileRow}>
    <Text style={styles.profileRowLabel}>{label}</Text>
    <Text style={styles.profileRowValue}>{value}</Text>
  </View>
);

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function AdminVerificationDeskScreen() {
  const [queue, setQueue] = useState<VerificationRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedFarmerId, setSelectedFarmerId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Left Inspection Pane document viewer controls
  const [zoom, setZoom] = useState(1);
  const [rotationDeg, setRotationDeg] = useState(0);

  // `silent` skips the full-screen "Loading verification requests…" state
  // — used by the window-focus listener and the manual Refresh Queue
  // button below, so re-fetching doesn't flash the workspace empty while
  // the admin is mid-review. The very first mount load still shows it.
  const loadQueue = useCallback(async (silent: boolean = false) => {
    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    try {
      let requests: VerificationRequest[] = [];
      try {
        const res = await adminApi.getVerifications();
        if (Array.isArray(res)) {
          requests = res as any;
        } else if (res && Array.isArray((res as any).verifications)) {
          requests = (res as any).verifications;
        } else if (res && Array.isArray(res.data)) {
          requests = res.data as any;
        } else if (res && res.data && Array.isArray((res.data as any).verifications)) {
          requests = (res.data as any).verifications;
        }
      } catch (apiErr) {
        console.log('Admin backend sync notice:', apiErr);
      }

      if (!requests || requests.length === 0) {
        requests = await getVerificationRequests();
      }

      setQueue(requests);
      setSelectedFarmerId((current) => {
        if (current && requests.some((r) => r.farmerId === current)) return current;
        const firstPending = requests.find((r) => r.verificationStatus === 'PENDING');
        return firstPending ? firstPending.farmerId : requests[0]?.farmerId ?? null;
      });
    } catch (err) {
      console.error('Failed to load verification requests:', err);
    } finally {
      if (silent) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Stay live while mounted, same pub/sub pattern as the rest of the app,
  // so an override applied from *this* tab (e.g. Approve/Reject below, or
  // the Dev Sandbox buttons) reflects immediately. This only covers
  // same-tab changes — see the cross-tab subscription right below it for
  // the actual farmer-submits-from-another-tab case.
  useEffect(() => {
    const unsubscribe = subscribeToVerificationRequests(setQueue);
    return unsubscribe;
  }, []);

  // The real-time bridge for the bug this screen exists to fix: a farmer
  // submitting (or changing) their onboarding profile from a *different*
  // browser tab than this one. `subscribeToVerificationRequests` above
  // can't see that write — it's a different JS module instance — so this
  // uses BroadcastChannel/the native `storage` event under the hood (see
  // `subscribeToVerificationQueueAcrossTabs` in storage.ts) to react the
  // instant another tab's queue write lands, no manual refresh needed.
  // Silent refresh, same as the focus/visibility listeners below, so the
  // workspace doesn't flash empty mid-review.
  useEffect(() => {
    const unsubscribe = subscribeToVerificationQueueAcrossTabs(() => {
      loadQueue(true);
    });
    return unsubscribe;
  }, [loadQueue]);

  // This screen is intentionally a standalone web route rather than a
  // React Navigation stack/tab screen (see the ARCHITECTURE NOTE at the
  // top of this file), so `useFocusEffect` isn't available here — there's
  // no navigator to report focus events. Window focus/visibility are kept
  // as a belt-and-suspenders fallback alongside the cross-tab subscription
  // above (e.g. covers a tab that was frozen/backgrounded long enough that
  // the browser deferred delivering the BroadcastChannel message until it
  // regains focus).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleWindowFocus = () => {
      loadQueue(true);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadQueue(true);
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadQueue]);

  // Backs the sidebar's "[ 🔄 Refresh Queue ]" button — lets the admin
  // manually re-fetch the queue on demand rather than only relying on the
  // window-focus listener above (e.g. if the browser tab never lost
  // focus, or the admin just wants to be sure they're looking at the
  // latest state).
  const handleManualRefresh = () => {
    loadQueue(true);
  };

  const selectedRequest =
    queue.find((r) => r.farmerId === selectedFarmerId) ?? null;

  // Reset the document viewer controls whenever the selected application
  // changes, so zoom/rotation from a previous certificate doesn't carry
  // over to the next one.
  useEffect(() => {
    setZoom(1);
    setRotationDeg(0);
  }, [selectedFarmerId]);

  const pendingQueue = queue.filter((r) => r.verificationStatus === 'PENDING');

  const handleSelectRequest = (farmerId: string) => {
    setSelectedFarmerId(farmerId);
  };

  const advanceToNextPending = (resolvedFarmerId: string, requests: VerificationRequest[]) => {
    const stillPending = requests.filter(
      (r) => r.verificationStatus === 'PENDING' && r.farmerId !== resolvedFarmerId
    );
    setSelectedFarmerId(stillPending[0]?.farmerId ?? null);
  };

  const handleApprove = async () => {
    if (!selectedRequest || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const updated = await approveVerificationRequest(selectedRequest.farmerId);
      setQueue(updated);
      advanceToNextPending(selectedRequest.farmerId, updated);
    } catch (err) {
      console.error('Failed to approve verification request:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const updated = await rejectVerificationRequest(selectedRequest.farmerId);
      setQueue(updated);
      advanceToNextPending(selectedRequest.farmerId, updated);
    } catch (err) {
      console.error('Failed to reject verification request:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---- Developer Sandbox Toolbar ----
  const handleLoadValidApp = async () => {
    const { valid } = getSampleVerificationRequests();
    const fresh: VerificationRequest = { ...valid, submittedAt: new Date().toISOString() };
    try {
      const updated = await upsertVerificationRequest(fresh);
      setQueue(updated);
      setSelectedFarmerId(fresh.farmerId);
    } catch (err) {
      console.error('Failed to load sample valid SLSI application:', err);
    }
  };

  const handleLoadSuspiciousApp = async () => {
    const { suspicious } = getSampleVerificationRequests();
    const fresh: VerificationRequest = { ...suspicious, submittedAt: new Date().toISOString() };
    try {
      const updated = await upsertVerificationRequest(fresh);
      setQueue(updated);
      setSelectedFarmerId(fresh.farmerId);
    } catch (err) {
      console.error('Failed to load sample suspicious application:', err);
    }
  };

  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100));
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100));
  const rotate = () => setRotationDeg((r) => (r + 90) % 360);

  const hasCertificate = !!selectedRequest?.slsiCertificateUrl;

  return (
    <View style={styles.root}>
      {/* ---------------- Desktop Sidebar Navigation ---------------- */}
      <View style={styles.sidebar}>
        <Text style={styles.sidebarBrand}>EcoHarvest Admin</Text>
        {SIDEBAR_NAV_ITEMS.map((item) => {
          const active = item === 'SLSI Verification Desk';
          return (
            <View
              key={item}
              style={[styles.sidebarItem, active && styles.sidebarItemActive]}
            >
              <Text style={[styles.sidebarItemText, active && styles.sidebarItemTextActive]}>
                {item}
              </Text>
            </View>
          );
        })}

        <View style={styles.sidebarQueue}>
          <View style={styles.sidebarQueueHeaderRow}>
            <Text style={styles.sidebarQueueLabel}>
              PENDING QUEUE ({pendingQueue.length})
            </Text>
            <Pressable
              style={styles.sidebarRefreshButton}
              onPress={handleManualRefresh}
              disabled={isRefreshing}
              hitSlop={6}
            >
              <Text style={styles.sidebarRefreshButtonText}>
                {isRefreshing ? '🔄 …' : '🔄 Refresh Queue'}
              </Text>
            </Pressable>
          </View>

          {pendingQueue.length === 0 ? (
            <Text style={styles.sidebarQueueEmptyText}>
              No pending applications right now.
            </Text>
          ) : (
            pendingQueue.map((r) => (
              <Pressable
                key={r.farmerId}
                style={[
                  styles.sidebarQueueItem,
                  r.farmerId === selectedFarmerId && styles.sidebarQueueItemActive,
                ]}
                onPress={() => handleSelectRequest(r.farmerId)}
              >
                <Text style={styles.sidebarQueueItemText} numberOfLines={1}>
                  {r.legalName}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      </View>

      {/* ---------------- Main Desktop Workspace ---------------- */}
      <View style={styles.workspace}>
        <ScrollView contentContainerStyle={styles.workspaceScrollContent}>
          <Text style={styles.workspaceHeading}>Verification Request Desk</Text>
          <Text style={styles.workspaceSubheading}>SLSI Certificate Audit</Text>

          {isLoading ? (
            <Text style={styles.emptyStateText}>Loading verification requests…</Text>
          ) : !selectedRequest ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                No pending SLSI applications right now.
              </Text>
              <Text style={styles.emptyStateSubtext}>
                Use the Developer Sandbox Toolbar below to load a sample application.
              </Text>
            </View>
          ) : (
            <View style={styles.splitScreen}>
              {/* ---------------- Left Inspection Pane ---------------- */}
              <View style={styles.pane}>
                <View style={styles.paneHeaderRow}>
                  <Text style={styles.paneHeading}>Document Inspection</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: statusBadgeStyle(selectedRequest.verificationStatus).bg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        { color: statusBadgeStyle(selectedRequest.verificationStatus).fg },
                      ]}
                    >
                      {statusBadgeStyle(selectedRequest.verificationStatus).label}
                    </Text>
                  </View>
                </View>

                <View style={styles.documentViewer}>
                  {hasCertificate ? (
                    <ScrollView
                      style={styles.documentScroll}
                      contentContainerStyle={styles.documentScrollContent}
                      horizontal
                    >
                      <View style={styles.documentImageWrapper}>
                        <Image
                          source={{ uri: selectedRequest.slsiCertificateUrl }}
                          style={[
                            styles.documentImage,
                            {
                              transform: [
                                { scale: zoom },
                                { rotate: `${rotationDeg}deg` },
                              ],
                            },
                          ]}
                          resizeMode="contain"
                        />
                      </View>
                    </ScrollView>
                  ) : (
                    <View style={styles.documentMissing}>
                      <Text style={styles.documentMissingTitle}>
                        No SLSI Certificate Asset Found
                      </Text>
                      <Text style={styles.documentMissingSubtext}>
                        This application is missing the required SLSI certificate
                        upload — treat with caution.
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.docControlsRow}>
                  <Pressable
                    style={styles.docControlButton}
                    onPress={zoomOut}
                    disabled={!hasCertificate}
                  >
                    <Text style={styles.docControlButtonText}>−</Text>
                  </Pressable>
                  <Text style={styles.docControlZoomLabel}>{Math.round(zoom * 100)}%</Text>
                  <Pressable
                    style={styles.docControlButton}
                    onPress={zoomIn}
                    disabled={!hasCertificate}
                  >
                    <Text style={styles.docControlButtonText}>+</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.docControlButton, styles.docControlButtonWide]}
                    onPress={rotate}
                    disabled={!hasCertificate}
                  >
                    <Text style={styles.docControlButtonText}>Rotate</Text>
                  </Pressable>
                </View>
              </View>

              {/* ---------------- Right Profile Pane ---------------- */}
              <View style={styles.pane}>
                <Text style={styles.paneHeading}>Merchant Profile</Text>

                <Text style={styles.merchantName}>{selectedRequest.legalName}</Text>
                <Text style={styles.merchantSubmitted}>
                  Submitted {formatSubmittedAt(selectedRequest.submittedAt)}
                </Text>

                <View style={styles.profileSection}>
                  <ProfileRow
                    label="Business Registration No."
                    value={selectedRequest.businessRegistrationNo}
                  />
                  <ProfileRow label="Mobile Contact" value={selectedRequest.mobileNumber} />
                </View>

                <View style={styles.profileSectionDivider} />

                <Text style={styles.profileSectionLabel}>BANK ROUTING &amp; ACCOUNT DETAILS</Text>
                <View style={styles.profileSection}>
                  <ProfileRow label="Bank Name" value={selectedRequest.bankDetails.bankName} />
                  <ProfileRow
                    label="Routing / Branch Code"
                    value={selectedRequest.bankDetails.branchCode}
                  />
                  <ProfileRow
                    label="Account Number"
                    value={selectedRequest.bankDetails.accountNumber}
                  />
                  <ProfileRow
                    label="Account Holder"
                    value={selectedRequest.bankDetails.accountHolderName}
                  />
                </View>

                <View style={styles.profileSectionDivider} />

                <Text style={styles.profileSectionLabel}>FARM GPS COORDINATES</Text>
                <View style={styles.profileSection}>
                  <ProfileRow
                    label="Latitude / Longitude"
                    value={`${selectedRequest.farmCoordinates.latitude.toFixed(4)}, ${selectedRequest.farmCoordinates.longitude.toFixed(4)}`}
                  />
                  <ProfileRow
                    label="District"
                    value={selectedRequest.farmCoordinates.district}
                  />
                </View>

                <View style={styles.profileSectionDivider} />
                <ProfileRow
                  label="Current Commission Tier"
                  value={`${selectedRequest.commissionRate}%`}
                />
              </View>
            </View>
          )}
        </ScrollView>

        {/* ---------------- Sticky Admin Override Action Row ---------------- */}
        {selectedRequest && (
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.actionButton, styles.approveButton, isSubmitting && styles.actionButtonDisabled]}
              onPress={handleApprove}
              disabled={isSubmitting}
            >
              <Text style={styles.actionButtonText}>
                Approve Verification (Set 2–3% Commission)
              </Text>
            </Pressable>
            <Pressable
              style={[styles.actionButton, styles.rejectButton, isSubmitting && styles.actionButtonDisabled]}
              onPress={handleReject}
              disabled={isSubmitting}
            >
              <Text style={styles.actionButtonText}>
                Reject Application (Set 5% Commission / Default)
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* ---------------- Developer Sandbox Toolbar ---------------- */}
      <View style={styles.devToolbar}>
        <Text style={styles.devToolbarCaption}>DEV SANDBOX</Text>
        <Pressable style={styles.devButton} onPress={handleLoadValidApp}>
          <Text style={styles.devButtonText}>Load Valid SLSI App</Text>
        </Pressable>
        <Pressable style={styles.devButton} onPress={handleLoadSuspiciousApp}>
          <Text style={styles.devButtonText}>Load Suspicious App</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles — mapped directly to tokens from Screen A-01's design.md
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: tokens.colorBgWorkspace,
    minHeight: '100%' as any,
  },

  // ---- Sidebar ----
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: tokens.colorBgSidebar,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  sidebarBrand: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 24,
  },
  sidebarItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  sidebarItemActive: {
    backgroundColor: 'rgba(21,128,61,0.25)',
  },
  sidebarItemText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '500',
  },
  sidebarItemTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  sidebarQueue: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 16,
  },
  sidebarQueueHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 6,
  },
  sidebarQueueLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  sidebarRefreshButton: {
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0F172A',
  },
  sidebarRefreshButtonText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
  },
  sidebarQueueEmptyText: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 16,
  },
  sidebarQueueItem: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginBottom: 2,
  },
  sidebarQueueItemActive: {
    backgroundColor: '#334155',
  },
  sidebarQueueItemText: {
    color: '#E2E8F0',
    fontSize: 12,
  },

  // ---- Workspace ----
  workspace: {
    flex: 1,
  },
  workspaceScrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  workspaceHeading: {
    fontSize: 22,
    fontWeight: '700',
    color: tokens.colorTextDark,
  },
  workspaceSubheading: {
    fontSize: 13,
    color: tokens.colorTextMuted,
    marginBottom: 20,
  },
  emptyState: {
    backgroundColor: tokens.colorBgPane,
    borderWidth: 1,
    borderColor: tokens.colorBorderGray,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: tokens.colorTextDark,
    fontWeight: '600',
  },
  emptyStateSubtext: {
    fontSize: 12,
    color: tokens.colorTextMuted,
    marginTop: 6,
  },

  // ---- Split-screen dual panes ----
  splitScreen: {
    flexDirection: 'row',
    gap: 20,
  },
  pane: {
    width: PANE_WIDTH,
    backgroundColor: tokens.colorBgPane,
    borderWidth: 1,
    borderColor: tokens.colorBorderGray,
    borderRadius: 12,
    padding: 16,
  },
  paneHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  paneHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: tokens.colorTextDark,
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // ---- Left pane: document viewer ----
  documentViewer: {
    height: 360,
    borderWidth: 1,
    borderColor: tokens.colorBorderGray,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
  },
  documentScroll: {
    flex: 1,
  },
  documentScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '100%' as any,
  },
  documentImageWrapper: {
    width: 500,
    height: 340,
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentImage: {
    width: 460,
    height: 320,
  },
  documentMissing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: tokens.colorAlertCrimson,
    borderStyle: 'dashed',
    margin: 8,
    borderRadius: 6,
  },
  documentMissingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: tokens.colorAlertCrimson,
    marginBottom: 6,
    textAlign: 'center',
  },
  documentMissingSubtext: {
    fontSize: 12,
    color: tokens.colorTextMuted,
    textAlign: 'center',
  },
  docControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 12,
  },
  docControlButton: {
    minWidth: 36,
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: tokens.colorBorderGray,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colorBgPane,
    paddingHorizontal: 10,
  },
  docControlButtonWide: {
    minWidth: 72,
  },
  docControlButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: tokens.colorTextDark,
  },
  docControlZoomLabel: {
    fontSize: 12,
    color: tokens.colorTextMuted,
    minWidth: 42,
    textAlign: 'center',
  },

  // ---- Right pane: merchant profile ----
  merchantName: {
    fontSize: 17,
    fontWeight: '700',
    color: tokens.colorTextDark,
  },
  merchantSubmitted: {
    fontSize: 12,
    color: tokens.colorTextMuted,
    marginBottom: 16,
  },
  profileSection: {
    marginBottom: 4,
  },
  profileSectionDivider: {
    height: 1,
    backgroundColor: tokens.colorBorderGray,
    marginVertical: 14,
  },
  profileSectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: tokens.colorTextMuted,
    marginBottom: 8,
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  profileRowLabel: {
    fontSize: 12,
    color: tokens.colorTextMuted,
  },
  profileRowValue: {
    fontSize: 13,
    fontWeight: '600',
    color: tokens.colorTextDark,
  },

  // ---- Sticky admin override action row ----
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: tokens.colorBorderGray,
    backgroundColor: tokens.colorBgPane,
  },
  actionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveButton: {
    backgroundColor: tokens.colorPrimaryGreen,
  },
  rejectButton: {
    backgroundColor: tokens.colorAlertCrimson,
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },

  // ---- Developer Sandbox floating toolbar ----
  devToolbar: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  devToolbarCaption: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginRight: 4,
  },
  devButton: {
    minHeight: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4B5563',
    backgroundColor: '#1F2937',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  devButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#E5E7EB',
  },
});