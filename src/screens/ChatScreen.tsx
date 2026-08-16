// src/screens/ChatScreen.tsx
//
// Screen M-06: Moderated In-App Chat Messenger (design.md). Renders the
// fixed Header Bar + Transaction Summary Header (Section 3.1), the
// scrollable alternating-bubble message thread with the moderation safety
// banner (Section 3.2), the bottom text input bar (Section 3.3), and the
// Developer Sandbox Toolbar (Section 3.4).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ChatMessage, ChatThread } from '../types';
import {
  generateChatThreadId,
  getChatMessages,
  getChatThread,
  sendChatMessage,
  subscribeToChatMessages,
} from '../utils/storage';

// The chat screen can be opened from either side of a conversation: the
// default customer-facing flow (Marketplace/Cart/Orders → "Message
// Farmer"), or the Farmer Portal dashboard's "Reply to Customer" action
// (FarmerOnboardingScreen, View Mode 2), which navigates in with
// `userRole: 'FARMER'`. Whichever role is active decides bubble
// alignment/color (Section 3.2's "Current User" vs "Counterpart") and which
// role the input bar + sandbox presets send as. Defaults to `'CUSTOMER'` to
// preserve the screen's original behavior when no `userRole` param is
// passed at all.
const DEFAULT_USER_ROLE: ChatMessage['senderRole'] = 'CUSTOMER';

type ChatRouteParams = {
  threadId?: string;
  recipientName?: string;
  userRole?: ChatMessage['senderRole'];
};

