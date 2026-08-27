// src/components/HelpDeskModal.tsx
//
// EcoHarvest Universal Help Desk & Issue Resolution Modal (Customer & Farmer Sides)
// Enables direct communication with the Admin Support Team for dispute resolution,
// order issues, escrow questions, and SLSI verification inquiries.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  HelpTicket,
  HelpTicketCategory,
  HelpTicketPriority,
  HelpTicketStatus,
} from '../types';
import {
  createHelpTicketLocal,
  getActiveMode,
  getFarmerProfile,
  getUserHelpTickets,
  getUserProfile,
  sendHelpTicketReply,
  subscribeToHelpTickets,
  updateHelpTicketStatusLocal,
} from '../utils/storage';
import { showToast } from './FeedbackPopup';

interface HelpDeskModalProps {
  visible: boolean;
  onClose: () => void;
  initialOrderId?: string;
  initialCategory?: HelpTicketCategory;
}

const CATEGORY_OPTIONS: { value: HelpTicketCategory; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'ORDER_DELIVERY', label: 'Order & Delivery Issue', icon: 'bicycle-outline' },
  { value: 'PAYMENT_ESCROW', label: 'Payment & Escrow Release', icon: 'card-outline' },
  { value: 'CROP_QUALITY', label: 'Crop Freshness & Quality', icon: 'leaf-outline' },
  { value: 'SLSI_VERIFICATION', label: 'SLSI Organic Certificate Help', icon: 'shield-checkmark-outline' },
  { value: 'COMMISSION_PAYOUT', label: 'Farmer Commission & Payouts', icon: 'cash-outline' },
  { value: 'ACCOUNT_SETTINGS', label: 'Account & Profile Settings', icon: 'person-outline' },
  { value: 'APP_FEEDBACK', label: 'App Feedback & Bug Report', icon: 'bug-outline' },
  { value: 'OTHER', label: 'General Inquiries', icon: 'help-circle-outline' },
];

const PRIORITY_OPTIONS: { value: HelpTicketPriority; label: string; color: string }[] = [
  { value: 'LOW', label: 'Low', color: '#6B7280' },
  { value: 'MEDIUM', label: 'Medium', color: '#2563EB' },
  { value: 'HIGH', label: 'High', color: '#D97706' },
  { value: 'CRITICAL', label: 'Urgent / Critical', color: '#DC2626' },
];

const FAQS = [
  {
    q: 'How does the Escrow payment protection work?',
    a: 'When a customer places an order, payment is securely held by EcoHarvest Escrow until delivery is confirmed by both customer and Uber logistics driver, after which funds are released to the farmer.',
  },
  {
    q: 'How do I upload or renew my SLSI Organic Certificate?',
    a: 'Go to your Farmer Profile tab, tap "Farmer Portal", upload your SLS 1324 certificate photo/PDF, and submit. Admin audit takes under 24 hours.',
  },
  {
    q: 'What if my crop order arrives damaged?',
    a: 'Submit a ticket under "Crop Freshness & Quality" with photos within 2 hours of delivery for an instant escrow hold and refund resolution.',
  },
];

