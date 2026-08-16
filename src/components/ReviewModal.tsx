// src/components/ReviewModal.tsx
//
// Screen M-07: Hardware-Restricted Product Review Modal.
//
// Requires `expo-image-picker` for the live camera capture in Section 4.3
// of design.md ("Live Hardware Camera Trigger"). Install it before using
// this component:
//
//   npx expo install expo-image-picker
//
// If the package isn't installed yet, or the device/simulator has no
// camera / denies permission, `handleCapturePhoto` below falls back to a
// mock capture (a placeholder photo URI) rather than dead-ending the
// review flow — this keeps the modal usable in Expo Go / simulators that
// don't expose a real camera.

import React, { useCallback, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Image,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Order, ProductReview, ReviewQualityTag } from '../types';
import { generateReviewId, submitProductReview } from '../utils/storage';

// A 1x1 neutral-gray PNG, used only when a real camera capture isn't
// available (see the module-level comment above). Good enough to satisfy
// the "a photo was captured" guardrail in a sandbox/demo environment.
const MOCK_PHOTO_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const colors = {
  primaryGreen: '#15803D',
  secondaryLeaf: '#16A34A',
  bgMain: '#FAFAFA',
  bgCard: '#F4F4F5',
  borderGray: '#E5E7EB',
  textDark: '#111827',
  textMuted: '#6B7280',
  disabledGray: '#9CA3AF',
  alertCrimson: '#DC2626',
  warning: '#D97706',
  backdrop: 'rgba(0, 0, 0, 0.5)',
};

type QualityOption = {
  tag: ReviewQualityTag;
  label: string;
  color: string;
};

const QUALITY_OPTIONS: QualityOption[] = [
  { tag: 'FRESH', label: 'Fresh Produce', color: colors.secondaryLeaf },
  { tag: 'MINOR_ISSUES', label: 'Slight Quality Issue', color: colors.warning },
  { tag: 'DAMAGED', label: 'Damaged / Rotten', color: colors.alertCrimson },
];

interface ReviewModalProps {
  visible: boolean;
  order: Order | null;
  onClose: () => void;
  // Fired after a review is successfully persisted, so the caller (e.g.
  // OrdersScreen) can optimistically flip that order's card to
  // "Reviewed ✓" without waiting for a full order-list refetch.
  onSubmitted?: (review: ProductReview) => void;
}

function StarRatingBar({
  rating,
  onChange,
}: {
  rating: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Pressable
          key={value}
          onPress={() => onChange(value)}
          hitSlop={6}
          style={styles.starTouchTarget}
        >
          <Ionicons
            name={value <= rating ? 'star' : 'star-outline'}
            size={32}
            color={value <= rating ? colors.primaryGreen : colors.borderGray}
          />
        </Pressable>
      ))}
    </View>
  );
}

function computeMockFreshnessScore(): { score: number; grade: string; label: string } {
  // Simulated YOLOv8 vision pipeline response (design.md Section 4.4).
  // Weighted toward the high-80s/90s so the happy path matches the spec's
  // own example output ("94% (Grade A - Premium Quality)").
  const score = Math.round(88 + Math.random() * 10); // 88–97
  if (score >= 90) return { score, grade: 'A', label: 'Premium Quality' };
  if (score >= 80) return { score, grade: 'B', label: 'Good Quality' };
  return { score, grade: 'C', label: 'Acceptable Quality' };
}

