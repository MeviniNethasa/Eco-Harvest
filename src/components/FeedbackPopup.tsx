// src/components/FeedbackPopup.tsx
//
// Universal Pop-up Modal & Floating Toast Notification Engine.
// Supports:
// 1. "Message Blocked" / Moderation Rejection Modal with clear explanation and rules guidance.
// 2. Success / Failure Modals & Toasts for Sign In, Sign Up, Sign Out, Orders, Cart, Products, Reviews.

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type FeedbackType = 'success' | 'error' | 'warning' | 'info' | 'blocked';

export interface FeedbackOptions {
  type: FeedbackType;
  title: string;
  message: string;
  details?: string;
  buttonText?: string;
  onDismiss?: () => void;
  autoCloseMs?: number;
}

export interface ToastOptions {
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  durationMs?: number;
}

type FeedbackListener = (opts: FeedbackOptions | null) => void;
type ToastListener = (opts: ToastOptions | null) => void;

let feedbackListener: FeedbackListener | null = null;
let toastListener: ToastListener | null = null;

/**
 * Trigger a prominent pop-up modal dialog (e.g. for blocked messages, errors, key successes).
 */
export function showFeedback(opts: FeedbackOptions): void {
  if (feedbackListener) {
    feedbackListener(opts);
  }
}

/**
 * Specialized pop-up modal for real-time moderation violations.
 */
export function showBlockedMessageModal(reason: string, category?: string): void {
  showFeedback({
    type: 'blocked',
    title: 'Message Cannot Be Sent',
    message: reason || 'This message violates platform safety guidelines.',
    details:
      'To protect buyer & seller safety and ensure escrow guarantee, personal phone numbers, emails, profanity, and off-platform payments are restricted. Crop quantities, prices, and addresses are allowed.',
    buttonText: 'Edit Message',
  });
}

/**
 * Trigger a lightweight top-toast banner for quick notifications (e.g. Added to Cart, Signed Out).
 */
export function showToast(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success', durationMs = 3500): void {
  if (toastListener) {
    toastListener({ message, type, durationMs });
  }
}

