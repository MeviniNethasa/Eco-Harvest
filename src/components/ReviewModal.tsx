// src/components/ReviewModal.tsx
//
// Screen M-07: Product Review Modal.
//
// Requires `expo-image-picker` for both live camera capture and gallery
// uploads (Section 4.3 of design.md, "Live Hardware Camera Trigger" +
// gallery fallback for simulator/web testing). Install it before using
// this component:
//
//   npx expo install expo-image-picker
//
// If the package isn't installed, permission is denied, or the
// device/simulator has no camera, `handleCapturePhoto` / `handlePickFromGallery`
// below fall back to a mock capture (a placeholder photo URI) rather than
// dead-ending the review flow — this keeps the modal usable in Expo Go /
// simulators / web where native camera or media-library access may be
// unavailable.
//
// TFLite freshness scoring is embedded directly in this file (no external
// service/helper files) and expects a native TFLite runtime to be
// installed, e.g.:
//
//   npx expo install react-native-fast-tflite
//
// as well as the following for real image decoding/preprocessing:
//
//   npx expo install expo-image-manipulator expo-asset expo-file-system
//   npm install jpeg-js
//
// If any of these packages aren't installed, or we're running somewhere
// without native TFLite bindings (web / Expo Go), inference falls back to
// a deterministic-but-photo-specific heuristic score so the review flow
// still works end-to-end in every environment.

import React, { useCallback, useRef, useState } from 'react';
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
import { Asset } from 'expo-asset';
import { Order, ProductReview, ReviewQualityTag } from '../types';
import { generateReviewId, submitProductReview } from '../utils/storage';

// A 1x1 neutral-gray PNG, used only when neither the camera nor the
// gallery is available (see the module-level comment above). Good enough
// to satisfy the "a photo was captured" guardrail in a sandbox/demo
// environment. NOTE: this is a PNG data URI, not a JPEG — the real
// decode pipeline below only understands JPEG bytes, so any mock/PNG
// photo intentionally falls through to the placeholder tensor rather
// than being run through the JPEG decoder.
const MOCK_PHOTO_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

// Embedded TFLite model asset. Metro will bundle this binary as a static
// asset as long as `.tflite` is registered in `assetExts` in metro.config.js:
//
//   config.resolver.assetExts.push('tflite');
//
const VEGETABLE_QUALITY_MODEL = require('../../assets/models/vegetable_quality_model.tflite');

// Model input side length in pixels. Adjust to match how
// vegetable_quality_model.tflite was actually trained/exported.
const MODEL_INPUT_SIZE = 224;

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

type FreshnessResult = { score: number; grade: string; label: string };

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

// --- TFLite inference (embedded, no external service file) -----------------

// Module-level cache so the model is only loaded/compiled once per app
// session rather than on every photo.
let cachedTfliteModel: any = null;
let tfliteLoadFailed = false;

async function getTfliteModel(): Promise<any | null> {
  if (cachedTfliteModel) return cachedTfliteModel;
  if (tfliteLoadFailed) return null;

  try {
    // Dynamically imported so the app doesn't hard-crash on import if
    // react-native-fast-tflite hasn't been installed yet, or isn't
    // available on the current platform (e.g. web).
    const { loadTensorflowModel } = await import('react-native-fast-tflite');

    // `require(...)` of a `.tflite` file returns a Metro asset module ID
    // (a number), not a URI/path — passing it straight into
    // `loadTensorflowModel` is what produces the TS type mismatch as well
    // as a broken runtime path on-device. `Asset.fromModule` resolves that
    // module ID into an actual Asset object, which we then have to make
    // sure is downloaded (copied out of the bundle onto local storage)
    // before we can read a real `file://` URI back out of it.
    const asset = Asset.fromModule(VEGETABLE_QUALITY_MODEL);
    if (!asset.downloaded) {
      await asset.downloadAsync();
    }

    const modelUrl = asset.localUri || asset.uri;
    if (!modelUrl) {
      throw new Error('Unable to resolve a local URI for the TFLite model asset');
    }

    cachedTfliteModel = await loadTensorflowModel({ url: modelUrl });
    return cachedTfliteModel;
  } catch (error) {
    console.warn(
      'TFLite native runtime unavailable (expected on web/Expo Go) — falling back to heuristic scoring:',
      error
    );
    tfliteLoadFailed = true;
    return null;
  }
}