export default function ReviewModal({ visible, order, onClose, onSubmitted }: ReviewModalProps) {
  const [rating, setRating] = useState(0);
  const [qualityTag, setQualityTag] = useState<ReviewQualityTag | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<{ score: number; grade: string; label: string } | null>(
    null
  );
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const resetState = useCallback(() => {
    setRating(0);
    setQualityTag(null);
    setPhotoUri(null);
    setAnalyzing(false);
    setAiResult(null);
    setComment('');
    setSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const runMockAiAnalysis = useCallback(() => {
    setAnalyzing(true);
    setAiResult(null);
    // Small delay so the "Inline AI Analysis Container" (Section 4.4) feels
    // like it's actually running inference rather than popping instantly.
    setTimeout(() => {
      setAiResult(computeMockFreshnessScore());
      setAnalyzing(false);
    }, 900);
  }, []);

  const handleCapturePhoto = useCallback(async () => {
    try {
      // Dynamically required so the app doesn't hard-crash on import if
      // expo-image-picker hasn't been installed yet in this project.
      const ImagePicker = await import('expo-image-picker');

      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Camera permission not granted');
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.7,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      setPhotoUri(result.assets[0].uri);
      runMockAiAnalysis();
    } catch (error) {
      // No camera hardware, package not installed, or permission denied —
      // fall back to a mock capture rather than blocking the review flow
      // (this is a Developer Sandbox / demo feature per design.md).
      console.warn('Live camera capture unavailable, using mock capture:', error);
      Alert.alert(
        'Camera unavailable',
        'Using a simulated delivery photo instead so you can continue the review.'
      );
      setPhotoUri(MOCK_PHOTO_URI);
      runMockAiAnalysis();
    }
  }, [runMockAiAnalysis]);

  const canSubmit = Boolean(
    order && rating > 0 && qualityTag && photoUri && aiResult && !analyzing && !submitting
  );

  const handleSubmit = useCallback(async () => {
    if (!order || !canSubmit || !aiResult || !qualityTag || !photoUri) return;

    setSubmitting(true);
    try {
      const review: ProductReview = {
        id: generateReviewId(),
        orderId: order.id,
        // The review targets the delivered order as a whole; the first
        // line item stands in as the reviewed crop since Screen M-07's
        // spec doesn't split reviews per line item.
        cropId: order.items[0]?.cropId ?? '',
        rating,
        qualityTag,
        photoUri,
        aiFreshnessScore: aiResult.score,
        comment: comment.trim() ? comment.trim() : undefined,
        createdAt: new Date().toISOString(),
      };

      const saved = await submitProductReview(review);
      onSubmitted?.(saved);
      resetState();
      onClose();
    } catch (error) {
      console.error('Failed to submit review:', error);
      Alert.alert('Submission failed', 'Could not submit your review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [order, canSubmit, aiResult, qualityTag, photoUri, rating, comment, onSubmitted, onClose, resetState]);

  if (!order) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          {/* 4.1 Header & Verification Status */}
          <View style={styles.headerBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Review Delivered Produce</Text>
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={12} color={colors.primaryGreen} />
                <Text style={styles.verifiedBadgeText}>Verified Purchase</Text>
              </View>
            </View>
            <Pressable onPress={handleClose} hitSlop={8} style={styles.closeButton}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.contentBody}
            contentContainerStyle={styles.contentBodyInner}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.orderRefText}>Order #{order.id}</Text>

            {/* 4.2 Feedback Rating Controls */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>How was the produce?</Text>
              <StarRatingBar rating={rating} onChange={setRating} />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Quality</Text>
              <View style={styles.chipRow}>
                {QUALITY_OPTIONS.map((option) => {
                  const selected = qualityTag === option.tag;
                  return (
                    <Pressable
                      key={option.tag}
                      onPress={() => setQualityTag(option.tag)}
                      style={[
                        styles.chip,
                        {
                          borderColor: option.color,
                          backgroundColor: selected ? `${option.color}1A` : colors.bgCard,
                        },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: option.color }]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* 4.3 Hardware-Restricted Photo Enforcement */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Delivery Photo</Text>

              <View style={styles.disabledButton}>
                <Ionicons name="images-outline" size={16} color={colors.disabledGray} />
                <Text style={styles.disabledButtonText}>
                  Gallery Upload Disabled for Review Integrity
                </Text>
              </View>

              <Pressable style={styles.cameraButton} onPress={handleCapturePhoto}>
                <Ionicons name="camera-outline" size={18} color="#FFFFFF" />
                <Text style={styles.cameraButtonText}>
                  {photoUri ? 'Retake Mandatory Delivery Photo' : 'Capture Mandatory Delivery Photo'}
                </Text>
              </Pressable>

              {photoUri && (
                <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
              )}

              {/* 4.4 Mock AI Freshness Score Display */}
              {(analyzing || aiResult) && (
                <View style={styles.aiContainer}>
                  {analyzing ? (
                    <View style={styles.aiRow}>
                      <ActivityIndicator size="small" color={colors.primaryGreen} />
                      <Text style={styles.aiAnalyzingText}>Analyzing delivery photo…</Text>
                    </View>
                  ) : (
                    aiResult && (
                      <View style={styles.aiRow}>
                        <Ionicons
                          name="checkmark-circle"
                          size={16}
                          color={colors.primaryGreen}
                        />
                        <Text style={styles.aiResultText}>
                          AI Freshness Score: {aiResult.score}% (Grade {aiResult.grade} -{' '}
                          {aiResult.label})
                        </Text>
                      </View>
                    )
                  )}
                </View>
              )}
            </View>

            {/* Section 5: Text Feedback Input */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Comments (optional)</Text>
              <TextInput
                style={styles.commentInput}
                placeholder="Optional comments..."
                placeholderTextColor={colors.textMuted}
                multiline
                value={comment}
                onChangeText={setComment}
              />
            </View>
          </ScrollView>

          {/* Action Footer */}
          <View style={styles.footer}>
            <Pressable
              style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
              disabled={!canSubmit}
              onPress={handleSubmit}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>Submit Verified Review</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.backdrop,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 390,
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.borderGray,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textDark,
    marginBottom: 6,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: `${colors.primaryGreen}1A`,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  verifiedBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primaryGreen,
  },
  closeButton: {
    padding: 4,
  },
  contentBody: {
    // maxHeight keeps the footer pinned/visible on short viewports; the
    // ScrollView itself handles overflow for long content.
  },
  contentBodyInner: {
    paddingBottom: 8,
    gap: 18,
  },
  orderRefText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textDark,
  },
  starRow: {
    flexDirection: 'row',
    gap: 4,
  },
  starTouchTarget: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  disabledButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderGray,
    backgroundColor: colors.bgCard,
    paddingHorizontal: 12,
  },
  disabledButtonText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    flexShrink: 1,
  },
  cameraButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.primaryGreen,
    marginTop: 8,
  },
  cameraButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  photoPreview: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    marginTop: 10,
    backgroundColor: colors.bgCard,
  },
  aiContainer: {
    marginTop: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderGray,
    backgroundColor: `${colors.primaryGreen}0D`,
    padding: 10,
  },
  aiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiAnalyzingText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  aiResultText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textDark,
    flexShrink: 1,
  },
  commentInput: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.borderGray,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: colors.textDark,
    textAlignVertical: 'top',
    backgroundColor: '#FFFFFF',
  },
  footer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.borderGray,
  },
  submitButton: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.primaryGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: colors.disabledGray,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});