export default function FeedbackPopup() {
  const [modalData, setModalData] = useState<FeedbackOptions | null>(null);
  const [toastData, setToastData] = useState<ToastOptions | null>(null);

  // Animations
  const modalScale = useRef(new Animated.Value(0.9)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const toastY = useRef(new Animated.Value(-100)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    feedbackListener = (opts) => {
      setModalData(opts);
      if (opts) {
        modalScale.setValue(0.9);
        modalOpacity.setValue(0);
        Animated.parallel([
          Animated.spring(modalScale, { toValue: 1, friction: 7, tension: 50, useNativeDriver: true }),
          Animated.timing(modalOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]).start();
      }
    };

    toastListener = (opts) => {
      setToastData(opts);
      if (opts) {
        toastY.setValue(-80);
        toastOpacity.setValue(0);
        Animated.parallel([
          Animated.spring(toastY, { toValue: 0, friction: 8, useNativeDriver: true }),
          Animated.timing(toastOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        ]).start();

        const timer = setTimeout(() => {
          hideToast();
        }, opts.durationMs || 3500);

        return () => clearTimeout(timer);
      }
    };

    return () => {
      feedbackListener = null;
      toastListener = null;
    };
  }, []);

  const hideModal = () => {
    Animated.parallel([
      Animated.timing(modalScale, { toValue: 0.9, duration: 150, useNativeDriver: true }),
      Animated.timing(modalOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      modalData?.onDismiss?.();
      setModalData(null);
    });
  };

  const hideToast = () => {
    Animated.parallel([
      Animated.timing(toastY, { toValue: -80, duration: 200, useNativeDriver: true }),
      Animated.timing(toastOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setToastData(null);
    });
  };

  const getTheme = (type: FeedbackType) => {
    switch (type) {
      case 'success':
        return {
          icon: 'checkmark-circle' as const,
          iconColor: '#16A34A',
          bgColor: '#DCFCE7',
          borderColor: '#86EFAC',
          btnBg: '#15803D',
          badgeText: 'SUCCESS',
        };
      case 'blocked':
      case 'error':
        return {
          icon: type === 'blocked' ? ('shield-outline' as const) : ('alert-circle' as const),
          iconColor: '#DC2626',
          bgColor: '#FEE2E2',
          borderColor: '#FCA5A5',
          btnBg: '#DC2626',
          badgeText: type === 'blocked' ? 'SAFETY RESTRICTION' : 'FAILED',
        };
      case 'warning':
        return {
          icon: 'warning-outline' as const,
          iconColor: '#D97706',
          bgColor: '#FEF3C7',
          borderColor: '#FCD34D',
          btnBg: '#D97706',
          badgeText: 'NOTICE',
        };
      case 'info':
      default:
        return {
          icon: 'information-circle' as const,
          iconColor: '#2563EB',
          bgColor: '#DBEAFE',
          borderColor: '#93C5FD',
          btnBg: '#2563EB',
          badgeText: 'INFO',
        };
    }
  };

  return (
    <>
      {/* 1. TOP FLOATING TOAST BANNER */}
      {toastData && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              transform: [{ translateY: toastY }],
              opacity: toastOpacity,
            },
          ]}
          pointerEvents="box-none"
        >
          <View
            style={[
              styles.toastBubble,
              toastData.type === 'error' && styles.toastError,
              toastData.type === 'warning' && styles.toastWarning,
            ]}
          >
            <Ionicons
              name={
                toastData.type === 'error'
                  ? 'alert-circle'
                  : toastData.type === 'warning'
                  ? 'warning-outline'
                  : 'checkmark-circle'
              }
              size={22}
              color="#FFFFFF"
              style={styles.toastIcon}
            />
            <Text style={styles.toastText} numberOfLines={2}>
              {toastData.message}
            </Text>
            <TouchableOpacity onPress={hideToast} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* 2. PROMINENT POP-UP MODAL */}
      {modalData && (
        <Modal
          visible={Boolean(modalData)}
          transparent
          animationType="none"
          onRequestClose={hideModal}
        >
          <View style={styles.modalOverlay}>
            <Pressable style={styles.backdropPressable} onPress={hideModal} />

            <Animated.View
              style={[
                styles.modalCard,
                {
                  transform: [{ scale: modalScale }],
                  opacity: modalOpacity,
                },
              ]}
            >
              {(() => {
                const theme = getTheme(modalData.type);
                return (
                  <>
                    <View style={[styles.iconCircle, { backgroundColor: theme.bgColor, borderColor: theme.borderColor }]}>
                      <Ionicons name={theme.icon} size={44} color={theme.iconColor} />
                    </View>

                    <View style={[styles.badge, { backgroundColor: theme.bgColor }]}>
                      <Text style={[styles.badgeText, { color: theme.iconColor }]}>{theme.badgeText}</Text>
                    </View>

                    <Text style={styles.modalTitle}>{modalData.title}</Text>

                    <Text style={styles.modalMessage}>{modalData.message}</Text>

                    {modalData.details && (
                      <View style={styles.detailsBox}>
                        <Ionicons name="shield-checkmark" size={16} color="#4B5563" style={{ marginRight: 6 }} />
                        <Text style={styles.detailsText}>{modalData.details}</Text>
                      </View>
                    )}

                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: theme.btnBg }]}
                      onPress={hideModal}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.actionButtonText}>
                        {modalData.buttonText || 'OK, Got It'}
                      </Text>
                    </TouchableOpacity>
                  </>
                );
              })()}
            </Animated.View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // Toast Styles
  toastContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 52 : 36,
    left: 16,
    right: 16,
    zIndex: 99999,
    alignItems: 'center',
  },
  toastBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#15803D',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    maxWidth: 500,
    width: '100%',
  },
  toastError: {
    backgroundColor: '#DC2626',
  },
  toastWarning: {
    backgroundColor: '#D97706',
  },
  toastIcon: {
    marginRight: 10,
  },
  toastText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 99998,
  },
  backdropPressable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 100,
    marginBottom: 10,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 15,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  detailsBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    borderLeftWidth: 3,
    borderLeftColor: '#6B7280',
  },
  detailsText: {
    flex: 1,
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 18,
  },
  actionButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
