// src/screens/BulkOrdersScreen.tsx
//
// Screen M-05: AI Bulk Orders Engine (Subscribed Customer Workspace).
//
// Workflow: a subscribed customer uploads (or photographs) a handwritten crop
// requirement list -> the image is sent to the local FastAPI/Qwen2-VL OCR
// backend at API_BASE_URL, which transcribes it -> the returned items
// populate an editable item list -> each item is matched, client-side,
// against SLSI-Verified farmers only (matchHandwrittenListToVerifiedFarmers
// in storage.ts) -> the customer reviews available vs. unavailable items and
// proceeds straight to checkout.
//
// The "Developer Sandbox" presets at the bottom still use a canned/simulated
// result so the matching + checkout flow is exercisable without a photo or a
// running backend.
//
// Requires `expo-image-picker` (npx expo install expo-image-picker).

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BulkMatchResult, ExtractedListItem, RootTabParamList } from '../types';
import {
  addBulkMatchItemsToCart,
  matchHandwrittenListToVerifiedFarmers,
} from '../utils/storage';
import HeaderBranding from '../components/HeaderBranding';

type BulkNavProp = BottomTabNavigationProp<RootTabParamList, 'Bulk'>;

// TODO: replace with your machine's LAN IP (e.g. "http://192.168.1.42:8000")
// so a physical device / Expo Go can reach the FastAPI backend. "localhost"
// only works from an iOS simulator running on the same machine.
const API_BASE_URL = 'http://192.168.1.153:8000';

// Canned result used only by the Developer Sandbox presets below, so the
// matching + checkout flow is exercisable without a photo or a running
// backend. Real photo uploads go through API_BASE_URL/extract-handwriting.
const SIMULATED_OCR_RESULT: Array<Omit<ExtractedListItem, 'id'>> = [
  { rawText: '40kg Carrot', cropName: 'Carrot', requestedQtyKg: 40 },
  { rawText: '15kg Beetroot', cropName: 'Beetroot', requestedQtyKg: 15 },
  { rawText: '60kg Pumpkin', cropName: 'Pumpkin', requestedQtyKg: 60 },
];

