// src/admin/screens/HelpDeskTab.tsx
//
// Screen A-05: Help Desk & Dispute Resolution Desk (Admin Command Panel)
// Master-detail ticket management console with real-time customer and farmer
// chat response, dispute mediation, status workflows, and resolution recording.

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AdminTheme } from '../AdminTheme';
import { HelpTicket, HelpTicketPriority, HelpTicketStatus } from '../../types';
import { helpDeskApi } from '../../services/api';
import { getAllHelpTickets, sendHelpTicketReply, updateHelpTicketStatusLocal } from '../../utils/storage';

const QUICK_REPLIES = [
  {
    title: 'Uber Logistics Delay',
    text: 'Hello, our operations team contacted the Uber logistics driver. The vehicle is currently en route and estimated to arrive within 20 minutes.',
  },
  {
    title: 'Escrow Release Confirmed',
    text: 'We have verified your delivery confirmation. The Stripe escrow payment has been successfully released to the farmer bank account.',
  },
  {
    title: 'SLSI Audit Expedited',
    text: 'Thank you for submitting your SLS 1324 certificate. Our verification officer has queued your farm for an expedited 24-hour audit review.',
  },
  {
    title: 'Quality Refund Approved',
    text: 'We reviewed your crop freshness report. A full refund for the affected batch has been initiated back to your original payment method.',
  },
];