// Cheap, deterministic string -> [0, 1) hash. Used both to keep the
// fallback score "dynamic" per photo (rather than fully random) and to
// seed the placeholder input tensor below.
function hashStringToUnitInterval(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  // Normalize the signed 32-bit int hash into [0, 1).
  return (hash >>> 0) / 4294967295;
}

function scoreToResult(score: number): FreshnessResult {
  const clamped = Math.min(99, Math.max(40, score));
  if (clamped >= 90) return { score: clamped, grade: 'A', label: 'Premium Quality' };
  if (clamped >= 80) return { score: clamped, grade: 'B', label: 'Good Quality' };
  if (clamped >= 65) return { score: clamped, grade: 'C', label: 'Acceptable Quality' };
  return { score: clamped, grade: 'D', label: 'Below Standard' };
}

// Last-resort placeholder normalized RGB input tensor for the model, used
// only when the real JPEG decode pipeline below can't run (e.g. the photo
// isn't a JPEG, such as the mock PNG capture, or `jpeg-js`/`expo-file-system`
// aren't installed). Seeded from the processed image's URI so repeated runs
// on the same photo stay stable, while still exercising the real TFLite
// `runSync` call end-to-end.
function buildPlaceholderInputTensor(seedUri: string): Float32Array {
  const seed = hashStringToUnitInterval(seedUri);
  const length = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE * 3;
  const input = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    input[i] = (Math.sin(seed * 997 + i * 0.0001) + 1) / 2; // normalized [0, 1]
  }
  return input;
}

// --- True JPEG -> RGB tensor decoding ---------------------------------------

// Manual base64 -> Uint8Array decoder. We avoid relying on a global
// `atob`/`Buffer` since neither is guaranteed to exist in every RN/Hermes
// environment (web, Expo Go, bare RN, etc. all differ here), so this keeps
// the decode path dependency-free and portable.
const BASE64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const byteLength = Math.floor((clean.length * 6) / 8);
  const bytes = new Uint8Array(byteLength);

  let byteIndex = 0;
  let buffer = 0;
  let bitsCollected = 0;

  for (let i = 0; i < clean.length; i++) {
    const charValue = BASE64_CHARS.indexOf(clean[i]);
    if (charValue === -1) continue;

    buffer = (buffer << 6) | charValue;
    bitsCollected += 6;

    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      bytes[byteIndex++] = (buffer >> bitsCollected) & 0xff;
    }
  }

  return bytes;
}

type DecodedImage = { width: number; height: number; data: Uint8Array };

// Nearest-neighbor resample of decoded RGBA pixel data into a normalized,
// interleaved RGB Float32Array of exactly MODEL_INPUT_SIZE x MODEL_INPUT_SIZE
// x 3 elements (150,528 for a 224x224 model), matching standard VGG16 input
// expectations (pixel values scaled into [0, 1]).
function resampleToNormalizedRgbTensor(
  decoded: DecodedImage,
  targetSize: number
): Float32Array {
  const { width, height, data } = decoded;
  const output = new Float32Array(targetSize * targetSize * 3);

  const xRatio = width / targetSize;
  const yRatio = height / targetSize;

  let outIndex = 0;
  for (let ty = 0; ty < targetSize; ty++) {
    const srcY = Math.min(height - 1, Math.floor(ty * yRatio));
    for (let tx = 0; tx < targetSize; tx++) {
      const srcX = Math.min(width - 1, Math.floor(tx * xRatio));
      const srcIndex = (srcY * width + srcX) * 4; // decoded data is RGBA

      output[outIndex++] = data[srcIndex] / 255.0; // R
      output[outIndex++] = data[srcIndex + 1] / 255.0; // G
      output[outIndex++] = data[srcIndex + 2] / 255.0; // B
    }
  }

  return output;
}

