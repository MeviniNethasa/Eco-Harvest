// src/admin/screens/ModeratedChatTab.tsx
//
// Screen A-02: Moderated Chat Interception Feed
// Master-detail flagged message table with Crimson Text Highlighter and
// Admin Governance Override Actions (Allow / Block / Suspend).

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

interface FlaggedTicket {
  ticketId: string;
  timestamp: string;
  conversationId: string;
  buyerId: string;
  farmerId: string;
  offendingSnippet: string;
  highlightedTerms: string[];
  violationCategory: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'INTERCEPTED' | 'RELEASED' | 'BLOCKED' | 'MERCHANT_SUSPENDED';
  fullContext: Array<{ sender: string; text: string; time: string }>;
}

export default function ModeratedChatTab() {
  const [tickets, setTickets] = useState<FlaggedTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadTickets = async () => {
    try {
      setIsLoading(true);
      const res = await adminApi.getModeratedChats();
      if (res && res.data) {
        setTickets(res.data);
        if (res.data.length > 0 && !selectedTicketId) {
          setSelectedTicketId(res.data[0].ticketId);
        }
      }
    } catch (err) {
      console.warn('Moderated chats load notice:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const currentTicket =
    tickets.find((t) => t.ticketId === selectedTicketId) || tickets[0];

  const filteredTickets = tickets.filter((t) => {
    if (filterCategory === 'ALL') return true;
    if (filterCategory === 'HIGH') return t.severity === 'HIGH';
    if (filterCategory === 'INTERCEPTED') return t.status === 'INTERCEPTED';
    return true;
  });

  const handleAction = async (action: 'ALLOW' | 'BLOCK' | 'SUSPEND') => {
    if (!currentTicket) return;
    try {
      setIsSubmitting(true);
      await adminApi.overrideModeration(currentTicket.ticketId, action);

      let newStatus: FlaggedTicket['status'] = 'INTERCEPTED';
      let title = '';
      if (action === 'ALLOW') {
        newStatus = 'RELEASED';
        title = 'Message Released to Recipient';
      } else if (action === 'BLOCK') {
        newStatus = 'BLOCKED';
        title = 'Message Blocked Permanently';
      } else if (action === 'SUSPEND') {
        newStatus = 'MERCHANT_SUSPENDED';
        title = 'Merchant Account Suspended';
      }

      Alert.alert(title, `Ticket ${currentTicket.ticketId} updated successfully.`);
      setTickets((prev) =>
        prev.map((t) => (t.ticketId === currentTicket.ticketId ? { ...t, status: newStatus } : t))
      );
    } catch (err: any) {
      Alert.alert('Action Failed', err?.message || 'Could not update ticket.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Renders message text with crimson highlighted snippets
  const renderHighlightedSnippet = (text: string, terms: string[]) => {
    if (!terms || terms.length === 0) {
      return <Text style={styles.chatMessageText}>{text}</Text>;
    }

    // Split text by highlighted terms
    const regex = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    const parts = text.split(regex);

    return (
      <Text style={styles.chatMessageText}>
        {parts.map((part, i) => {
          const isMatch = terms.some((term) => term.toLowerCase() === part.toLowerCase());
          if (isMatch) {
            return (
              <Text key={i} style={styles.crimsonHighlight}>
                {part}
              </Text>
            );
          }
          return <Text key={i}>{part}</Text>;
        })}
      </Text>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={AdminTheme.colorAlertCrimson} />
        <Text style={styles.loadingText}>Loading Moderated Chat Tickets...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Sub-header Filter Tabs */}
      <View style={styles.filterBar}>
        <View style={styles.filterLeft}>
          <Text style={styles.filterLabel}>Filter Feed:</Text>
          {['ALL', 'HIGH', 'INTERCEPTED'].map((cat) => (
            <Pressable
              key={cat}
              style={[styles.filterPill, filterCategory === cat && styles.filterPillActive]}
              onPress={() => setFilterCategory(cat)}
            >
              <Text style={[styles.filterPillText, filterCategory === cat && styles.filterPillTextActive]}>
                {cat === 'ALL' ? 'All Tickets' : cat === 'HIGH' ? 'High Severity' : 'Pending Intercepts'}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.activeStats}>
          <Text style={styles.statText}>
            Intercepted:{' '}
            <Text style={{ color: AdminTheme.colorAlertCrimson, fontWeight: '700' }}>
              {tickets.filter((t) => t.status === 'INTERCEPTED').length}
            </Text>
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.workspace}>
        <View style={styles.masterDetailLayout}>
          {/* Master Table (Left/Top) */}
          <View style={styles.masterCard}>
            <View style={styles.cardHeader}>
              <Ionicons name="shield" size={18} color={AdminTheme.colorAlertCrimson} />
              <Text style={styles.cardTitle}>Flagged Interception Queue</Text>
            </View>

            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableColHeader, { flex: 1.2 }]}>Ticket ID</Text>
              <Text style={[styles.tableColHeader, { flex: 1.8 }]}>Parties (Buyer / Farmer)</Text>
              <Text style={[styles.tableColHeader, { flex: 2.2 }]}>Violation Category</Text>
              <Text style={[styles.tableColHeader, { flex: 1 }]}>Severity</Text>
              <Text style={[styles.tableColHeader, { flex: 1.2 }]}>Status</Text>
            </View>

            {filteredTickets.map((t) => {
              const isSelected = t.ticketId === currentTicket?.ticketId;
              const isHigh = t.severity === 'HIGH';

              return (
                <Pressable
                  key={t.ticketId}
                  style={[styles.tableRow, isSelected && styles.tableRowSelected]}
                  onPress={() => setSelectedTicketId(t.ticketId)}
                >
                  <View style={{ flex: 1.2 }}>
                    <Text style={styles.ticketIdText}>{t.ticketId}</Text>
                    <Text style={styles.timeText}>
                      {new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>

                  <View style={{ flex: 1.8 }}>
                    <Text style={styles.buyerText}>👤 {t.buyerId.split(' ')[0]}</Text>
                    <Text style={styles.farmerText}>🏡 {t.farmerId.split(' ')[0]}</Text>
                  </View>

                  <View style={{ flex: 2.2 }}>
                    <Text style={styles.categoryText}>{t.violationCategory}</Text>
                    <Text style={styles.snippetPreview} numberOfLines={1}>
                      "{t.offendingSnippet}"
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={[styles.severityBadge, isHigh ? styles.severityHigh : styles.severityMed]}>
                      <Text style={[styles.severityText, isHigh ? { color: AdminTheme.colorAlertCrimson } : { color: AdminTheme.colorWarningAmber }]}>
                        {t.severity}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flex: 1.2 }}>
                    <View
                      style={[
                        styles.statusBadge,
                        t.status === 'RELEASED'
                          ? styles.statusReleased
                          : t.status === 'BLOCKED' || t.status === 'MERCHANT_SUSPENDED'
                          ? styles.statusBlocked
                          : styles.statusIntercepted,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          t.status === 'RELEASED'
                            ? { color: AdminTheme.colorBrandEmerald }
                            : t.status === 'BLOCKED' || t.status === 'MERCHANT_SUSPENDED'
                            ? { color: AdminTheme.colorAlertCrimson }
                            : { color: AdminTheme.colorWarningAmber },
                        ]}
                      >
                        {t.status}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Detail Drawer (Right/Bottom) */}
          <View style={styles.detailCard}>
            <View style={styles.cardHeader}>
              <Ionicons name="chatbubbles" size={18} color={AdminTheme.colorBrandEmerald} />
              <Text style={styles.cardTitle}>Interception Audit & Context ({currentTicket?.ticketId})</Text>
            </View>

            {/* Offending Highlight Banner */}
            <View style={styles.offendingBanner}>
              <View style={styles.bannerHeader}>
                <Ionicons name="warning" size={16} color={AdminTheme.colorAlertCrimson} />
                <Text style={styles.bannerTitle}>Detected Keyword / Contact Interception</Text>
              </View>
              <View style={styles.highlightedTextBox}>
                {renderHighlightedSnippet(
                  currentTicket?.offendingSnippet || '',
                  currentTicket?.highlightedTerms || []
                )}
              </View>
              <View style={styles.termsRow}>
                <Text style={styles.termsLabel}>Blacklisted strings detected:</Text>
                {currentTicket?.highlightedTerms.map((term, i) => (
                  <View key={i} style={styles.termPill}>
                    <Text style={styles.termPillText}>{term}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Conversation Log Thread */}
            <Text style={styles.threadTitle}>Conversation Context Leading to Interception:</Text>
            <View style={styles.chatThread}>
              {currentTicket?.fullContext.map((msg, i) => {
                const isFarmer = msg.sender === 'FARMER';
                return (
                  <View
                    key={i}
                    style={[
                      styles.chatBubbleWrapper,
                      isFarmer ? styles.bubbleFarmer : styles.bubbleBuyer,
                    ]}
                  >
                    <Text style={styles.bubbleSender}>
                      {isFarmer ? `🏡 ${currentTicket.farmerId}` : `👤 ${currentTicket.buyerId}`} • {msg.time}
                    </Text>
                    <View
                      style={[
                        styles.chatBubble,
                        isFarmer ? styles.chatBubbleFarmer : styles.chatBubbleBuyer,
                      ]}
                    >
                      {renderHighlightedSnippet(msg.text, currentTicket.highlightedTerms)}
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Admin Governance Override Actions */}
            <View style={styles.governanceActionsCard}>
              <Text style={styles.governanceTitle}>Admin Governance Actions</Text>
              <View style={styles.govBtnsRow}>
                <Pressable
                  style={[styles.govBtn, styles.allowBtn]}
                  onPress={() => handleAction('ALLOW')}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="Allow Message Override"
                >
                  <Ionicons name="checkmark-done" size={16} color="#FFFFFF" />
                  <Text style={styles.govBtnText}>Allow Message Override</Text>
                </Pressable>

                <Pressable
                  style={[styles.govBtn, styles.blockBtn]}
                  onPress={() => handleAction('BLOCK')}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="Block Message"
                >
                  <Ionicons name="hand-left" size={16} color="#FFFFFF" />
                  <Text style={styles.govBtnText}>Block Message Permanently</Text>
                </Pressable>

                <Pressable
                  style={[styles.govBtn, styles.suspendBtn]}
                  onPress={() => handleAction('SUSPEND')}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="Warn or Suspend Merchant"
                >
                  <Ionicons name="alert-circle" size={16} color="#FFFFFF" />
                  <Text style={styles.govBtnText}>Warn / Suspend Merchant</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AdminTheme.bgAdminDark },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: AdminTheme.bgAdminDark },
  loadingText: { color: AdminTheme.colorTextMuted, marginTop: 12, fontSize: 14 },

  filterBar: {
    backgroundColor: AdminTheme.bgPanelDark,
    borderBottomWidth: 1,
    borderBottomColor: AdminTheme.bgSurfaceBorder,
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  filterLabel: { color: AdminTheme.colorTextDim, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: AdminTheme.bgAdminDark,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
  },
  filterPillActive: { borderColor: AdminTheme.colorAlertCrimson, backgroundColor: AdminTheme.colorCrimsonSubtle },
  filterPillText: { color: AdminTheme.colorTextMuted, fontSize: 12, fontWeight: '600' },
  filterPillTextActive: { color: AdminTheme.colorTextMain, fontWeight: '700' },
  activeStats: { flexDirection: 'row', alignItems: 'center' },
  statText: { color: AdminTheme.colorTextMuted, fontSize: 12 },

  workspace: { padding: 20 },
  masterDetailLayout: { gap: 20 },

  // Master Table Card
  masterCard: {
    backgroundColor: AdminTheme.bgPanelDark,
    borderRadius: AdminTheme.cardBorderRadius,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
    padding: 16,
    gap: 10,
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
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: AdminTheme.bgPanelDark,
    borderBottomWidth: 1,
    borderBottomColor: AdminTheme.bgSurfaceBorder,
  },
  tableRowSelected: { backgroundColor: '#261B2E', borderColor: AdminTheme.colorAlertCrimson, borderWidth: 1 },
  ticketIdText: { color: AdminTheme.colorTextMain, fontSize: 12, fontWeight: '700' },
  timeText: { color: AdminTheme.colorTextDim, fontSize: 10 },
  buyerText: { color: AdminTheme.colorTextMain, fontSize: 11, fontWeight: '600' },
  farmerText: { color: AdminTheme.colorTextMuted, fontSize: 11 },
  categoryText: { color: AdminTheme.colorAlertCrimson, fontSize: 11, fontWeight: '700' },
  snippetPreview: { color: AdminTheme.colorTextDim, fontSize: 10, fontStyle: 'italic' },

  severityBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start' },
  severityHigh: { backgroundColor: AdminTheme.colorCrimsonSubtle },
  severityMed: { backgroundColor: '#451A03' },
  severityText: { fontSize: 10, fontWeight: '800' },

  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, alignSelf: 'flex-start' },
  statusReleased: { backgroundColor: AdminTheme.colorEmeraldSubtle },
  statusBlocked: { backgroundColor: AdminTheme.colorCrimsonSubtle },
  statusIntercepted: { backgroundColor: '#451A03' },
  statusBadgeText: { fontSize: 10, fontWeight: '800' },

  // Detail Card
  detailCard: {
    backgroundColor: AdminTheme.bgPanelDark,
    borderRadius: AdminTheme.cardBorderRadius,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
    padding: 16,
    gap: 14,
  },

  offendingBanner: {
    backgroundColor: '#3F1219',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: AdminTheme.colorAlertCrimson,
    padding: 12,
    gap: 8,
  },
  bannerHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bannerTitle: { color: AdminTheme.colorAlertCrimson, fontSize: 12, fontWeight: '700' },
  highlightedTextBox: {
    backgroundColor: AdminTheme.bgAdminDark,
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
  },
  crimsonHighlight: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    color: '#F87171',
    fontWeight: '800',
    paddingHorizontal: 4,
    borderRadius: 3,
  },
  termsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  termsLabel: { color: AdminTheme.colorTextDim, fontSize: 11 },
  termPill: {
    backgroundColor: AdminTheme.colorCrimsonSubtle,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: AdminTheme.colorAlertCrimson,
  },
  termPillText: { color: '#FCA5A5', fontSize: 10, fontWeight: '700' },

  threadTitle: { color: AdminTheme.colorTextMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  chatThread: {
    backgroundColor: AdminTheme.bgAdminDark,
    borderRadius: 6,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
  },
  chatBubbleWrapper: { gap: 4, maxWidth: '85%' },
  bubbleFarmer: { alignSelf: 'flex-start' },
  bubbleBuyer: { alignSelf: 'flex-end' },
  bubbleSender: { color: AdminTheme.colorTextDim, fontSize: 10, fontWeight: '600' },
  chatBubble: { padding: 10, borderRadius: 8 },
  chatBubbleFarmer: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: AdminTheme.bgSurfaceBorder },
  chatBubbleBuyer: { backgroundColor: '#064E3B', borderWidth: 1, borderColor: AdminTheme.colorBrandEmerald },
  chatMessageText: { color: AdminTheme.colorTextMain, fontSize: 13, lineHeight: 18 },

  // Governance Action Bar
  governanceActionsCard: {
    backgroundColor: AdminTheme.bgAdminDark,
    borderRadius: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
    gap: 10,
  },
  governanceTitle: { color: AdminTheme.colorTextMain, fontSize: 13, fontWeight: '700' },
  govBtnsRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  govBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 6,
  },
  allowBtn: { backgroundColor: AdminTheme.colorBrandEmerald },
  blockBtn: { backgroundColor: AdminTheme.colorWarningAmber },
  suspendBtn: { backgroundColor: AdminTheme.colorAlertCrimson },
  govBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