export default function HelpDeskTab() {
  const [tickets, setTickets] = useState<HelpTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [filterRole, setFilterRole] = useState<'ALL' | 'CUSTOMER' | 'FARMER'>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [replyText, setReplyText] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    inProgress: 0,
    resolved: 0,
    customerCount: 0,
    farmerCount: 0,
  });

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load stats
      const statRes = await helpDeskApi.getStats();
      if (statRes && statRes.data) {
        setStats({
          total: statRes.data.total,
          open: statRes.data.open,
          inProgress: statRes.data.inProgress,
          resolved: statRes.data.resolved,
          customerCount: statRes.data.customerCount,
          farmerCount: statRes.data.farmerCount,
        });
      }

      // Load tickets
      const all = await getAllHelpTickets();
      setTickets(all);
      if (all.length > 0 && !selectedTicketId) {
        setSelectedTicketId(all[0].ticketId);
        setResolutionNotes(all[0].resolutionNotes || '');
      }
    } catch (err) {
      console.warn('Help desk admin load notice:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const currentTicket =
    tickets.find((t) => t.ticketId === selectedTicketId) || tickets[0];

  useEffect(() => {
    if (currentTicket) {
      setResolutionNotes(currentTicket.resolutionNotes || '');
    }
  }, [selectedTicketId]);

  const filteredTickets = tickets.filter((t) => {
    if (filterRole !== 'ALL' && t.userRole !== filterRole) return false;
    if (filterStatus === 'OPEN' && t.status !== 'OPEN') return false;
    if (filterStatus === 'IN_PROGRESS' && t.status !== 'IN_PROGRESS') return false;
    if (filterStatus === 'RESOLVED' && t.status !== 'RESOLVED' && t.status !== 'CLOSED') return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        t.ticketId.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        t.userName.toLowerCase().includes(q) ||
        (t.orderId && t.orderId.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleSendReply = async () => {
    if (!replyText.trim() || !currentTicket) return;
    setIsSending(true);
    try {
      const updated = await sendHelpTicketReply(currentTicket.ticketId, {
        senderRole: 'ADMIN',
        senderId: 'admin_desk_01',
        senderName: 'EcoHarvest Admin Support',
        text: replyText.trim(),
      });

      if (updated) {
        setTickets((prev) =>
          prev.map((t) => (t.ticketId === currentTicket.ticketId ? updated : t))
        );
      }
      setReplyText('');
      Alert.alert('Message Sent', `Official response sent to ${currentTicket.userName}.`);
    } catch (err: any) {
      Alert.alert('Send Error', err?.message || 'Could not send response.');
    } finally {
      setIsSending(false);
    }
  };

  const handleUpdateStatus = async (status: HelpTicketStatus) => {
    if (!currentTicket) return;
    try {
      const updated = await updateHelpTicketStatusLocal(
        currentTicket.ticketId,
        status,
        resolutionNotes.trim() || undefined,
        'EcoHarvest Admin Support'
      );

      if (updated) {
        setTickets((prev) =>
          prev.map((t) => (t.ticketId === currentTicket.ticketId ? updated : t))
        );
      }
      Alert.alert('Status Updated', `Ticket ${currentTicket.ticketId} marked as ${status}.`);
    } catch (err: any) {
      Alert.alert('Update Failed', err?.message || 'Could not update status.');
    }
  };

  const getStatusBadge = (s: HelpTicketStatus) => {
    switch (s) {
      case 'OPEN':
        return { label: 'Open', bg: '#FEF3C7', fg: '#D97706' };
      case 'IN_PROGRESS':
        return { label: 'In Progress', bg: '#DBEAFE', fg: '#2563EB' };
      case 'RESOLVED':
        return { label: 'Resolved', bg: '#DCFCE7', fg: '#15803D' };
      case 'CLOSED':
        return { label: 'Closed', bg: '#F3F4F6', fg: '#6B7280' };
    }
  };

  const getPriorityBadge = (p: HelpTicketPriority) => {
    switch (p) {
      case 'CRITICAL':
        return { label: 'Critical', bg: '#FEE2E2', fg: '#DC2626' };
      case 'HIGH':
        return { label: 'High', bg: '#FEF3C7', fg: '#D97706' };
      case 'MEDIUM':
        return { label: 'Medium', bg: '#DBEAFE', fg: '#2563EB' };
      case 'LOW':
        return { label: 'Low', bg: '#F3F4F6', fg: '#6B7280' };
    }
  };

  return (
    <View style={styles.container}>
      {/* ---------------- Metrics Summary Strip ---------------- */}
      <View style={styles.metricsBar}>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Total Inquiries</Text>
          <Text style={styles.metricValue}>{tickets.length}</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Pending Resolution</Text>
          <Text style={[styles.metricValue, { color: '#D97706' }]}>
            {tickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length}
          </Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Resolved Tickets</Text>
          <Text style={[styles.metricValue, { color: '#15803D' }]}>
            {tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED').length}
          </Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Customer Issues</Text>
          <Text style={styles.metricValue}>{tickets.filter((t) => t.userRole === 'CUSTOMER').length}</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Farmer Disputes</Text>
          <Text style={styles.metricValue}>{tickets.filter((t) => t.userRole === 'FARMER').length}</Text>
        </View>
      </View>

      {/* ---------------- Master-Detail Workspace ---------------- */}
      <View style={styles.workspace}>
        {/* Left Master List */}
        <View style={styles.leftPane}>
          {/* Search Box */}
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={AdminTheme.colorTextDim} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by ticket #, user name, order..."
              placeholderTextColor={AdminTheme.colorTextDim}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color={AdminTheme.colorTextDim} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Filter Chips */}
          <View style={styles.filterChipsRow}>
            {(['ALL', 'CUSTOMER', 'FARMER'] as const).map((r) => (
              <Pressable
                key={r}
                style={[styles.filterChip, filterRole === r && styles.filterChipActive]}
                onPress={() => setFilterRole(r)}
              >
                <Text style={[styles.filterChipText, filterRole === r && styles.filterChipTextActive]}>
                  {r === 'ALL' ? 'All Roles' : r === 'CUSTOMER' ? 'Customers' : 'Farmers'}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.filterChipsRow}>
            {(['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED'] as const).map((s) => (
              <Pressable
                key={s}
                style={[styles.filterChip, filterStatus === s && styles.filterChipActive]}
                onPress={() => setFilterStatus(s)}
              >
                <Text style={[styles.filterChipText, filterStatus === s && styles.filterChipTextActive]}>
                  {s.replace(/_/g, ' ')}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Ticket Cards List */}
          <ScrollView style={styles.ticketListScroll} showsVerticalScrollIndicator={false}>
            {isLoading ? (
              <ActivityIndicator style={{ marginTop: 40 }} color={AdminTheme.colorBrandEmerald} />
            ) : filteredTickets.length === 0 ? (
              <View style={styles.noResultsBox}>
                <Ionicons name="documents-outline" size={32} color={AdminTheme.colorTextDim} />
                <Text style={styles.noResultsText}>No tickets match current filters.</Text>
              </View>
            ) : (
              filteredTickets.map((t) => {
                const isSelected = currentTicket?.ticketId === t.ticketId;
                const sBadge = getStatusBadge(t.status);
                const pBadge = getPriorityBadge(t.priority);
                const lastMsg = t.messages[t.messages.length - 1];

                return (
                  <TouchableOpacity
                    key={t.ticketId}
                    style={[styles.ticketCard, isSelected && styles.ticketCardSelected]}
                    onPress={() => setSelectedTicketId(t.ticketId)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.ticketCardTop}>
                      <View style={styles.idRow}>
                        <Text style={styles.ticketCardId}>{t.ticketId}</Text>
                        <View
                          style={[
                            styles.roleBadge,
                            t.userRole === 'FARMER' ? styles.roleBadgeFarmer : styles.roleBadgeCustomer,
                          ]}
                        >
                          <Text
                            style={[
                              styles.roleBadgeText,
                              t.userRole === 'FARMER'
                                ? { color: '#15803D' }
                                : { color: '#2563EB' },
                            ]}
                          >
                            {t.userRole}
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: sBadge.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: sBadge.fg }]}>{sBadge.label}</Text>
                      </View>
                    </View>

                    <Text style={styles.ticketCardSubject} numberOfLines={1}>
                      {t.subject}
                    </Text>

                    <Text style={styles.ticketCardUser} numberOfLines={1}>
                      👤 {t.userName} {t.orderId ? `• Ref: ${t.orderId}` : ''}
                    </Text>

                    {lastMsg && (
                      <Text style={styles.ticketCardPreview} numberOfLines={1}>
                        {lastMsg.senderRole === 'ADMIN' ? 'Admin: ' : 'User: '}
                        {lastMsg.text}
                      </Text>
                    )}

                    <View style={styles.ticketCardBottom}>
                      <View style={[styles.priorityBadge, { backgroundColor: pBadge.bg }]}>
                        <Text style={[styles.priorityBadgeText, { color: pBadge.fg }]}>
                          {pBadge.label}
                        </Text>
                      </View>
                      <Text style={styles.ticketCardTime}>
                        {new Date(t.updatedAt || t.createdAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>

        {/* Right Detail Pane */}
        {currentTicket ? (
          <View style={styles.rightPane}>
            {/* Header / Action Bar */}
            <View style={styles.detailHeader}>
              <View style={{ flex: 1 }}>
                <View style={styles.detailTitleRow}>
                  <Text style={styles.detailTicketId}>{currentTicket.ticketId}</Text>
                  <View
                    style={[
                      styles.roleBadge,
                      currentTicket.userRole === 'FARMER'
                        ? styles.roleBadgeFarmer
                        : styles.roleBadgeCustomer,
                    ]}
                  >
                    <Text
                      style={[
                        styles.roleBadgeText,
                        currentTicket.userRole === 'FARMER'
                          ? { color: '#15803D' }
                          : { color: '#2563EB' },
                      ]}
                    >
                      {currentTicket.userRole}
                    </Text>
                  </View>
                  <Text style={styles.categoryPill}>
                    {currentTicket.category.replace(/_/g, ' ')}
                  </Text>
                </View>
                <Text style={styles.detailSubject}>{currentTicket.subject}</Text>
              </View>

              {/* Status Action Buttons */}
              <View style={styles.statusActions}>
                {currentTicket.status !== 'IN_PROGRESS' && (
                  <TouchableOpacity
                    style={[styles.actionPillBtn, { borderColor: '#2563EB' }]}
                    onPress={() => handleUpdateStatus('IN_PROGRESS')}
                  >
                    <Ionicons name="sync" size={13} color="#2563EB" />
                    <Text style={[styles.actionPillBtnText, { color: '#2563EB' }]}>In Progress</Text>
                  </TouchableOpacity>
                )}

                {currentTicket.status !== 'RESOLVED' && (
                  <TouchableOpacity
                    style={[styles.actionPillBtn, { backgroundColor: '#15803D', borderColor: '#15803D' }]}
                    onPress={() => handleUpdateStatus('RESOLVED')}
                  >
                    <Ionicons name="checkmark-circle" size={13} color="#FFFFFF" />
                    <Text style={[styles.actionPillBtnText, { color: '#FFFFFF' }]}>Mark Resolved</Text>
                  </TouchableOpacity>
                )}

                {currentTicket.status === 'RESOLVED' && (
                  <TouchableOpacity
                    style={[styles.actionPillBtn, { borderColor: '#D97706' }]}
                    onPress={() => handleUpdateStatus('OPEN')}
                  >
                    <Ionicons name="refresh" size={13} color="#D97706" />
                    <Text style={[styles.actionPillBtnText, { color: '#D97706' }]}>Reopen Ticket</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* User & Order Context Bar */}
            <View style={styles.userContextBar}>
              <View style={styles.contextItem}>
                <Ionicons name="person" size={14} color={AdminTheme.colorTextDim} />
                <Text style={styles.contextValue}>{currentTicket.userName}</Text>
              </View>
              {currentTicket.userPhone ? (
                <View style={styles.contextItem}>
                  <Ionicons name="call" size={14} color={AdminTheme.colorTextDim} />
                  <Text style={styles.contextValue}>{currentTicket.userPhone}</Text>
                </View>
              ) : null}
              {currentTicket.orderId ? (
                <View style={styles.contextItem}>
                  <Ionicons name="receipt" size={14} color="#2563EB" />
                  <Text style={[styles.contextValue, { color: '#2563EB', fontWeight: '700' }]}>
                    Order Ref: {currentTicket.orderId}
                  </Text>
                </View>
              ) : null}
              <View style={styles.contextItem}>
                <Ionicons name="time" size={14} color={AdminTheme.colorTextDim} />
                <Text style={styles.contextValue}>
                  {new Date(currentTicket.createdAt).toLocaleString()}
                </Text>
              </View>
            </View>

            {/* Scrollable Conversation Thread */}
            <ScrollView style={styles.chatScroll} contentContainerStyle={styles.chatScrollContent}>
              {currentTicket.messages.map((m, idx) => {
                const isAdmin = m.senderRole === 'ADMIN';
                return (
                  <View
                    key={idx}
                    style={[
                      styles.chatBubbleWrapper,
                      isAdmin ? styles.chatBubbleWrapperAdmin : styles.chatBubbleWrapperUser,
                    ]}
                  >
                    <View
                      style={[
                        styles.chatBubble,
                        isAdmin ? styles.chatBubbleAdmin : styles.chatBubbleUser,
                      ]}
                    >
                      <View style={styles.chatBubbleHeader}>
                        <Text style={[styles.chatSenderName, isAdmin && styles.chatSenderNameAdmin]}>
                          {isAdmin ? '🛡️ Admin Support Desk' : `👤 ${m.senderName} (${currentTicket.userRole})`}
                        </Text>
                        <Text style={styles.chatTime}>
                          {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                      <Text style={[styles.chatText, isAdmin && styles.chatTextAdmin]}>{m.text}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            {/* Quick Reply Macros */}
            <View style={styles.macroStrip}>
              <Text style={styles.macroLabel}>Quick Responses:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.macroList}>
                {QUICK_REPLIES.map((macro, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.macroPill}
                    onPress={() => setReplyText(macro.text)}
                  >
                    <Text style={styles.macroPillText}>{macro.title}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Admin Reply Box & Resolution Notes */}
            <View style={styles.replyComposer}>
              <TextInput
                style={styles.composerInput}
                placeholder="Type an official admin response to resolve this issue..."
                placeholderTextColor={AdminTheme.colorTextDim}
                value={replyText}
                onChangeText={setReplyText}
                multiline
              />
              <View style={styles.composerFooter}>
                <View style={styles.resolutionInputWrap}>
                  <Ionicons name="document-text-outline" size={14} color={AdminTheme.colorTextDim} />
                  <TextInput
                    style={styles.resolutionInput}
                    placeholder="Optional resolution note (e.g. Refund issued / Driver re-routed)..."
                    placeholderTextColor={AdminTheme.colorTextDim}
                    value={resolutionNotes}
                    onChangeText={setResolutionNotes}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.adminSendBtn, (!replyText.trim() || isSending) && styles.adminSendBtnDisabled]}
                  disabled={!replyText.trim() || isSending}
                  onPress={handleSendReply}
                >
                  {isSending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="send" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.adminSendBtnText}>Send to {currentTicket.userRole}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.emptyRightPane}>
            <Ionicons name="headset-outline" size={48} color={AdminTheme.colorTextDim} />
            <Text style={styles.emptyRightTitle}>No Ticket Selected</Text>
            <Text style={styles.emptyRightSub}>Select a ticket from the left panel to inspect details and respond.</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AdminTheme.bgAdminDark,
  },
  metricsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AdminTheme.bgPanelDark,
    borderBottomWidth: 1,
    borderBottomColor: AdminTheme.bgSurfaceBorder,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  metricItem: {
    paddingHorizontal: 16,
  },
  metricLabel: {
    fontSize: 11,
    color: AdminTheme.colorTextDim,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800',
    color: AdminTheme.colorTextMain,
    marginTop: 2,
  },
  metricDivider: {
    width: 1,
    height: 28,
    backgroundColor: AdminTheme.bgSurfaceBorder,
  },
  workspace: {
    flex: 1,
    flexDirection: 'row',
  },
  leftPane: {
    width: 380,
    borderRightWidth: 1,
    borderRightColor: AdminTheme.bgSurfaceBorder,
    backgroundColor: AdminTheme.bgPanelDark,
    flexDirection: 'column',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AdminTheme.bgSubtle,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 8,
    height: 38,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    color: AdminTheme.colorTextMain,
  },
  filterChipsRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 6,
  },
  filterChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: AdminTheme.bgSubtle,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
  },
  filterChipActive: {
    backgroundColor: AdminTheme.colorEmeraldSubtle,
    borderColor: AdminTheme.colorBrandEmerald,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: AdminTheme.colorTextMuted,
  },
  filterChipTextActive: {
    color: AdminTheme.colorBrandEmerald,
    fontWeight: '700',
  },
  ticketListScroll: {
    flex: 1,
    paddingHorizontal: 14,
  },
  noResultsBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  noResultsText: {
    marginTop: 8,
    fontSize: 13,
    color: AdminTheme.colorTextDim,
  },
  ticketCard: {
    backgroundColor: AdminTheme.bgPanelDark,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
  },
  ticketCardSelected: {
    borderColor: AdminTheme.colorBrandEmerald,
    backgroundColor: '#F0FDF4',
  },
  ticketCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ticketCardId: {
    fontSize: 12,
    fontWeight: '800',
    color: AdminTheme.colorBrandEmerald,
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleBadgeCustomer: {
    backgroundColor: '#DBEAFE',
  },
  roleBadgeFarmer: {
    backgroundColor: '#DCFCE7',
  },
  roleBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  ticketCardSubject: {
    fontSize: 13,
    fontWeight: '700',
    color: AdminTheme.colorTextMain,
    marginBottom: 4,
  },
  ticketCardUser: {
    fontSize: 11,
    color: AdminTheme.colorTextDim,
    marginBottom: 4,
  },
  ticketCardPreview: {
    fontSize: 11,
    color: AdminTheme.colorTextMuted,
    marginBottom: 6,
  },
  ticketCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: AdminTheme.bgSurfaceBorder,
    paddingTop: 6,
  },
  priorityBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  priorityBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  ticketCardTime: {
    fontSize: 10,
    color: AdminTheme.colorTextDim,
  },

  // Right Detail Workspace
  rightPane: {
    flex: 1,
    backgroundColor: AdminTheme.bgAdminDark,
    flexDirection: 'column',
  },
  emptyRightPane: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyRightTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: AdminTheme.colorTextMain,
    marginTop: 12,
  },
  emptyRightSub: {
    fontSize: 13,
    color: AdminTheme.colorTextDim,
    marginTop: 4,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: AdminTheme.bgPanelDark,
    borderBottomWidth: 1,
    borderBottomColor: AdminTheme.bgSurfaceBorder,
  },
  detailTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  detailTicketId: {
    fontSize: 14,
    fontWeight: '800',
    color: AdminTheme.colorBrandEmerald,
  },
  categoryPill: {
    fontSize: 11,
    color: AdminTheme.colorTextMuted,
    backgroundColor: AdminTheme.bgSubtle,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '600',
  },
  detailSubject: {
    fontSize: 16,
    fontWeight: '800',
    color: AdminTheme.colorTextMain,
  },
  statusActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
  },
  actionPillBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  userContextBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: AdminTheme.bgSurfaceBorder,
    gap: 16,
  },
  contextItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contextValue: {
    fontSize: 12,
    color: AdminTheme.colorTextMuted,
    fontWeight: '500',
  },
  chatScroll: {
    flex: 1,
    backgroundColor: AdminTheme.bgAdminDark,
  },
  chatScrollContent: {
    padding: 20,
    gap: 14,
  },
  chatBubbleWrapper: {
    flexDirection: 'row',
    width: '100%',
  },
  chatBubbleWrapperAdmin: {
    justifyContent: 'flex-end',
  },
  chatBubbleWrapperUser: {
    justifyContent: 'flex-start',
  },
  chatBubble: {
    maxWidth: '75%',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  chatBubbleAdmin: {
    backgroundColor: '#15803D',
    borderBottomRightRadius: 2,
  },
  chatBubbleUser: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
  },
  chatBubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 12,
  },
  chatSenderName: {
    fontSize: 11,
    fontWeight: '700',
    color: AdminTheme.colorTextMain,
  },
  chatSenderNameAdmin: {
    color: '#DCFCE7',
  },
  chatTime: {
    fontSize: 10,
    color: AdminTheme.colorTextDim,
  },
  chatText: {
    fontSize: 13,
    lineHeight: 19,
    color: AdminTheme.colorTextMain,
  },
  chatTextAdmin: {
    color: '#FFFFFF',
  },
  macroStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: AdminTheme.bgPanelDark,
    borderTopWidth: 1,
    borderTopColor: AdminTheme.bgSurfaceBorder,
  },
  macroLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: AdminTheme.colorTextDim,
    marginRight: 8,
  },
  macroList: {
    gap: 8,
  },
  macroPill: {
    backgroundColor: AdminTheme.bgSubtle,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
  },
  macroPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: AdminTheme.colorTextMuted,
  },
  replyComposer: {
    backgroundColor: AdminTheme.bgPanelDark,
    borderTopWidth: 1,
    borderTopColor: AdminTheme.bgSurfaceBorder,
    padding: 16,
    gap: 10,
  },
  composerInput: {
    backgroundColor: AdminTheme.bgSubtle,
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
    color: AdminTheme.colorTextMain,
    minHeight: 70,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
  },
  composerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  resolutionInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AdminTheme.bgSubtle,
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 36,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
  },
  resolutionInput: {
    flex: 1,
    marginLeft: 6,
    fontSize: 12,
    color: AdminTheme.colorTextMain,
  },
  adminSendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AdminTheme.colorBrandEmerald,
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 6,
  },
  adminSendBtnDisabled: {
    backgroundColor: '#9CA3AF',
  },
  adminSendBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