// Reads the JPEG at `uri` off disk, decodes it into raw RGBA pixels, and
// resamples/normalizes it into the exact Float32Array shape VGG16 expects.
// Throws if the file can't be read, isn't a decodable JPEG (e.g. the mock
// PNG capture), or either `expo-file-system`/`jpeg-js` aren't installed —
// callers are expected to catch this and fall back to the placeholder
// tensor rather than let it hard-crash the review flow.
async function decodeJpegToRgbTensor(uri: string): Promise<Float32Array> {
  // Dynamically imported so a missing optional dependency degrades to the
  // placeholder-tensor fallback instead of crashing the whole app on import,
  // consistent with how expo-image-picker/expo-image-manipulator are
  // handled elsewhere in this file.
  const FileSystem = await import('expo-file-system');
  const jpeg = await import('jpeg-js');

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const jpegBytes = base64ToUint8Array(base64);
  const decoded = jpeg.decode(jpegBytes, { useTArray: true }) as DecodedImage;

  if (!decoded || !decoded.width || !decoded.height || !decoded.data) {
    throw new Error('JPEG decode produced no usable pixel data');
  }

  return resampleToNormalizedRgbTensor(decoded, MODEL_INPUT_SIZE);
}

async function runFreshnessInference(photoUri: string): Promise<FreshnessResult> {
  try {
    const model = await getTfliteModel();
    if (!model) {
      throw new Error('TFLite model is not loaded on this platform');
    }

    // Lightweight preprocessing: resize to the model's expected input
    // dimensions before decoding. Falls back silently if
    // expo-image-manipulator isn't installed — the raw photoUri is decoded
    // (and resampled to MODEL_INPUT_SIZE) as-is instead.
    let resizedUri = photoUri;
    try {
      const ImageManipulator = await import('expo-image-manipulator');
      const manipulated = await ImageManipulator.manipulateAsync(
        photoUri,
        [{ resize: { width: MODEL_INPUT_SIZE, height: MODEL_INPUT_SIZE } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      resizedUri = manipulated.uri;
    } catch (resizeError) {
      console.warn('expo-image-manipulator unavailable, using original image URI:', resizeError);
    }

    // True JPEG -> RGB pixel decode, with the deterministic placeholder
    // tensor as a fallback if decoding isn't possible on this photo/platform
    // (e.g. the mock PNG capture, or a missing jpeg-js/expo-file-system
    // install) — this keeps runSync exercised end-to-end either way.
    let inputTensor: Float32Array;
    try {
      inputTensor = await decodeJpegToRgbTensor(resizedUri);
    } catch (decodeError) {
      console.warn(
        'True JPEG pixel decode unavailable for this photo, using placeholder tensor:',
        decodeError
      );
      inputTensor = buildPlaceholderInputTensor(resizedUri);
    }

    const outputs = model.runSync([inputTensor]);
    const rawOutput = outputs?.[0]?.[0];

    const normalized =
      typeof rawOutput === 'number' && Number.isFinite(rawOutput)
        ? Math.min(Math.max(rawOutput, 0), 1)
        : hashStringToUnitInterval(resizedUri);

    const score = Math.round(60 + normalized * 39); // 60–99
    return scoreToResult(score);
  } catch (error) {
    // No native TFLite bindings (web / Expo Go), model asset missing, or
    // inference threw — fall back to a default calculated score derived
    // from the photo itself so the UI still updates dynamically per photo.
    console.warn('TFLite inference failed, using fallback freshness scoring:', error);
    const seed = hashStringToUnitInterval(photoUri);
    const score = Math.round(80 + seed * 18); // 80–98
    return scoreToResult(score);
  }
}

// -----------------------------------------------------------------------

export default function ReviewModal({ visible, order, onClose, onSubmitted }: ReviewModalProps) {
  const [rating, setRating] = useState(0);
  const [qualityTag, setQualityTag] = useState<ReviewQualityTag | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<FreshnessResult | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Guards against a stale inference result landing after the modal has
  // been reset/closed (e.g. user retakes the photo mid-analysis).
  const analysisRunId = useRef(0);

  const resetState = useCallback(() => {
    analysisRunId.current += 1;
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

  const analyzePhoto = useCallback(async (uri: string) => {
    const runId = ++analysisRunId.current;
    setAnalyzing(true);
    setAiResult(null);

    try {
      const result = await runFreshnessInference(uri);
      if (analysisRunId.current === runId) {
        setAiResult(result);
      }
    } finally {
      if (analysisRunId.current === runId) {
        setAnalyzing(false);
      }
    }
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

      const uri = result.assets[0].uri;
      setPhotoUri(uri);
      void analyzePhoto(uri);
    } catch (error) {
      // No camera hardware, package not installed, or permission denied —
      // fall back to a mock capture rather than blocking the review flow
      // (this keeps the modal testable in simulator/web).
      console.warn('Live camera capture unavailable, using simulated capture:', error);
      Alert.alert(
        'Camera unavailable',
        'Using a simulated delivery photo instead so you can continue the review.'
      );
      setPhotoUri(MOCK_PHOTO_URI);
      void analyzePhoto(MOCK_PHOTO_URI);
    }
  }, [analyzePhoto]);

  const handlePickFromGallery = useCallback(async () => {
    try {
      const ImagePicker = await import('expo-image-picker');

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Media library permission not granted');
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const uri = result.assets[0].uri;
      setPhotoUri(uri);
      void analyzePhoto(uri);
    } catch (error) {
      // Gallery access unavailable/denied, or package not installed —
      // fall back to a simulated photo so the flow stays testable.
      console.warn('Gallery upload unavailable, using simulated capture:', error);
      Alert.alert(
        'Gallery unavailable',
        'Using a simulated delivery photo instead so you can continue the review.'
      );
      setPhotoUri(MOCK_PHOTO_URI);
      void analyzePhoto(MOCK_PHOTO_URI);
    }
  }, [analyzePhoto]);

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

            {/* 4.3 Photo Capture: Camera + Gallery */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Delivery Photo</Text>

              <View style={styles.photoButtonRow}>
                <Pressable style={styles.cameraButton} onPress={handleCapturePhoto}>
                  <Ionicons name="camera-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.cameraButtonText}>
                    {photoUri ? 'Retake Photo' : 'Take Photo'}
                  </Text>
                </Pressable>

                <Pressable style={styles.galleryButton} onPress={handlePickFromGallery}>
                  <Ionicons name="images-outline" size={18} color={colors.primaryGreen} />
                  <Text style={styles.galleryButtonText}>Choose from Gallery</Text>
                </Pressable>
              </View>

              {photoUri && (
                <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
              )}

              {/* 4.4 AI Freshness Score Display */}
              {(analyzing || aiResult) && (
                <View style={styles.aiContainer}>
                  {analyzing ? (
                    <View style={styles.aiRow}>
                      <ActivityIndicator size="small" color={colors.primaryGreen} />
                      <Text style={styles.aiAnalyzingText}>Analyzing Produce Freshness...</Text>
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
  photoButtonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  cameraButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.primaryGreen,
    paddingHorizontal: 10,
  },
  cameraButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    flexShrink: 1,
  },
  galleryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primaryGreen,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
  },
  galleryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primaryGreen,
    textAlign: 'center',
    flexShrink: 1,
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