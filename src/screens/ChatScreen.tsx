// src/screens/ChatScreen.tsx
//
// Screen M-06: Moderated In-App Chat Messenger & WhatsApp-Style Conversation List.
// Supports a 2-level flow:
// 1. WhatsApp-Style Conversations List (recent customer inquiries & active order threads)
// 2. Individual Chat Room View (moderated chat with transaction summary header & safety banner)

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ChatMessage, ChatThread } from '../types';
import {
  checkContentModeration,
  generateChatThreadId,
  getAllChatThreads,
  getChatMessages,
  getChatThread,
  sendChatMessage,
  subscribeToChatMessages,
} from '../utils/storage';
import StandardHeader from '../components/StandardHeader';
import { showBlockedMessageModal, showToast } from '../components/FeedbackPopup';

const DEFAULT_USER_ROLE: ChatMessage['senderRole'] = 'CUSTOMER';

type ChatRouteParams = {
  threadId?: string;
  chatId?: string;
  recipientName?: string;
  userRole?: ChatMessage['senderRole'];
};

interface ThreadWithPreview {
  thread: ChatThread;
  lastMessage: ChatMessage | null;
}

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatRelativeDate(iso: string): string {
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 3600 * 24));
    if (diffDays === 0) return formatTimestamp(iso);
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function ChatScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<Record<'Chat', ChatRouteParams>, 'Chat'>>();
  const insets = useSafeAreaInsets();

  // Active thread ID (if navigated with a specific thread param or selected from list)
  const initialThreadId = route.params?.threadId ?? route.params?.chatId ?? null;
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(initialThreadId);

  // List view state
  const [threads, setThreads] = useState<ThreadWithPreview[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);

  // Room view state
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isLoadingRoom, setIsLoadingRoom] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const [currentUserRole, setCurrentUserRole] = useState<ChatMessage['senderRole']>(
    route.params?.userRole ?? DEFAULT_USER_ROLE
  );

  const scrollViewRef = useRef<ScrollView>(null);

  // Load conversation threads for Level 1 List View
  const loadThreadsList = useCallback(async () => {
    setIsLoadingList(true);
    try {
      let allThreads = await getAllChatThreads();

      // If empty, initialize a couple of realistic demo threads so the list is vibrant
      if (allThreads.length === 0) {
        const demoThread1 = await getChatThread('thread_demo_001', {
          recipientName: 'Fresh Supermarket (Colombo)',
        });
        const demoThread2 = await getChatThread('thread_demo_002', {
          recipientName: 'Green Kitchen Bistro',
        });
        allThreads = [demoThread1, demoThread2];
      }

      const withPreviews = await Promise.all(
        allThreads.map(async (t): Promise<ThreadWithPreview> => {
          const msgs = await getChatMessages(t.id);
          const last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
          return { thread: t, lastMessage: last };
        })
      );

      withPreviews.sort((a, b) => {
        const aTime = a.lastMessage ? new Date(a.lastMessage.timestamp).getTime() : 0;
        const bTime = b.lastMessage ? new Date(b.lastMessage.timestamp).getTime() : 0;
        return bTime - aTime;
      });

      setThreads(withPreviews);
    } catch (err) {
      console.error('Failed to load chat threads:', err);
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadThreadsList();
    }, [loadThreadsList])
  );

  // When selectedThreadId changes, load the room context & messages
  useEffect(() => {
    if (!selectedThreadId) return;

    let isMounted = true;
    async function loadRoom() {
      setIsLoadingRoom(true);
      const [loadedThread, loadedMessages] = await Promise.all([
        getChatThread(selectedThreadId as string, { recipientName: route.params?.recipientName }),
        getChatMessages(selectedThreadId as string),
      ]);
      if (isMounted) {
        setThread(loadedThread);
        setMessages(loadedMessages);
        setIsLoadingRoom(false);
      }
    }

    loadRoom();

    const unsubscribe = subscribeToChatMessages(selectedThreadId, (updated) => {
      if (isMounted) setMessages(updated);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [selectedThreadId, route.params?.recipientName]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(timeout);
  }, [messages.length]);

  const handleSend = useCallback(
    async (overrideText?: string) => {
      if (!selectedThreadId) return;
      const text = (overrideText ?? draft).trim();
      if (!text || isSending) return;

      setIsSending(true);
      try {
        // Run strict real-time moderation engine
        const modResult = await checkContentModeration(text, 'chat');
        if (!modResult.allowed) {
          showBlockedMessageModal(
            modResult.reason ||
              'This message violates platform safety rules (e.g., contact numbers, emails, or offensive language).',
            modResult.category
          );
          setIsSending(false);
          return;
        }

        await sendChatMessage(selectedThreadId, text, currentUserRole);
        setDraft('');
        loadThreadsList();
      } catch (error) {
        console.error('Failed to send chat message:', error);
      } finally {
        setIsSending(false);
      }
    },
    [draft, isSending, selectedThreadId, currentUserRole, loadThreadsList]
  );

  const paymentStatusStyle = useMemo(() => {
    if (!thread) return styles.paymentPillNeutral;
    if (thread.paymentStatus === 'Escrow Locked') return styles.paymentPillLocked;
    if (thread.paymentStatus === 'Pending Payment') return styles.paymentPillPending;
    return styles.paymentPillNeutral;
  }, [thread]);

  // If no thread selected, render Level 1: WhatsApp-Style Conversation List
  if (!selectedThreadId) {
    return (
      <View style={styles.container}>
        <StandardHeader
          title="Messages"
          subtitle="Direct customer inquiries & order communications"
        />

        {isLoadingList ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#15803D" />
          </View>
        ) : (
          <FlatList
            data={threads}
            keyExtractor={(item) => item.thread.id}
            contentContainerStyle={
              threads.length === 0 ? styles.emptyListContent : styles.listContent
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="chatbubbles-outline" size={36} color="#15803D" />
                </View>
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.emptySubtitle}>
                  Customer inquiries regarding your crops or orders will appear here.
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const { thread: t, lastMessage } = item;
              const snippet = lastMessage
                ? lastMessage.isBlocked
                  ? '🔒 Message blocked: off-platform contact info'
                  : lastMessage.text
                : 'No messages yet';
              const timeStr = lastMessage ? formatRelativeDate(lastMessage.timestamp) : '';

              return (
                <Pressable
                  style={styles.conversationRow}
                  onPress={() => setSelectedThreadId(t.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Chat with ${t.recipientName}`}
                >
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarInitial}>
                      {t.recipientName.charAt(0).toUpperCase()}
                    </Text>
                  </View>

                  <View style={styles.conversationInfo}>
                    <View style={styles.conversationTopRow}>
                      <Text style={styles.recipientName} numberOfLines={1}>
                        {t.recipientName}
                      </Text>
                      {timeStr ? <Text style={styles.conversationTime}>{timeStr}</Text> : null}
                    </View>

                    <View style={styles.conversationContextRow}>
                      <View style={styles.orderContextBadge}>
                        <Text style={styles.orderContextBadgeText}>
                          #{t.orderId.replace(/^#/, '')}
                        </Text>
                      </View>
                      <Text style={styles.cropSummaryText} numberOfLines={1}>
                        {t.cropSummary}
                      </Text>
                    </View>

                    <Text
                      style={[
                        styles.lastMessageSnippet,
                        lastMessage?.isBlocked && styles.lastMessageBlocked,
                      ]}
                      numberOfLines={1}
                    >
                      {snippet}
                    </Text>
                  </View>

                  <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                </Pressable>
              );
            }}
          />
        )}
      </View>
    );
  }

  // Level 2: Individual Chat Room View
  if (isLoadingRoom || !thread) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#15803D" />
      </View>
    );
  }

  const headerTitle =
    currentUserRole === 'FARMER'
      ? `${thread.recipientName}`
      : thread.recipientName;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <View style={styles.flex}>
        {/* Chat Room Header with safe area padding */}
        <View style={[styles.chatRoomHeader, { paddingTop: Math.max(insets.top, 12) }]}>
          <Pressable
            onPress={() => {
              if (initialThreadId) {
                navigation.goBack();
              } else {
                setSelectedThreadId(null);
              }
            }}
            style={styles.backButton}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back to conversation list"
          >
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </Pressable>

          <View style={styles.chatAvatarCircle}>
            <Text style={styles.chatAvatarText}>{thread.recipientName.charAt(0).toUpperCase()}</Text>
          </View>

          <View style={styles.chatHeaderInfo}>
            <Text style={styles.chatHeaderName} numberOfLines={1}>
              {headerTitle}
            </Text>
            <Text style={styles.chatHeaderSubtitle} numberOfLines={1}>
              Order #{thread.orderId.replace(/^#/, '')} • {thread.cropSummary}
            </Text>
          </View>

          {thread.isVerified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
            </View>
          )}
        </View>

        {/* Transaction Summary Banner */}
        <View style={styles.transactionBar}>
          <View style={styles.transactionCol}>
            <Text style={styles.transactionLabel}>Order ID</Text>
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

        {/* Scrollable Message Thread */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.messageScroll}
          contentContainerStyle={styles.messageScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((message) => {
            const isMe = message.senderRole === currentUserRole;
            const isBlocked = Boolean(
              message.isBlocked ||
              (message as any).status === 'BLOCKED' ||
              (message as any).moderationStatus === 'BLOCKED' ||
              (message as any).moderationStatus === 'MERCHANT_SUSPENDED'
            );

            return (
              <View
                key={message.id}
                style={[
                  styles.bubbleWrapper,
                  isMe ? styles.bubbleWrapperRight : styles.bubbleWrapperLeft,
                ]}
              >
                <View
                  style={[
                    styles.bubble,
                    isMe ? styles.bubbleGreen : styles.bubbleGray,
                    isBlocked && styles.bubbleBlocked,
                  ]}
                >
                  <Text
                    style={
                      isBlocked
                        ? styles.bubbleBlockedText
                        : isMe
                        ? styles.bubbleTextLight
                        : styles.bubbleTextDark
                    }
                  >
                    {isBlocked ? '[Message blocked by admin moderation]' : message.text}
                  </Text>
                </View>

                {isBlocked && (
                  <View style={styles.blockedCard}>
                    <Ionicons name="alert-circle" size={16} color="#DC2626" />
                    <Text style={styles.blockedCardText}>
                      {message.blockedReason || 'Off-platform contact info blocked for transaction safety.'}
                    </Text>
                  </View>
                )}

                <Text
                  style={[
                    styles.timestamp,
                    isMe ? styles.timestampRight : styles.timestampLeft,
                  ]}
                >
                  {formatTimestamp(message.timestamp)}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        {/* Bottom Text Input Bar */}
        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <TextInput
            style={styles.textInput}
            value={draft}
            onChangeText={setDraft}
            placeholder="Type a message…"
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={() => handleSend()}
          />
          <Pressable
            style={[styles.sendButton, (!draft.trim() || isSending) && styles.sendButtonDisabled]}
            onPress={() => handleSend()}
            disabled={!draft.trim() || isSending}
            accessibilityRole="button"
            accessibilityLabel="Send Message"
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="send" size={16} color="#FFFFFF" />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  flex: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAFAFA' },
  listContent: { paddingVertical: 8 },
  emptyListContent: { flexGrow: 1 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  emptySubtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', maxWidth: 280, lineHeight: 18 },
  conversationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: '700',
    color: '#15803D',
  },
  conversationInfo: {
    flex: 1,
    marginRight: 8,
  },
  conversationTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  recipientName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    marginRight: 6,
  },
  conversationTime: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  conversationContextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  orderContextBadge: {
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  orderContextBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
  },
  cropSummaryText: {
    fontSize: 12,
    color: '#6B7280',
    flex: 1,
  },
  lastMessageSnippet: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  lastMessageBlocked: {
    color: '#DC2626',
    fontWeight: '500',
  },

  // Chat Room styles
  chatRoomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    marginRight: 8,
    padding: 2,
  },
  chatAvatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  chatAvatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#15803D',
  },
  chatHeaderInfo: {
    flex: 1,
  },
  chatHeaderName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  chatHeaderSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },
  verifiedBadge: {
    marginLeft: 6,
  },
  transactionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  transactionCol: {
    gap: 2,
  },
  transactionColGrow: {
    flex: 1,
  },
  transactionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  transactionValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  paymentPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  paymentPillLocked: {
    backgroundColor: '#FEF3C7',
  },
  paymentPillPending: {
    backgroundColor: '#FEE2E2',
  },
  paymentPillNeutral: {
    backgroundColor: '#F1F5F9',
  },
  paymentPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  messageScroll: {
    flex: 1,
  },
  messageScrollContent: {
    padding: 16,
    gap: 12,
  },
  bubbleWrapper: {
    maxWidth: '80%',
    gap: 4,
  },
  bubbleWrapperLeft: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubbleWrapperRight: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleGreen: {
    backgroundColor: '#15803D',
    borderBottomRightRadius: 4,
  },
  bubbleGray: {
    backgroundColor: '#E5E7EB',
    borderBottomLeftRadius: 4,
  },
  bubbleBlocked: {
    opacity: 0.8,
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
  bubbleBlockedText: {
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
    color: '#DC2626',
    fontWeight: '500',
  },
  timestamp: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  timestampLeft: {
    marginLeft: 4,
  },
  timestampRight: {
    marginRight: 4,
  },
  blockedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 8,
  },
  blockedCardText: {
    fontSize: 12,
    color: '#DC2626',
    flex: 1,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: '#F4F4F5',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    color: '#111827',
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#15803D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
});