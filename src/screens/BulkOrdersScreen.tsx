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
// Gated to customers with `subscriptionPlan === 'BULK_ACCESS'`. Unsubscribed
// customers are presented with a feature paywall and an "Upgrade to Bulk Access"
// Stripe checkout flow.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BulkMatchResult, CustomerProfile, ExtractedListItem, RootTabParamList } from '../types';
import {
  addBulkMatchItemsToCart,
  generateCustomerId,
  getUserProfile,
  matchHandwrittenListToVerifiedFarmers,
  saveUserProfile,
  subscribeToUserProfile,
} from '../utils/storage';
import HeaderBranding from '../components/HeaderBranding';
import StripeCheckoutModal from '../components/StripeCheckoutModal';

type BulkNavProp = BottomTabNavigationProp<RootTabParamList, 'Bulk'>;

const API_BASE_URL = 'http://192.168.1.153:8000';

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
  const insets = useSafeAreaInsets();

  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isStripeModalVisible, setIsStripeModalVisible] = useState(false);

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

  const loadProfile = useCallback(async () => {
    try {
      const p = await getUserProfile();
      setCustomerProfile(p);
    } catch (e) {
      console.error('Failed to load profile for bulk orders:', e);
    } finally {
      setIsLoadingProfile(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  useEffect(() => {
    return subscribeToUserProfile((p) => {
      setCustomerProfile(p);
    });
  }, []);

  const isSubscribedCustomer = customerProfile?.subscriptionPlan === 'BULK_ACCESS';

  const handleUpgradeSuccess = async () => {
    try {
      const updated: CustomerProfile = {
        id: customerProfile?.id ?? generateCustomerId(),
        fullName: customerProfile?.fullName ?? 'Bulk Buyer',
        phoneNumber: customerProfile?.phoneNumber ?? '0771234567',
        city: customerProfile?.city ?? 'Colombo',
        district: customerProfile?.district ?? 'Colombo',
        subscriptionPlan: 'BULK_ACCESS',
        createdAt: customerProfile?.createdAt ?? new Date().toISOString(),
      };
      await saveUserProfile(updated);
      setCustomerProfile(updated);
      setIsStripeModalVisible(false);
    } catch (e) {
      console.error('Failed to save upgraded subscription:', e);
    }
  };

  const handleExtractHandwriting = useCallback(async (uri: string) => {
    setIsParsing(true);
    setMatchResult(null);
    try {
      const imageBlob = await fetch(uri).then((res) => res.blob());
      const formData = new FormData();
      formData.append('file', imageBlob, 'handwritten_list.jpg');

      const response = await fetch(`${API_BASE_URL}/extract-handwriting`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const data = await response.json();
      const extracted: Array<{ raw_text?: string; crop_name?: string; requested_qty_kg?: number }> =
        data.extracted_items || [];

      if (extracted.length === 0) {
        Alert.alert('No items found', 'Could not detect any crop list items in this image.');
        setParsedItems([]);
        return;
      }

      const newItems: ExtractedListItem[] = extracted.map((item) => {
        if (item.crop_name && item.requested_qty_kg) {
          return {
            id: makeItemId(),
            rawText: item.raw_text || `${item.requested_qty_kg}kg ${item.crop_name}`,
            cropName: item.crop_name,
            requestedQtyKg: item.requested_qty_kg,
          };
        }
        const parsed = parseExtractedLine(item.raw_text || '');
        return {
          id: makeItemId(),
          rawText: item.raw_text || '',
          cropName: parsed.cropName,
          requestedQtyKg: parsed.qty,
        };
      });

      setParsedItems(newItems);
    } catch (error) {
      console.warn('FastAPI extraction unavailable — falling back to simulated parse:', error);
      setTimeout(() => {
        setParsedItems(SIMULATED_OCR_RESULT.map((item) => ({ ...item, id: makeItemId() })));
        Alert.alert('Demo Mode Active', 'Backend unreachable. Loaded simulated handwritten crop list.');
      }, 1000);
    } finally {
      setIsParsing(false);
    }
  }, []);

  const pickFromLibrary = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow photo library access to upload a list photo.');
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
      console.error('Failed to open photo library:', error);
      Alert.alert('Something went wrong', 'Could not open the photo library.');
    }
  }, [handleExtractHandwriting]);

  const pickFromCamera = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow camera access to take a photo of your handwritten list.');
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

  const canMatch = parsedItems.some(
    (item) => item.cropName.trim().length > 0 && item.requestedQtyKg > 0
  );

  if (isLoadingProfile) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#15803D" />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
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
        <View style={[styles.brandRow, { paddingTop: Math.max(insets.top, 12) }]}>
          <HeaderBranding />
        </View>

        <View style={styles.header}>
          <Text style={styles.headerTitle}>AI Bulk Orders Engine</Text>
          <View style={[styles.workspaceBadge, !isSubscribedCustomer && styles.workspaceBadgeLocked]}>
            <Text style={[styles.workspaceBadgeText, !isSubscribedCustomer && styles.workspaceBadgeTextLocked]}>
              {isSubscribedCustomer ? 'Subscribed Workspace' : 'Bulk Access Plan Required'}
            </Text>
          </View>
        </View>

        {!isSubscribedCustomer ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Feature Paywall Card */}
            <View style={styles.paywallCard}>
              <View style={styles.paywallHeaderRow}>
                <View style={styles.paywallIconCircle}>
                  <Ionicons name="sparkles" size={26} color="#15803D" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.paywallBadge}>PREMIUM BUYER WORKSPACE</Text>
                  <Text style={styles.paywallTitle}>AI Bulk Orders & Farm Matching</Text>
                </View>
              </View>

              <Text style={styles.paywallSubtitle}>
                Designed for restaurants, hotels, caterers, and processors to source volume crops
                directly from certified organic farms.
              </Text>

              <View style={styles.benefitsList}>
                <View style={styles.benefitRow}>
                  <View style={styles.checkCircle}>
                    <Ionicons name="checkmark" size={14} color="#15803D" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.benefitTitle}>AI Handwritten List OCR</Text>
                    <Text style={styles.benefitDesc}>
                      Photograph your whiteboard or notebook demand sheet to transcribe items instantly.
                    </Text>
                  </View>
                </View>

                <View style={styles.benefitRow}>
                  <View style={styles.checkCircle}>
                    <Ionicons name="checkmark" size={14} color="#15803D" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.benefitTitle}>SLSI-Verified Farm Matching</Text>
                    <Text style={styles.benefitDesc}>
                      Matching algorithm pairs your volume demands with verified organic farms.
                    </Text>
                  </View>
                </View>

                <View style={styles.benefitRow}>
                  <View style={styles.checkCircle}>
                    <Ionicons name="checkmark" size={14} color="#15803D" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.benefitTitle}>Wholesale Farm Gate Pricing</Text>
                    <Text style={styles.benefitDesc}>
                      Direct farmer rates with no distributor commissions or middleman markups.
                    </Text>
                  </View>
                </View>

                <View style={styles.benefitRow}>
                  <View style={styles.checkCircle}>
                    <Ionicons name="checkmark" size={14} color="#15803D" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.benefitTitle}>Consolidated Multi-Farm Logistics</Text>
                    <Text style={styles.benefitDesc}>
                      Single consolidated cart checkout with live Uber-style batch dispatch tracking.
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.pricingCard}>
                <View>
                  <Text style={styles.pricingAmount}>LKR 9,500</Text>
                  <Text style={styles.pricingPeriod}>per month • cancel anytime</Text>
                </View>
                <View style={styles.stripeProtectedBadge}>
                  <Ionicons name="shield-checkmark" size={13} color="#635BFF" />
                  <Text style={styles.stripeProtectedText}>Stripe Secured</Text>
                </View>
              </View>

              <Pressable
                style={styles.upgradeButton}
                onPress={() => setIsStripeModalVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Upgrade to Bulk Access Plan"
              >
                <Ionicons name="lock-open-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.upgradeButtonText}>Upgrade to Bulk Access</Text>
              </Pressable>
            </View>
          </ScrollView>
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
                  <Text style={styles.parsingText}>Extracting handwritten items via AI...</Text>
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
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Verified Farm Match Breakdown</Text>

                {matchResult.availableItems.length > 0 && (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionTitle}>
                      Available ({matchResult.availableItems.length})
                    </Text>
                    {matchResult.availableItems.map((item) => (
                      <View key={item.cropId} style={styles.availableCard}>
                        <View style={styles.availableCardHeader}>
                          <Text style={styles.availableCardName}>{item.cropName}</Text>
                          <View style={styles.verifiedTag}>
                            <Ionicons name="shield-checkmark" size={10} color="#FFFFFF" />
                            <Text style={styles.verifiedTagText}>SLSI Verified</Text>
                          </View>
                        </View>
                        <Text style={styles.availableCardFarmer}>
                          {item.farmerName}
                        </Text>
                        <View style={styles.availableCardFooter}>
                          <Text style={styles.availableCardMeta}>
                            {item.requestedQtyKg} kg × {formatLKR(item.pricePerKg)}/kg
                          </Text>
                          <Text style={styles.availableCardTotal}>{formatLKR(item.totalPrice)}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {matchResult.unavailableItems.length > 0 && (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionTitle}>
                      Unavailable ({matchResult.unavailableItems.length})
                    </Text>
                    {matchResult.unavailableItems.map((item, idx) => (
                      <View key={`${item.requestedItem}_${idx}`} style={styles.unavailableCard}>
                        <View style={styles.unavailableCardHeader}>
                          <Ionicons name="alert-circle-outline" size={16} color="#B45309" />
                          <Text style={styles.unavailableCardName}>
                            {item.requestedQtyKg}kg {item.requestedItem}
                          </Text>
                        </View>
                        <Text style={styles.unavailableCardReason}>{item.reason}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {matchResult.availableItems.length > 0 && (
                  <View style={[styles.card, styles.summaryCard]}>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryGrandLabel}>Consolidated Total</Text>
                      <Text style={styles.summaryGrandValue}>
                        {formatLKR(matchResult.grandTotal)}
                      </Text>
                    </View>
                    <Pressable
                      style={[styles.checkoutButton, isCheckingOut && styles.checkoutButtonDisabled]}
                      onPress={handleCheckout}
                      disabled={isCheckingOut}
                    >
                      <Text style={styles.checkoutButtonText}>
                        {isCheckingOut ? 'Adding to Cart...' : 'Proceed to Checkout'}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      <StripeCheckoutModal
        visible={isStripeModalVisible}
        onClose={() => setIsStripeModalVisible(false)}
        onSuccess={handleUpgradeSuccess}
        planTitle="Bulk Order Access Plan"
        planPrice="LKR 9,500 / month"
        description="Unlocks the AI Bulk Orders workspace for recurring volume orders."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#FAFAFA' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAFAFA' },
  brandRow: {
    paddingHorizontal: 16,
    paddingBottom: 6,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  workspaceBadge: {
    backgroundColor: '#DCFCE7',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  workspaceBadgeLocked: {
    backgroundColor: '#FEF3C7',
  },
  workspaceBadgeText: { fontSize: 11, fontWeight: '700', color: '#15803D' },
  workspaceBadgeTextLocked: { color: '#B45309' },
  scrollContent: { padding: 16, paddingBottom: 40, gap: 14 },

  // Paywall Styles
  paywallCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    gap: 16,
  },
  paywallHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  paywallIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paywallBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
    letterSpacing: 0.5,
  },
  paywallTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginTop: 2,
  },
  paywallSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  benefitsList: {
    gap: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  benefitTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  benefitDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
    lineHeight: 16,
  },
  pricingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 12,
    padding: 14,
  },
  pricingAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: '#15803D',
  },
  pricingPeriod: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },
  stripeProtectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  stripeProtectedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#635BFF',
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#15803D',
    borderRadius: 12,
    paddingVertical: 14,
    minHeight: 48,
  },
  upgradeButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Workspace Styles
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  cardSubtitle: { fontSize: 13, color: '#6B7280', lineHeight: 18 },
  imagePlaceholder: {
    height: 120,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderStyle: 'dashed',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  imagePlaceholderText: { fontSize: 13, color: '#6B7280' },
  imagePreview: { height: 160, borderRadius: 10, resizeMode: 'cover' },
  imagePreviewPlaceholder: {
    height: 90,
    backgroundColor: '#F3E8FF',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  imagePreviewPlaceholderText: { fontSize: 13, fontWeight: '600', color: '#7C3AED' },
  uploadRow: { flexDirection: 'row', gap: 10 },
  uploadButton: {
    flex: 1,
    backgroundColor: '#15803D',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  parseButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#7C3AED',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  parseButtonDisabled: { opacity: 0.5 },
  parseButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  parsingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  parsingText: { fontSize: 13, color: '#7C3AED' },
  aiEngineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#7C3AED',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  aiEngineBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  parsedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  parsedInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    backgroundColor: '#FAFAFA',
    color: '#111827',
  },
  parsedInputName: { flex: 1 },
  parsedInputQty: { width: 70 },
  rowRemove: { padding: 4 },
  addRowButton: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  addRowButtonText: { fontSize: 13, color: '#15803D', fontWeight: '600' },
  matchButton: {
    backgroundColor: '#15803D',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  matchButtonDisabled: { opacity: 0.5 },
  matchButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  sectionBlock: { gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#374151' },
  availableCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#15803D',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  availableCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  availableCardName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  verifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#15803D',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  verifiedTagText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  availableCardFarmer: { fontSize: 12, color: '#6B7280' },
  availableCardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  availableCardMeta: { fontSize: 12, color: '#111827' },
  availableCardTotal: { fontSize: 14, fontWeight: '700', color: '#15803D' },
  unavailableCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FBBF24',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  unavailableCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  unavailableCardName: { fontSize: 13, fontWeight: '700', color: '#111827' },
  unavailableCardReason: { fontSize: 12, color: '#92400E', lineHeight: 16 },
  summaryCard: { backgroundColor: '#111827', borderColor: '#111827' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryGrandLabel: { fontSize: 14, color: '#D1D5DB' },
  summaryGrandValue: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  checkoutButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16A34A',
    borderRadius: 10,
    marginTop: 4,
  },
  checkoutButtonDisabled: { opacity: 0.5 },
  checkoutButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  extractOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    zIndex: 999,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  extractOverlayText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});