export default function HelpDeskModal({
  visible,
  onClose,
  initialOrderId = '',
  initialCategory = 'ORDER_DELIVERY',
}: HelpDeskModalProps) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'TICKETS' | 'NEW' | 'FAQS'>('TICKETS');
  const [tickets, setTickets] = useState<HelpTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const selectedTicket = tickets.find((t) => t.ticketId === selectedTicketId) || null;

  // User identity
  const [userRole, setUserRole] = useState<'CUSTOMER' | 'FARMER'>('CUSTOMER');
  const [userId, setUserId] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [userPhone, setUserPhone] = useState<string>('');

  // Form State
  const [ticketAuthorName, setTicketAuthorName] = useState('');
  const [ticketAuthorPhone, setTicketAuthorPhone] = useState('');
  const [category, setCategory] = useState<HelpTicketCategory>(initialCategory);
  const [subject, setSubject] = useState('');
  const [orderId, setOrderId] = useState(initialOrderId);
  const [priority, setPriority] = useState<HelpTicketPriority>('MEDIUM');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reply State
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Load User Context
  const loadUserContext = useCallback(async () => {
    const mode = await getActiveMode();
    if (mode === 'farmer') {
      setUserRole('FARMER');
      const fProf = await getFarmerProfile();
      if (fProf) {
        setUserId(fProf.id || '');
        const name = fProf.farmName || fProf.legalName || '';
        setUserName(name);
        setUserPhone(fProf.mobileNumber || '');
        setTicketAuthorName(name);
        setTicketAuthorPhone(fProf.mobileNumber || '');
      } else {
        setUserId('');
        setUserName('');
        setUserPhone('');
      }
    } else {
      setUserRole('CUSTOMER');
      const cProf = await getUserProfile();
      if (cProf) {
        setUserId(cProf.id || '');
        setUserName(cProf.fullName || '');
        setUserPhone(cProf.phoneNumber || '');
        setTicketAuthorName(cProf.fullName || '');
        setTicketAuthorPhone(cProf.phoneNumber || '');
      } else {
        setUserId('');
        setUserName('');
        setUserPhone('');
      }
    }
  }, []);

  useEffect(() => {
    if (!visible) return;

    loadUserContext();

    let isMounted = true;
    setIsLoading(true);

    getUserHelpTickets(userId || undefined, userRole)
      .then((list) => {
        if (isMounted) {
          setTickets(list);
        }
      })
      .catch((err) => {
        console.warn('Error loading help tickets:', err);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    const unsub = subscribeToHelpTickets((all) => {
      if (!isMounted) return;
      const userList = userId
        ? all.filter((t) => t.userId === userId)
        : userRole
        ? all.filter((t) => t.userRole === userRole)
        : all;
      setTickets(userList);
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, [visible, userId, userRole, loadUserContext]);

  const handleBackToList = () => {
    setSelectedTicketId(null);
    setActiveTab('TICKETS');
  };

  const handleSubmitTicket = async () => {
    const finalName = (ticketAuthorName || userName).trim();
    if (!finalName) {
      Alert.alert('Your Name Required', 'Please enter your name so support can assist you.');
      return;
    }
    if (!subject.trim()) {
      Alert.alert('Subject Required', 'Please enter a short subject for your issue.');
      return;
    }
    if (!message.trim()) {
      Alert.alert('Details Required', 'Please describe the issue or question you have.');
      return;
    }

    setIsSubmitting(true);
    try {
      const effectiveUserId = userId || `guest_${Date.now()}`;
      const created = await createHelpTicketLocal({
        userId: effectiveUserId,
        userName: finalName,
        userRole,
        userPhone: ticketAuthorPhone || userPhone,
        orderId: orderId.trim(),
        category,
        subject: subject.trim(),
        priority,
        message: message.trim(),
      });

      showToast(`Support Ticket ${created.ticketId} created! Our admin team will respond shortly.`, 'success');
      setSubject('');
      setMessage('');
      setOrderId('');
      setActiveTab('TICKETS');
      setSelectedTicketId(created.ticketId);
    } catch (err: any) {
      Alert.alert('Submission Error', err?.message || 'Could not create ticket. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedTicket) return;
    setIsSendingReply(true);
    try {
      const updated = await sendHelpTicketReply(selectedTicket.ticketId, {
        senderRole: userRole,
        senderId: userId || selectedTicket.userId || '',
        senderName: ticketAuthorName || userName || selectedTicket.userName || 'User',
        text: replyText.trim(),
      });
      setReplyText('');
      if (updated) {
        setTickets((prev) => prev.map((t) => (t.ticketId === updated.ticketId ? updated : t)));
      }
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (err: any) {
      Alert.alert('Reply Failed', err?.message || 'Could not send message.');
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleResolveTicket = async () => {
    if (!selectedTicket) return;
    Alert.alert(
      'Resolve Ticket?',
      'Has this issue been resolved to your satisfaction?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Mark Resolved',
          style: 'default',
          onPress: async () => {
            const updated = await updateHelpTicketStatusLocal(
              selectedTicket.ticketId,
              'RESOLVED',
              'Customer/Farmer confirmed issue resolved.'
            );
            if (updated) {
              setTickets((prev) => prev.map((t) => (t.ticketId === updated.ticketId ? updated : t)));
            }
            showToast('Ticket marked as resolved. Thank you!', 'success');
          },
        },
      ]
    );
  };

  const getStatusBadge = (status: HelpTicketStatus) => {
    switch (status) {
      case 'OPEN':
        return { label: 'Open', bg: '#FEF3C7', fg: '#D97706', icon: 'time-outline' as const };
      case 'IN_PROGRESS':
        return { label: 'In Progress', bg: '#DBEAFE', fg: '#2563EB', icon: 'sync-outline' as const };
      case 'RESOLVED':
        return { label: 'Resolved', bg: '#DCFCE7', fg: '#15803D', icon: 'checkmark-circle-outline' as const };
      case 'CLOSED':
        return { label: 'Closed', bg: '#F3F4F6', fg: '#6B7280', icon: 'close-circle-outline' as const };
    }
  };

  const getPriorityBadge = (p: HelpTicketPriority) => {
    switch (p) {
      case 'CRITICAL':
        return { label: 'Urgent', bg: '#FEE2E2', fg: '#DC2626' };
      case 'HIGH':
        return { label: 'High', bg: '#FEF3C7', fg: '#D97706' };
      case 'MEDIUM':
        return { label: 'Medium', bg: '#DBEAFE', fg: '#2563EB' };
      case 'LOW':
        return { label: 'Low', bg: '#F3F4F6', fg: '#6B7280' };
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: Math.max(insets.top, 12), paddingBottom: insets.bottom }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header Bar */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {selectedTicket ? (
              <Pressable
                style={styles.headerBackBtn}
                onPress={handleBackToList}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Back to tickets list"
              >
                <Ionicons name="arrow-back" size={22} color="#111827" />
              </Pressable>
            ) : (
              <View style={styles.headerIconCircle}>
                <Ionicons name="headset" size={20} color="#15803D" />
              </View>
            )}
            <View>
              <Text style={styles.headerTitle}>
                {selectedTicket ? `Ticket ${selectedTicket.ticketId}` : 'EcoHarvest Help Desk'}
              </Text>
              <Text style={styles.headerSubtitle}>
                {selectedTicket
                  ? selectedTicket.category.replace(/_/g, ' ')
                  : userRole === 'FARMER'
                  ? '🌾 Farmer Support Desk'
                  : '🛒 Customer Care & Disputes'}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={24} color="#374151" />
          </TouchableOpacity>
        </View>

        {/* Tab Navigation Pill Bar */}
        {!selectedTicket && (
          <View style={styles.tabBar}>
            <Pressable
              style={[styles.tabBtn, activeTab === 'TICKETS' && styles.tabBtnActive]}
              onPress={() => setActiveTab('TICKETS')}
            >
              <Ionicons
                name="chatbox-ellipses-outline"
                size={16}
                color={activeTab === 'TICKETS' ? '#15803D' : '#6B7280'}
              />
              <Text style={[styles.tabText, activeTab === 'TICKETS' && styles.tabTextActive]}>
                My Tickets ({tickets.length})
              </Text>
            </Pressable>

            <Pressable
              style={[styles.tabBtn, activeTab === 'NEW' && styles.tabBtnActive]}
              onPress={() => setActiveTab('NEW')}
            >
              <Ionicons
                name="add-circle-outline"
                size={16}
                color={activeTab === 'NEW' ? '#15803D' : '#6B7280'}
              />
              <Text style={[styles.tabText, activeTab === 'NEW' && styles.tabTextActive]}>
                New Ticket
              </Text>
            </Pressable>

            <Pressable
              style={[styles.tabBtn, activeTab === 'FAQS' && styles.tabBtnActive]}
              onPress={() => setActiveTab('FAQS')}
            >
              <Ionicons
                name="help-buoy-outline"
                size={16}
                color={activeTab === 'FAQS' ? '#15803D' : '#6B7280'}
              />
              <Text style={[styles.tabText, activeTab === 'FAQS' && styles.tabTextActive]}>
                FAQs & Guides
              </Text>
            </Pressable>
          </View>
        )}

        {/* ---------------- 1. TICKET DETAIL / THREAD VIEW ---------------- */}
        {selectedTicket ? (
          <View style={styles.threadContainer}>
            {/* Thread Top Bar */}
            <View style={styles.threadHeader}>
              <Pressable
                style={styles.backBtn}
                onPress={handleBackToList}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Back to All Tickets"
              >
                <Ionicons name="arrow-back" size={18} color="#15803D" />
                <Text style={styles.backBtnText}>Back to Tickets</Text>
              </Pressable>

              <View style={styles.threadStatusRow}>
                {(() => {
                  const sBadge = getStatusBadge(selectedTicket.status);
                  return (
                    <View style={[styles.statusPill, { backgroundColor: sBadge.bg }]}>
                      <Ionicons name={sBadge.icon} size={12} color={sBadge.fg} style={{ marginRight: 4 }} />
                      <Text style={[styles.statusPillText, { color: sBadge.fg }]}>{sBadge.label}</Text>
                    </View>
                  );
                })()}

                {selectedTicket.status !== 'RESOLVED' && selectedTicket.status !== 'CLOSED' && (
                  <TouchableOpacity style={styles.resolveBtn} onPress={handleResolveTicket}>
                    <Ionicons name="checkmark-done" size={14} color="#FFFFFF" />
                    <Text style={styles.resolveBtnText}>Mark Resolved</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Ticket Info Card */}
            <View style={styles.ticketMetaCard}>
              <View style={styles.metaTopRow}>
                <Text style={styles.ticketIdPill}>{selectedTicket.ticketId}</Text>
                <Text style={styles.categoryPill}>{selectedTicket.category.replace(/_/g, ' ')}</Text>
                {selectedTicket.orderId ? (
                  <Text style={styles.orderIdPill}>Ref: {selectedTicket.orderId}</Text>
                ) : null}
              </View>
              <Text style={styles.metaSubject}>{selectedTicket.subject}</Text>
              <Text style={styles.metaCreatedDate}>
                Submitted {new Date(selectedTicket.createdAt).toLocaleDateString()} at{' '}
                {new Date(selectedTicket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>

            {/* Message Conversation Scroll */}
            <ScrollView
              ref={scrollRef}
              style={styles.messagesScroll}
              contentContainerStyle={styles.messagesContent}
            >
              {selectedTicket.messages.map((m, index) => {
                const isAdmin = m.senderRole === 'ADMIN';
                return (
                  <View
                    key={index}
                    style={[styles.msgWrapper, isAdmin ? styles.msgWrapperAdmin : styles.msgWrapperUser]}
                  >
                    <View style={[styles.msgBubble, isAdmin ? styles.msgBubbleAdmin : styles.msgBubbleUser]}>
                      <View style={styles.msgSenderRow}>
                        {isAdmin ? (
                          <View style={styles.adminBadge}>
                            <Ionicons name="shield-checkmark" size={12} color="#15803D" />
                            <Text style={styles.adminBadgeText}>EcoHarvest Support Team</Text>
                          </View>
                        ) : (
                          <Text style={styles.userSenderName}>{m.senderName} (You)</Text>
                        )}
                        <Text style={styles.msgTime}>
                          {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                      <Text style={[styles.msgText, isAdmin && styles.msgTextAdmin]}>{m.text}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            {/* Reply Composer */}
            {selectedTicket.status !== 'CLOSED' ? (
              <View style={styles.replyBox}>
                <TextInput
                  style={styles.replyInput}
                  placeholder="Type a follow-up message to admin support..."
                  placeholderTextColor="#9CA3AF"
                  value={replyText}
                  onChangeText={setReplyText}
                  multiline
                  maxLength={500}
                />
                <TouchableOpacity
                  style={[styles.sendBtn, !replyText.trim() && styles.sendBtnDisabled]}
                  disabled={!replyText.trim() || isSendingReply}
                  onPress={handleSendReply}
                >
                  {isSendingReply ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="send" size={18} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.closedNotice}>
                <Ionicons name="lock-closed-outline" size={16} color="#6B7280" />
                <Text style={styles.closedNoticeText}>This ticket has been closed by admin.</Text>
              </View>
            )}
          </View>
        ) : (
          <>
            {/* ---------------- 2. MY TICKETS LIST TAB ---------------- */}
            {activeTab === 'TICKETS' && (
              <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabScrollPadding}>
                {isLoading ? (
                  <View style={styles.loadingBox}>
                    <ActivityIndicator size="large" color="#15803D" />
                    <Text style={styles.loadingText}>Syncing your support tickets...</Text>
                  </View>
                ) : tickets.length === 0 ? (
                  <View style={styles.emptyState}>
                    <View style={styles.emptyIconCircle}>
                      <Ionicons name="chatbubbles-outline" size={38} color="#15803D" />
                    </View>
                    <Text style={styles.emptyTitle}>No Support Tickets Yet</Text>
                    <Text style={styles.emptySubtitle}>
                      Have an issue with an order, crop delivery, or payment escrow? Open a ticket to get direct admin support.
                    </Text>
                    <TouchableOpacity
                      style={styles.emptyActionBtn}
                      onPress={() => setActiveTab('NEW')}
                    >
                      <Ionicons name="add" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.emptyActionText}>Submit New Support Ticket</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  tickets.map((t) => {
                    const sBadge = getStatusBadge(t.status);
                    const pBadge = getPriorityBadge(t.priority);
                    const lastMsg = t.messages[t.messages.length - 1];
                    return (
                      <TouchableOpacity
                        key={t.ticketId}
                        style={styles.ticketCard}
                        onPress={() => setSelectedTicketId(t.ticketId)}
                        activeOpacity={0.85}
                      >
                        <View style={styles.ticketCardHeader}>
                          <View style={styles.ticketCardIdWrap}>
                            <Text style={styles.ticketCardId}>{t.ticketId}</Text>
                            <View style={[styles.priorityPill, { backgroundColor: pBadge.bg }]}>
                              <Text style={[styles.priorityPillText, { color: pBadge.fg }]}>
                                {pBadge.label}
                              </Text>
                            </View>
                          </View>
                          <View style={[styles.statusPill, { backgroundColor: sBadge.bg }]}>
                            <Ionicons name={sBadge.icon} size={11} color={sBadge.fg} style={{ marginRight: 3 }} />
                            <Text style={[styles.statusPillText, { color: sBadge.fg }]}>{sBadge.label}</Text>
                          </View>
                        </View>

                        <Text style={styles.ticketCardSubject} numberOfLines={2}>
                          {t.subject}
                        </Text>

                        {lastMsg && (
                          <Text style={styles.ticketCardLastMsg} numberOfLines={1}>
                            <Text style={{ fontWeight: '700' }}>
                              {lastMsg.senderRole === 'ADMIN' ? 'Admin: ' : 'You: '}
                            </Text>
                            {lastMsg.text}
                          </Text>
                        )}

                        <View style={styles.ticketCardFooter}>
                          <View style={styles.categoryTag}>
                            <Ionicons name="pricetag-outline" size={11} color="#6B7280" style={{ marginRight: 4 }} />
                            <Text style={styles.categoryTagText}>{t.category.replace(/_/g, ' ')}</Text>
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
            )}

            {/* ---------------- 3. NEW TICKET FORM TAB ---------------- */}
            {activeTab === 'NEW' && (
              <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabScrollPadding}>
                <View style={styles.formCard}>
                  <Text style={styles.formSectionTitle}>Create Support Request</Text>
                  <Text style={styles.formSectionSub}>
                    Our admin governance and operations desk will review and reply directly to your issue.
                  </Text>

                  {/* Name Input */}
                  <Text style={styles.inputLabel}>Your Name *</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="Enter your name"
                    placeholderTextColor="#9CA3AF"
                    value={ticketAuthorName}
                    onChangeText={setTicketAuthorName}
                  />

                  {/* Contact Number */}
                  <Text style={styles.inputLabel}>Contact Number (Optional)</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="07X XXXXXXX"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="phone-pad"
                    value={ticketAuthorPhone}
                    onChangeText={setTicketAuthorPhone}
                    maxLength={15}
                  />

                  {/* Category Picker */}
                  <Text style={styles.inputLabel}>Issue Category</Text>
                  <View style={styles.categoryGrid}>
                    {CATEGORY_OPTIONS.map((c) => {
                      const isSelected = category === c.value;
                      return (
                        <Pressable
                          key={c.value}
                          style={[styles.categoryOption, isSelected && styles.categoryOptionSelected]}
                          onPress={() => setCategory(c.value)}
                        >
                          <Ionicons
                            name={c.icon}
                            size={16}
                            color={isSelected ? '#15803D' : '#4B5563'}
                            style={{ marginRight: 6 }}
                          />
                          <Text style={[styles.categoryOptionText, isSelected && styles.categoryOptionTextSelected]}>
                            {c.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Subject */}
                  <Text style={styles.inputLabel}>Subject / Summary *</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="e.g. Delayed delivery for organic carrots"
                    placeholderTextColor="#9CA3AF"
                    value={subject}
                    onChangeText={setSubject}
                    maxLength={100}
                  />

                  {/* Optional Order ID */}
                  <Text style={styles.inputLabel}>Order Reference ID (Optional)</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="e.g. ORD-9842"
                    placeholderTextColor="#9CA3AF"
                    value={orderId}
                    onChangeText={setOrderId}
                    autoCapitalize="characters"
                  />

                  {/* Priority Selector */}
                  <Text style={styles.inputLabel}>Priority Level</Text>
                  <View style={styles.priorityRow}>
                    {PRIORITY_OPTIONS.map((p) => {
                      const isSelected = priority === p.value;
                      return (
                        <Pressable
                          key={p.value}
                          style={[styles.priorityBtn, isSelected && styles.priorityBtnSelected]}
                          onPress={() => setPriority(p.value)}
                        >
                          <Text style={[styles.priorityBtnText, isSelected && styles.priorityBtnTextSelected]}>
                            {p.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Detailed Description */}
                  <Text style={styles.inputLabel}>Detailed Description *</Text>
                  <TextInput
                    style={[styles.inputField, styles.textArea]}
                    placeholder="Provide full details so our team can resolve the issue swiftly (quantities, dates, location, driver info, etc.)..."
                    placeholderTextColor="#9CA3AF"
                    value={message}
                    onChangeText={setMessage}
                    multiline
                    numberOfLines={5}
                  />

                  {/* Submit Button */}
                  <TouchableOpacity
                    style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
                    disabled={isSubmitting}
                    onPress={handleSubmitTicket}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="paper-plane" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                        <Text style={styles.submitBtnText}>Submit Ticket to Admin</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

            {/* ---------------- 4. FAQS TAB ---------------- */}
            {activeTab === 'FAQS' && (
              <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabScrollPadding}>
                <View style={styles.faqBanner}>
                  <Ionicons name="sparkles" size={20} color="#15803D" />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.faqBannerTitle}>Instant Help & Escrow Guidance</Text>
                    <Text style={styles.faqBannerSub}>
                      Quick answers for common questions regarding orders, quality, and SLSI standards.
                    </Text>
                  </View>
                </View>

                {FAQS.map((faq, idx) => (
                  <View key={idx} style={styles.faqCard}>
                    <View style={styles.faqQRow}>
                      <Ionicons name="help-circle" size={18} color="#15803D" style={{ marginRight: 8 }} />
                      <Text style={styles.faqQText}>{faq.q}</Text>
                    </View>
                    <Text style={styles.faqAText}>{faq.a}</Text>
                  </View>
                ))}

                <TouchableOpacity
                  style={styles.createFromFaqBtn}
                  onPress={() => setActiveTab('NEW')}
                >
                  <Ionicons name="chatbubbles-outline" size={18} color="#15803D" style={{ marginRight: 8 }} />
                  <Text style={styles.createFromFaqText}>Still need help? Open a Ticket</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
    fontWeight: '500',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F4F4F5',
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#15803D',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  tabTextActive: {
    color: '#15803D',
    fontWeight: '700',
  },
  tabContent: {
    flex: 1,
  },
  tabScrollPadding: {
    padding: 16,
    paddingBottom: 40,
  },

  // Thread View
  threadContainer: {
    flex: 1,
  },
  threadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    gap: 6,
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#15803D',
  },
  threadStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  resolveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#15803D',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 4,
  },
  resolveBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  ticketMetaCard: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  metaTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  ticketIdPill: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryPill: {
    fontSize: 11,
    color: '#4B5563',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '600',
  },
  orderIdPill: {
    fontSize: 11,
    color: '#2563EB',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '600',
  },
  metaSubject: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    lineHeight: 22,
  },
  metaCreatedDate: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 4,
  },
  messagesScroll: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  messagesContent: {
    padding: 16,
    gap: 12,
  },
  msgWrapper: {
    flexDirection: 'row',
    width: '100%',
  },
  msgWrapperUser: {
    justifyContent: 'flex-end',
  },
  msgWrapperAdmin: {
    justifyContent: 'flex-start',
  },
  msgBubble: {
    maxWidth: '85%',
    borderRadius: 14,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  msgBubbleUser: {
    backgroundColor: '#15803D',
    borderBottomRightRadius: 2,
  },
  msgBubbleAdmin: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  msgSenderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  adminBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D',
  },
  userSenderName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DCFCE7',
  },
  msgTime: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  msgText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#FFFFFF',
  },
  msgTextAdmin: {
    color: '#111827',
  },
  replyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 8,
  },
  replyInput: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    color: '#111827',
    maxHeight: 90,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#15803D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#9CA3AF',
  },
  closedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#F3F4F6',
    gap: 6,
  },
  closedNoticeText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },

  // Tickets List
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#6B7280',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#15803D',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  emptyActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  ticketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  ticketCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  ticketCardIdWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ticketCardId: {
    fontSize: 12,
    fontWeight: '800',
    color: '#15803D',
  },
  priorityPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priorityPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  ticketCardSubject: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  ticketCardLastMsg: {
    fontSize: 12,
    color: '#4B5563',
    marginBottom: 10,
  },
  ticketCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 8,
  },
  categoryTag: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryTagText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  ticketCardTime: {
    fontSize: 11,
    color: '#9CA3AF',
  },

  // Form Styles
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  formSectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  formSectionSub: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
    marginTop: 12,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F4F4F5',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  categoryOptionSelected: {
    backgroundColor: '#DCFCE7',
    borderColor: '#15803D',
  },
  categoryOptionText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  categoryOptionTextSelected: {
    color: '#15803D',
    fontWeight: '700',
  },
  inputField: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  priorityBtnSelected: {
    backgroundColor: '#DCFCE7',
    borderColor: '#15803D',
  },
  priorityBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  priorityBtnTextSelected: {
    color: '#15803D',
    fontWeight: '800',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#15803D',
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 20,
  },
  submitBtnDisabled: {
    backgroundColor: '#9CA3AF',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  // FAQ Styles
  faqBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  faqBannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#15803D',
  },
  faqBannerSub: {
    fontSize: 12,
    color: '#166534',
    marginTop: 2,
    lineHeight: 16,
  },
  faqCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  faqQRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  faqQText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
  },
  faqAText: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 19,
  },
  createFromFaqBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#15803D',
    marginTop: 10,
  },
  createFromFaqText: {
    color: '#15803D',
    fontSize: 14,
    fontWeight: '700',
  },
});