const SANDBOX_PRESETS = [
  { label: '[ Test Normal Msg ]', text: 'When will the 100kg carrots be dispatched?' },
  { label: '[ Test Phone Block ]', text: 'Call me on 0771234567 to deal directly' },
  { label: '[ Test Email Block ]', text: 'Send receipt to farmer@gmail.com' },
] as const;

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function ChatScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<Record<'Chat', ChatRouteParams>, 'Chat'>>();

  // Generate a stable threadId once if the caller navigated in without one
  // (e.g. a fresh "Message Farmer" tap) rather than re-generating on every
  // re-render, which would orphan messages from earlier in the same visit.
  const threadIdRef = useRef<string>(route.params?.threadId ?? generateChatThreadId());
  const threadId = threadIdRef.current;

  const [thread, setThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  // Which side of the conversation this screen instance renders as. Seeded
  // once from the nav param (defaulting to CUSTOMER) and from then on only
  // changed via the Dev Sandbox "Switch Role" button, not by re-reading the
  // route param on every render.
  const [currentUserRole, setCurrentUserRole] = useState<ChatMessage['senderRole']>(
    route.params?.userRole ?? DEFAULT_USER_ROLE
  );

  const handleSwitchRole = useCallback(() => {
    setCurrentUserRole((prev) => (prev === 'FARMER' ? 'CUSTOMER' : 'FARMER'));
  }, []);

  const scrollViewRef = useRef<ScrollView>(null);

  // Initial load: thread context (header/transaction summary) + message
  // history, then live-subscribe so messages sent from the sandbox toolbar
  // (or, in a future multi-device setup, the counterpart) appear
  // immediately without a manual refresh.
  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      const [loadedThread, loadedMessages] = await Promise.all([
        getChatThread(threadId, { recipientName: route.params?.recipientName }),
        getChatMessages(threadId),
      ]);
      if (isMounted) {
        setThread(loadedThread);
        setMessages(loadedMessages);
        setIsLoading(false);
      }
    }

    load();

    const unsubscribe = subscribeToChatMessages(threadId, (updated) => {
      if (isMounted) setMessages(updated);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  useEffect(() => {
    // Auto-scroll to the newest message whenever the thread grows.
    const timeout = setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(timeout);
  }, [messages.length]);

  const handleSend = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? draft).trim();
      if (!text || isSending) return;

      setIsSending(true);
      try {
        await sendChatMessage(threadId, text, currentUserRole);
        setDraft('');
      } catch (error) {
        console.error('Failed to send chat message:', error);
      } finally {
        setIsSending(false);
      }
    },
    [draft, isSending, threadId, currentUserRole]
  );

  const handleSandboxPreset = useCallback((presetText: string) => {
    // "Auto-fills" per design.md Section 3.4 — loads the preset into the
    // input bar rather than sending it immediately, so the tester can see
    // (and optionally edit) exactly what's about to be sent.
    setDraft(presetText);
  }, []);

  const paymentStatusStyle = useMemo(() => {
    if (!thread) return styles.paymentPillNeutral;
    if (thread.paymentStatus === 'Escrow Locked') return styles.paymentPillLocked;
    if (thread.paymentStatus === 'Pending Payment') return styles.paymentPillPending;
    return styles.paymentPillNeutral;
  }, [thread]);

  if (isLoading || !thread) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#15803D" />
      </View>
    );
  }

  // "Chat with Customer: [Customer Name]" when replying as the farmer;
  // otherwise just the counterpart's name, matching the screen's original
  // customer-facing header. The thread only stores one counterpart name
  // (`recipientName`) regardless of role, so it's reused here as the
  // customer's display name in farmer mode.
  const headerTitle =
    currentUserRole === 'FARMER'
      ? `Chat with Customer: ${thread.recipientName}`
      : thread.recipientName;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <View style={styles.flex}>
        {/* 3.1 Top Fixed Header */}
        <View style={styles.headerBar}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </Pressable>
          <View style={styles.headerNameRow}>
            <Text style={styles.headerName} numberOfLines={1}>
              {headerTitle}
            </Text>
            {thread.isVerified && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
                <Text style={styles.verifiedBadgeText}>SLSI Verified</Text>
              </View>
            )}
          </View>
          <View style={styles.headerSpacer} />
        </View>

        {/* 3.1 Transaction Summary Header */}
        <View style={styles.transactionBar}>
          <View style={styles.transactionCol}>
            <Text style={styles.transactionLabel}>Order</Text>
            <Text style={styles.transactionValue} numberOfLines={1}>
              #{thread.orderId.replace(/^#/, '')}
            </Text>
          </View>
          <View style={[styles.transactionCol, styles.transactionColGrow]}>
            <Text style={styles.transactionLabel}>Items</Text>
            <Text style={styles.transactionValue} numberOfLines={1}>
              {thread.cropSummary}
            </Text>
          </View>
          <View style={[styles.paymentPill, paymentStatusStyle]}>
            <Text style={styles.paymentPillText} numberOfLines={1}>
              {thread.paymentStatus}
            </Text>
          </View>
        </View>

        {/* 3.2 Scrollable Message Thread */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.flex}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 && (
            <Text style={styles.emptyStateText}>
              No messages yet. Say hello — off-platform contact info will be blocked
              automatically.
            </Text>
          )}

          {messages.map((message) => {
            if (message.isBlocked) {
              return (
                <View key={message.id} style={styles.blockedCard}>
                  <Ionicons name="shield-checkmark" size={16} color="#DC2626" />
                  <Text style={styles.blockedCardText}>
                    [ Message Blocked: Off-platform contact sharing violates safety
                    guidelines ]
                  </Text>
                </View>
              );
            }

            const isCurrentUser = message.senderRole === currentUserRole;
            return (
              <View
                key={message.id}
                style={[
                  styles.bubbleRow,
                  isCurrentUser ? styles.bubbleRowRight : styles.bubbleRowLeft,
                ]}
              >
                <View
                  style={[
                    styles.bubble,
                    isCurrentUser ? styles.bubbleCurrentUser : styles.bubbleCounterpart,
                  ]}
                >
                  <Text
                    style={isCurrentUser ? styles.bubbleTextLight : styles.bubbleTextDark}
                  >
                    {message.text}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.timestamp,
                    isCurrentUser ? styles.timestampRight : styles.timestampLeft,
                  ]}
                >
                  {formatTimestamp(message.timestamp)}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        {/* 3.3 Bottom Text Input Bar */}
        <View style={styles.inputBar}>
          <Pressable style={styles.attachButton} hitSlop={8}>
            <Ionicons name="attach" size={22} color="#6B7280" />
          </Pressable>
          <TextInput
            style={styles.textInput}
            placeholder="Type a message..."
            placeholderTextColor="#6B7280"
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <Pressable
            style={[styles.sendButton, (!draft.trim() || isSending) && styles.sendButtonDisabled]}
            onPress={() => handleSend()}
            disabled={!draft.trim() || isSending}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </Pressable>
        </View>

        {/* 3.4 Developer Sandbox Toolbar */}
        <View style={styles.sandboxToolbar}>
          <Text style={styles.sandboxLabel}>
            Dev Sandbox — Viewing as {currentUserRole === 'FARMER' ? 'Farmer' : 'Customer'}
          </Text>
          <View style={styles.sandboxButtonRow}>
            {SANDBOX_PRESETS.map((preset) => (
              <Pressable
                key={preset.label}
                style={styles.sandboxButton}
                onPress={() => handleSandboxPreset(preset.text)}
              >
                <Text style={styles.sandboxButtonText}>{preset.label}</Text>
              </Pressable>
            ))}
            <Pressable
              style={[styles.sandboxButton, styles.sandboxButtonRole]}
              onPress={handleSwitchRole}
            >
              <Text style={[styles.sandboxButtonText, styles.sandboxButtonRoleText]}>
                [ Switch Role: Customer / Farmer ]
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAFA',
  },

  // --- Header Bar (3.1) ---
  headerBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerNameRow: {
    flex: 1,
    marginLeft: 4,
  },
  headerName: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
    color: '#111827',
  },
  headerSpacer: {
    width: 32,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  verifiedBadgeText: {
    fontSize: 12,
    lineHeight: 16,
    color: '#16A34A',
    fontWeight: '500',
  },

  // --- Transaction Summary Header (3.1) ---
  transactionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F4F4F5',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  transactionCol: {
    maxWidth: 90,
  },
  transactionColGrow: {
    flex: 1,
    maxWidth: undefined,
  },
  transactionLabel: {
    fontSize: 12,
    lineHeight: 16,
    color: '#6B7280',
  },
  transactionValue: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: '#111827',
  },
  paymentPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  paymentPillLocked: {
    backgroundColor: '#DCFCE7',
  },
  paymentPillPending: {
    backgroundColor: '#FEF9C3',
  },
  paymentPillNeutral: {
    backgroundColor: '#E5E7EB',
  },
  paymentPillText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: '#111827',
  },

  // --- Message Thread (3.2) ---
  messageList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  emptyStateText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 24,
  },
  bubbleRow: {
    maxWidth: '80%',
  },
  bubbleRowLeft: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubbleRowRight: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleCurrentUser: {
    backgroundColor: '#15803D',
    borderBottomRightRadius: 4,
  },
  bubbleCounterpart: {
    backgroundColor: '#F4F4F5',
    borderBottomLeftRadius: 4,
  },
  bubbleTextLight: {
    fontSize: 14,
    lineHeight: 20,
    color: '#FFFFFF',
  },
  bubbleTextDark: {
    fontSize: 14,
    lineHeight: 20,
    color: '#111827',
  },
  timestamp: {
    fontSize: 12,
    lineHeight: 16,
    color: '#6B7280',
    marginTop: 2,
  },
  timestampLeft: {
    marginLeft: 4,
  },
  timestampRight: {
    marginRight: 4,
  },

  // --- Blocked Safety Banner (3.2) ---
  blockedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  blockedCardText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    color: '#DC2626',
    fontWeight: '500',
  },

  // --- Bottom Text Input Bar (3.3) ---
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FAFAFA',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  attachButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    maxHeight: 100,
    minHeight: 36,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    lineHeight: 20,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  sendButton: {
    backgroundColor: '#15803D',
    borderRadius: 18,
    paddingHorizontal: 16,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#A7C7B4',
  },
  sendButtonText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // --- Developer Sandbox Toolbar (3.4) ---
  sandboxToolbar: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#F4F4F5',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  sandboxLabel: {
    fontSize: 12,
    lineHeight: 16,
    color: '#6B7280',
    marginBottom: 6,
  },
  sandboxButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sandboxButton: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sandboxButtonText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: '#15803D',
  },
  sandboxButtonRole: {
    borderColor: '#111827',
    backgroundColor: '#111827',
  },
  sandboxButtonRoleText: {
    color: '#FFFFFF',
  },
});