function makeItemId(): string {
  return `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatLKR(value: number): string {
  return `LKR ${Math.round(value).toLocaleString('en-LK')}`;
}

// Best-effort split of one transcribed line (e.g. "40kg Carrot" or
// "Carrot 40kg") into a crop name + quantity. Falls back to putting the
// whole line into cropName with qty 0 so the user can fix it inline.
function parseExtractedLine(raw: string): { cropName: string; qty: number } {
  const cleaned = raw.trim();
  const leading = /^(\d+(?:\.\d+)?)\s*kg\.?\s+(.+)$/i.exec(cleaned);
  if (leading) {
    return { cropName: leading[2].trim(), qty: parseFloat(leading[1]) };
  }
  const trailing = /^(.+?)\s+(\d+(?:\.\d+)?)\s*kg\.?$/i.exec(cleaned);
  if (trailing) {
    return { cropName: trailing[1].trim(), qty: parseFloat(trailing[2]) };
  }
  return { cropName: cleaned, qty: 0 };
}

export default function BulkOrdersScreen() {
  const navigation = useNavigation<BulkNavProp>();
  // Screen isn't wrapped in a SafeAreaView (it's a direct bottom-tab screen
  // rendered with headerShown: false in TabNavigator.tsx), so the brand row
  // has to account for the status bar / Dynamic Island itself.
  const insets = useSafeAreaInsets();

  // --- Subscription guard ---
  // This workspace is gated to subscribed customers. There's no real
  // subscription/account system wired into this demo yet, so this defaults
  // to "subscribed" with a toggle for testing the locked state.
  const [isSubscribedCustomer, setIsSubscribedCustomer] = useState(true);

  // --- Upload + OCR simulation ---
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  // --- Editable parsed list ---
  const [parsedItems, setParsedItems] = useState<ExtractedListItem[]>([]);

  // --- Matching ---
  const [isMatching, setIsMatching] = useState(false);
  const [matchResult, setMatchResult] = useState<BulkMatchResult | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const isPresetImage = imageUri?.startsWith('preset://') ?? false;

  // Sends the photographed/picked image to the FastAPI backend and populates
  // parsedItems from the returned extracted_items. Used for real photos only
  // — Developer Sandbox presets use the simulated result instead.
  const handleExtractHandwriting = useCallback(async (uri: string) => {
    setIsParsing(true);
    setMatchResult(null);
    try {
      // Convert the local image URI into a native binary Blob, then upload
      // it via a standard multipart FormData over global fetch(). Fetching
      // a "file://" URI and reading it as a Blob is handled natively by
      // React Native's fetch polyfill on both iOS and Android, so this
      // works consistently without any Expo file-system dependency.
      const imageBlob = await fetch(uri).then((res) => res.blob());

      const formData = new FormData();
      formData.append('file', imageBlob, 'handwritten_list.jpg');

      const response = await fetch(`${API_BASE_URL}/extract-handwriting`, {
        method: 'POST',
        body: formData,
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`);
      }

      let data: any;
      try {
        data = await response.json();
      } catch (parseError) {
        throw new Error('Server returned an unexpected (non-JSON) response.');
      }

      if (!data?.success) {
        throw new Error(data?.detail || data?.error || 'Extraction did not succeed.');
      }

      const rawItems: string[] = Array.isArray(data.extracted_items) ? data.extracted_items : [];
      const items: ExtractedListItem[] = rawItems.map((raw) => {
        const { cropName, qty } = parseExtractedLine(raw);
        return { id: makeItemId(), rawText: raw, cropName, requestedQtyKg: qty };
      });

      setParsedItems(items);

      if (items.length === 0) {
        Alert.alert(
          'No items found',
          "We couldn't read any items from that photo. Try a clearer photo, or add items manually below."
        );
      }
    } catch (error) {
      console.error('Failed to extract handwriting:', error);
      Alert.alert(
        'Could not reach the AI server',
        `Make sure the Python backend is running and reachable at ${API_BASE_URL}, then try again.`
      );
    } finally {
      setIsParsing(false);
    }
  }, []);

  const pickFromLibrary = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission needed',
          'Allow photo library access to upload your handwritten list.'
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        const uri = result.assets[0].uri;
        setImageUri(uri);
        setParsedItems([]);
        setMatchResult(null);
        handleExtractHandwriting(uri);
      }
    } catch (error) {
      console.error('Failed to open image picker:', error);
      Alert.alert('Something went wrong', 'Could not open the photo library.');
    }
  }, [handleExtractHandwriting]);

  const pickFromCamera = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission needed',
          'Allow camera access to take a photo of your handwritten list.'
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        const uri = result.assets[0].uri;
        setImageUri(uri);
        setParsedItems([]);
        setMatchResult(null);
        handleExtractHandwriting(uri);
      }
    } catch (error) {
      console.error('Failed to open camera:', error);
      Alert.alert('Something went wrong', 'Could not open the camera.');
    }
  }, [handleExtractHandwriting]);

  const handleUploadPress = useCallback(() => {
    Alert.alert('Upload Handwritten List', 'Choose a photo source', [
      { text: 'Take Photo', onPress: pickFromCamera },
      { text: 'Choose from Library', onPress: pickFromLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [pickFromCamera, pickFromLibrary]);

  // Manual "Parse List" retry button: for real photos, re-runs the backend
  // extraction; for Developer Sandbox presets, replays the simulated result
  // (there's no real image file behind a preset:// uri to send anywhere).
  const handleParseImage = useCallback(() => {
    if (!imageUri) return;
    if (isPresetImage) {
      setIsParsing(true);
      setMatchResult(null);
      setTimeout(() => {
        setParsedItems(SIMULATED_OCR_RESULT.map((item) => ({ ...item, id: makeItemId() })));
        setIsParsing(false);
      }, 1400);
      return;
    }
    handleExtractHandwriting(imageUri);
  }, [imageUri, isPresetImage, handleExtractHandwriting]);

  const updateParsedItem = useCallback(
    (id: string, patch: Partial<Pick<ExtractedListItem, 'cropName' | 'requestedQtyKg'>>) => {
      setParsedItems((items) =>
        items.map((item) => (item.id === id ? { ...item, ...patch } : item))
      );
      setMatchResult(null);
    },
    []
  );

  const removeParsedItem = useCallback((id: string) => {
    setParsedItems((items) => items.filter((item) => item.id !== id));
    setMatchResult(null);
  }, []);

  const addBlankRow = useCallback(() => {
    setParsedItems((items) => [
      ...items,
      { id: makeItemId(), rawText: '', cropName: '', requestedQtyKg: 0 },
    ]);
  }, []);

  const handleMatch = useCallback(async () => {
    const cleanItems = parsedItems.filter(
      (item) => item.cropName.trim().length > 0 && item.requestedQtyKg > 0
    );
    if (cleanItems.length === 0) {
      Alert.alert('Nothing to match', 'Add at least one item with a name and quantity.');
      return;
    }
    setIsMatching(true);
    try {
      const result = await matchHandwrittenListToVerifiedFarmers(cleanItems);
      setMatchResult(result);
    } catch (error) {
      console.error('Failed to match handwritten list:', error);
      Alert.alert('Something went wrong', 'Could not match your list. Please try again.');
    } finally {
      setIsMatching(false);
    }
  }, [parsedItems]);

  const handleCheckout = useCallback(async () => {
    if (!matchResult || matchResult.availableItems.length === 0) return;
    setIsCheckingOut(true);
    try {
      await addBulkMatchItemsToCart(matchResult.availableItems);
      Alert.alert(
        'Added to Cart',
        `${matchResult.availableItems.length} SLSI-Verified item(s) added. Continue to checkout in your cart.`,
        [{ text: 'Go to Cart', onPress: () => navigation.navigate('Cart') }]
      );
    } catch (error) {
      console.error('Failed to add bulk match items to cart:', error);
      Alert.alert('Something went wrong', 'Could not add these items to your cart.');
    } finally {
      setIsCheckingOut(false);
    }
  }, [matchResult, navigation]);

  // --- Developer Sandbox presets ---
  const applyPresetSample1 = useCallback(() => {
    setImageUri('preset://handwritten-sample-1');
    setParsedItems([
      { id: makeItemId(), rawText: '50kg Carrot', cropName: 'Carrot', requestedQtyKg: 50 },
      { id: makeItemId(), rawText: '20kg Leek', cropName: 'Leek', requestedQtyKg: 20 },
      { id: makeItemId(), rawText: '100kg Potato', cropName: 'Potato', requestedQtyKg: 100 },
    ]);
    setMatchResult(null);
  }, []);

  const applyPresetSample2 = useCallback(() => {
    setImageUri('preset://handwritten-sample-2');
    setParsedItems([
      {
        id: makeItemId(),
        rawText: '200kg Organic Beetroot',
        cropName: 'Organic Beetroot',
        requestedQtyKg: 200,
      },
      {
        id: makeItemId(),
        rawText: '10kg Exotic Herbs',
        cropName: 'Exotic Herbs',
        requestedQtyKg: 10,
      },
    ]);
    setMatchResult(null);
  }, []);

  const canMatch = parsedItems.some(
    (item) => item.cropName.trim().length > 0 && item.requestedQtyKg > 0
  );

  const grandTotal = useMemo(() => matchResult?.grandTotal ?? 0, [matchResult]);

  return (
    <View style={styles.flex}>
      {/* Full-screen processing overlay while the backend transcribes a real
          photo. Sits above everything else in the screen. */}
      {isParsing && !isPresetImage && (
        <View style={styles.extractOverlay} pointerEvents="auto">
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.extractOverlayText}>Extracting handwritten items via AI...</Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      {/* Brand Row — Header Branding Standardization Spec Section 3.2.
          Sits above the existing title/badge row rather than replacing it,
          so the "AI Bulk Orders Engine" heading and workspace badge stay
          intact. */}
      <View style={[styles.brandRow, { paddingTop: insets.top || 16 }]}>
        <HeaderBranding />
      </View>

      <View style={styles.header}>
        <Text style={styles.headerTitle}>AI Bulk Orders Engine</Text>
        <View style={styles.workspaceBadge}>
          <Text style={styles.workspaceBadgeText}>Subscribed Workspace</Text>
        </View>
      </View>

      {/* Subscription guard banner */}
      <View style={[styles.subBanner, !isSubscribedCustomer && styles.subBannerLocked]}>
        <Ionicons
          name={isSubscribedCustomer ? 'checkmark-circle' : 'lock-closed'}
          size={16}
          color={isSubscribedCustomer ? '#15803D' : '#B45309'}
        />
        <Text style={styles.subBannerText}>
          {isSubscribedCustomer
            ? 'Verified subscription active — bulk workspace unlocked.'
            : 'This workspace is for subscribed customers only.'}
        </Text>
        <Pressable onPress={() => setIsSubscribedCustomer((v) => !v)}>
          <Text style={styles.subBannerToggle}>
            {isSubscribedCustomer ? 'Simulate locked' : 'Simulate subscribed'}
          </Text>
        </Pressable>
      </View>

      {!isSubscribedCustomer ? (
        <View style={styles.lockedState}>
          <Ionicons name="lock-closed-outline" size={40} color="#6B7280" />
          <Text style={styles.lockedTitle}>Subscribe to unlock bulk ordering</Text>
          <Text style={styles.lockedBody}>
            Upload a handwritten requirement list and match it against SLSI-Verified farmers
            once your subscription is active.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Handwritten Image Upload Area */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Upload Handwritten List</Text>
            <Text style={styles.cardSubtitle}>
              A photo of a notebook page, e.g. "50kg Carrot, 20kg Leek, 100kg Potato".
            </Text>

            {imageUri ? (
              isPresetImage ? (
                <View style={styles.imagePreviewPlaceholder}>
                  <Ionicons name="document-text-outline" size={28} color="#7C3AED" />
                  <Text style={styles.imagePreviewPlaceholderText}>Sample list loaded</Text>
                </View>
              ) : (
                <Image source={{ uri: imageUri }} style={styles.imagePreview} />
              )
            ) : (
              <View style={styles.imagePlaceholder}>
                <Ionicons name="camera-outline" size={28} color="#6B7280" />
                <Text style={styles.imagePlaceholderText}>No photo selected yet</Text>
              </View>
            )}

            <View style={styles.uploadRow}>
              <Pressable style={styles.uploadButton} onPress={handleUploadPress} disabled={isParsing}>
                <Text style={styles.uploadButtonText}>📷 Upload Handwritten List</Text>
              </Pressable>
              <Pressable
                style={[styles.parseButton, !imageUri && styles.parseButtonDisabled]}
                onPress={handleParseImage}
                disabled={!imageUri || isParsing}
              >
                <Text style={styles.parseButtonText}>
                  {parsedItems.length > 0 ? 'Re-scan' : 'Parse List'}
                </Text>
              </Pressable>
            </View>

            {isParsing && (
              <View style={styles.parsingRow}>
                <ActivityIndicator size="small" color="#7C3AED" />
                <Text style={styles.parsingText}>
                  {isPresetImage
                    ? 'Parsing handwritten text...'
                    : 'Extracting handwritten items via AI...'}
                </Text>
              </View>
            )}
          </View>

          {/* Editable parsed item list */}
          {parsedItems.length > 0 && (
            <View style={styles.card}>
              <View style={styles.aiEngineBadge}>
                <Ionicons name="sparkles" size={14} color="#FFFFFF" />
                <Text style={styles.aiEngineBadgeText}>AI Vision Parsed List</Text>
              </View>
              <Text style={styles.cardSubtitle}>
                Review and correct any misread items before matching.
              </Text>

              {parsedItems.map((item) => (
                <View key={item.id} style={styles.parsedRow}>
                  <TextInput
                    style={[styles.parsedInput, styles.parsedInputName]}
                    value={item.cropName}
                    onChangeText={(text) => updateParsedItem(item.id, { cropName: text })}
                    placeholder="Crop name"
                    placeholderTextColor="#6B7280"
                  />
                  <TextInput
                    style={[styles.parsedInput, styles.parsedInputQty]}
                    value={item.requestedQtyKg ? String(item.requestedQtyKg) : ''}
                    onChangeText={(text) =>
                      updateParsedItem(item.id, { requestedQtyKg: Number(text) || 0 })
                    }
                    placeholder="kg"
                    placeholderTextColor="#6B7280"
                    keyboardType="numeric"
                  />
                  <Pressable onPress={() => removeParsedItem(item.id)} style={styles.rowRemove}>
                    <Ionicons name="close-circle" size={22} color="#6B7280" />
                  </Pressable>
                </View>
              ))}

              <Pressable style={styles.addRowButton} onPress={addBlankRow}>
                <Ionicons name="add" size={16} color="#15803D" />
                <Text style={styles.addRowButtonText}>Add item</Text>
              </Pressable>

              <Pressable
                style={[styles.matchButton, !canMatch && styles.matchButtonDisabled]}
                onPress={handleMatch}
                disabled={!canMatch || isMatching}
              >
                <Text style={styles.matchButtonText}>
                  {isMatching ? 'Matching...' : 'Match with Verified Farmers'}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Verified Match Breakdown Results */}
          {matchResult && (
            <>
              {matchResult.availableItems.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Matched & Available</Text>
                  {matchResult.availableItems.map((item) => (
                    <View key={item.cropId} style={styles.availableCard}>
                      <View style={styles.availableCardHeader}>
                        <Text style={styles.availableCardName}>{item.cropName}</Text>
                        <View style={styles.verifiedTag}>
                          <Ionicons name="shield-checkmark" size={12} color="#FFFFFF" />
                          <Text style={styles.verifiedTagText}>SLSI Verified</Text>
                        </View>
                      </View>
                      <Text style={styles.availableCardFarmer}>{item.farmerName}</Text>
                      <View style={styles.availableCardFooter}>
                        <Text style={styles.availableCardMeta}>
                          {item.requestedQtyKg}kg • LKR {item.pricePerKg}/kg
                        </Text>
                        <Text style={styles.availableCardTotal}>
                          {formatLKR(item.totalPrice)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {matchResult.unavailableItems.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Unavailable / Out of Stock</Text>
                  {matchResult.unavailableItems.map((item, index) => (
                    <View key={`${item.requestedItem}-${index}`} style={styles.unavailableCard}>
                      <View style={styles.unavailableCardHeader}>
                        <Ionicons name="warning-outline" size={16} color="#B45309" />
                        <Text style={styles.unavailableCardName}>
                          {item.requestedItem} ({item.requestedQtyKg}kg)
                        </Text>
                      </View>
                      <Text style={styles.unavailableCardReason}>{item.reason}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Grand Total & Checkout Bar */}
              <View style={[styles.card, styles.summaryCard]}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryGrandLabel}>Available Items Total</Text>
                  <Text style={styles.summaryGrandValue}>{formatLKR(grandTotal)}</Text>
                </View>
                <Pressable
                  style={[
                    styles.checkoutButton,
                    (matchResult.availableItems.length === 0 || isCheckingOut) &&
                      styles.checkoutButtonDisabled,
                  ]}
                  onPress={handleCheckout}
                  disabled={matchResult.availableItems.length === 0 || isCheckingOut}
                >
                  <Text style={styles.checkoutButtonText}>
                    {isCheckingOut ? 'Adding to Cart...' : 'Proceed to Bulk Checkout'}
                  </Text>
                </Pressable>
              </View>
            </>
          )}

          {/* Developer Sandbox Toolbar */}
          <View style={styles.sandboxCard}>
            <Text style={styles.sandboxTitle}>Developer Sandbox</Text>
            <View style={styles.sandboxRow}>
              <Pressable style={styles.sandboxButton} onPress={applyPresetSample1}>
                <Text style={styles.sandboxButtonText}>Preset: Handwritten Sample 1</Text>
              </Pressable>
              <Pressable style={styles.sandboxButton} onPress={applyPresetSample2}>
                <Text style={styles.sandboxButtonText}>Preset: Handwritten Sample 2</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#FAFAFA' },
  extractOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    backgroundColor: 'rgba(17, 24, 39, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  extractOverlayText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#111827' },
  workspaceBadge: {
    backgroundColor: '#15803D',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  workspaceBadgeText: { fontSize: 12, color: '#FFFFFF', fontWeight: '600' },
  subBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F0FDF4',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  subBannerLocked: { backgroundColor: '#FFFBEB' },
  subBannerText: { flex: 1, fontSize: 12, color: '#111827' },
  subBannerToggle: { fontSize: 12, color: '#7C3AED', fontWeight: '600' },
  lockedState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  lockedTitle: { fontSize: 16, fontWeight: '600', color: '#111827', textAlign: 'center' },
  lockedBody: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 16 },
  card: {
    backgroundColor: '#F4F4F5',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  cardSubtitle: { fontSize: 12, color: '#6B7280', marginTop: -4 },
  imagePreview: { width: '100%', height: 180, borderRadius: 12, backgroundColor: '#E5E7EB' },
  imagePreviewPlaceholder: {
    width: '100%',
    height: 140,
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  imagePreviewPlaceholderText: { fontSize: 12, color: '#7C3AED', fontWeight: '600' },
  imagePlaceholder: {
    width: '100%',
    height: 140,
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  imagePlaceholderText: { fontSize: 12, color: '#6B7280' },
  uploadRow: { flexDirection: 'row', gap: 8 },
  uploadButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#15803D',
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  uploadButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  parseButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    paddingHorizontal: 16,
  },
  parseButtonDisabled: { opacity: 0.5 },
  parseButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  parsingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  parsingText: { fontSize: 12, color: '#7C3AED', fontStyle: 'italic' },
  aiEngineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  aiEngineBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  parsedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  parsedInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    color: '#111827',
    fontSize: 14,
  },
  parsedInputName: { flex: 2 },
  parsedInputQty: { flex: 1 },
  rowRemove: { padding: 4 },
  addRowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    minHeight: 32,
  },
  addRowButtonText: { color: '#15803D', fontSize: 13, fontWeight: '600' },
  matchButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#15803D',
    borderRadius: 12,
    marginTop: 4,
  },
  matchButtonDisabled: { opacity: 0.5 },
  matchButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', letterSpacing: 0.25 },
  availableCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#15803D',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  availableCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  availableCardName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  verifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#15803D',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  verifiedTagText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  availableCardFarmer: { fontSize: 12, color: '#6B7280' },
  availableCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  availableCardMeta: { fontSize: 12, color: '#111827' },
  availableCardTotal: { fontSize: 14, fontWeight: '700', color: '#15803D' },
  unavailableCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FBBF24',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  unavailableCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  unavailableCardName: { fontSize: 13, fontWeight: '700', color: '#111827' },
  unavailableCardReason: { fontSize: 12, color: '#92400E', lineHeight: 17 },
  summaryCard: { backgroundColor: '#111827', borderColor: '#111827' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryGrandLabel: { fontSize: 14, color: '#D1D5DB' },
  summaryGrandValue: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  checkoutButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16A34A',
    borderRadius: 12,
    marginTop: 4,
  },
  checkoutButtonDisabled: { opacity: 0.5 },
  checkoutButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', letterSpacing: 0.25 },
  sandboxCard: { backgroundColor: '#111827', borderRadius: 16, padding: 16, gap: 10 },
  sandboxTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  sandboxRow: { flexDirection: 'row', gap: 8 },
  sandboxButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#374151',
    borderRadius: 10,
    paddingHorizontal: 6,
  },
  sandboxButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600', textAlign: 'center' },
});