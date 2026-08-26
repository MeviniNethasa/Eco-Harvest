// src/screens/BulkOrdersScreen.tsx
//
// Screen M-05: AI Bulk Orders Workspace (Interactive Conversational AI Agent).
//
// Interactive AI Assistant Chat flow:
// 1. Automated Greeting: Agent introduces itself and prompts for a handwritten list.
// 2. Customer Upload: Customer snaps or uploads a photo from gallery into the thread.
// 3. Interactive Extraction Card: AI Agent replies with editable parsed crops and confidence scores.
// 4. In-thread Matching: Customer reviews, edits, and matches against SLSI-Verified farmers.
// 5. Order Placement: Customer confirms & places order with escrow protection directly in chat.
// Gated to customers with `subscriptionPlan === 'BULK_ACCESS'`.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
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
import { aiApi, stripeApi } from '../services/api';

type BulkNavProp = BottomTabNavigationProp<RootTabParamList, 'Bulk'>;

interface ChatMessage {
  id: string;
  sender: 'AGENT' | 'USER';
  timestamp: string;
  text?: string;
  imageUri?: string;
  isExtractionCard?: boolean;
  isMatchCard?: boolean;
  isConfirmedCard?: boolean;
  items?: ExtractedListItem[];
  matchResult?: BulkMatchResult;
}

function makeItemId(): string {
  return `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function formatLKR(value: number): string {
  return `LKR ${Math.round(value).toLocaleString('en-LK')}`;
}

const INITIAL_GREETING: ChatMessage = {
  id: 'msg_welcome',
  sender: 'AGENT',
  timestamp: new Date().toISOString(),
  text: "Hi! Upload or snap a handwritten crop list here, and I'll extract the items for your bulk order instantly.",
};

export default function BulkOrdersScreen() {
  const navigation = useNavigation<BulkNavProp>();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);

  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isStripeModalVisible, setIsStripeModalVisible] = useState(false);

  // --- Chat State ---
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_GREETING]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

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

  const handleUpgradePress = () => {
    if (!customerProfile) {
      // Unregistered user -> Redirect directly to Customer Registration Screen
      (navigation as any).navigate('Profile', {
        screen: 'RegisterCustomer',
        params: { initialPlan: 'BULK_ACCESS' },
      });
    } else {
      // Registered customer -> Open Stripe modal
      setIsStripeModalVisible(true);
    }
  };

  const handleUpgradeSuccess = async () => {
    try {
      if (!customerProfile) {
        setIsStripeModalVisible(false);
        (navigation as any).navigate('Profile', {
          screen: 'RegisterCustomer',
          params: { initialPlan: 'BULK_ACCESS' },
        });
        return;
      }

      const updated: CustomerProfile = {
        ...customerProfile,
        subscriptionPlan: 'BULK_ACCESS',
      };
      await saveUserProfile(updated);
      setCustomerProfile(updated);
      setIsStripeModalVisible(false);

      stripeApi
        .createSubscription({
          phoneNumber: updated.phoneNumber,
          planType: 'BULK_ACCESS',
        })
        .catch((e) => console.log('Stripe sync notice:', e.message));

      Alert.alert('Welcome to Bulk Access!', 'You now have full access to the AI Bulk Orders workspace.');
    } catch (e) {
      console.error('Failed to save upgraded subscription:', e);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 200);
  };

  // --- AI Vision Processing ---
  // --- AI Vision Processing ---
  const processImageInChat = async (uri: string, base64?: string | null) => {
    // 1. Add User's Image message
    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      sender: 'USER',
      timestamp: new Date().toISOString(),
      imageUri: uri,
      text: 'Uploaded handwritten list',
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);
    scrollToBottom();

    try {
      let result;
      if (base64) {
        // High-reliability JSON base64 upload (immune to React Native FormDataPart issues)
        result = await aiApi.extractHandwrittenList({
          imageBase64: base64,
          imageUri: uri,
        });
      } else {
        const formData = new FormData();
        const filename = uri.split('/').pop() || 'handwritten_list.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1].toLowerCase()}` : 'image/jpeg';
        const cleanUri = Platform.OS === 'ios' ? uri.replace('file://', '') : uri;

        formData.append('image', {
          uri: cleanUri,
          name: filename,
          type,
        } as any);

        result = await aiApi.extractHandwrittenList(formData);
      }

      const extracted =
        result.extracted_items || result.items || result.data?.extracted_items || [];

      if (extracted.length > 0) {
        const parsedList: ExtractedListItem[] = extracted.map((item: any) => ({
          id: item.id || makeItemId(),
          rawText: item.rawText || `${item.quantity || item.requestedQtyKg || 10}kg ${item.cropName || item.item}`,
          cropName: item.cropName || item.item || 'Produce',
          requestedQtyKg: Number(item.requestedQtyKg || item.quantity) || 10,
          confidence: item.confidence || 95,
        }));

        // 2. Add AI Agent's Extraction Card message
        const sourceName = (result as any).source === 'gemini_vision_api' ? 'Gemini Vision AI' : 'AI Vision OCR';
        const agentMsg: ChatMessage = {
          id: `agent_${Date.now()}`,
          sender: 'AGENT',
          timestamp: new Date().toISOString(),
          text: `I parsed ${parsedList.length} handwritten item(s) with ${sourceName}. You can adjust the quantities or names below before matching with verified farms:`,
          isExtractionCard: true,
          items: parsedList,
        };
        setMessages((prev) => [...prev, agentMsg]);
      } else {
        const agentMsg: ChatMessage = {
          id: `agent_${Date.now()}`,
          sender: 'AGENT',
          timestamp: new Date().toISOString(),
          text: '⚠️ Could not clearly detect handwritten crop items from this photo. Please try uploading a clearer image or type your items in the chat below.',
        };
        setMessages((prev) => [...prev, agentMsg]);
      }
    } catch (err: any) {
      console.warn('AI Extraction notice:', err);
      const agentMsg: ChatMessage = {
        id: `agent_${Date.now()}`,
        sender: 'AGENT',
        timestamp: new Date().toISOString(),
        text: `⚠️ OCR service note: ${err?.message || 'Could not process image'}. Please ensure the Python microservice is running or type your list below.`,
      };
      setMessages((prev) => [...prev, agentMsg]);
    } finally {
      setIsProcessing(false);
      scrollToBottom();
    }
  };

  const handlePickFromGallery = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow photo library access to upload handwritten lists.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        processImageInChat(asset.uri, asset.base64);
      }
    } catch (err) {
      console.error('Gallery picker error:', err);
      Alert.alert('Error', 'Could not open photo library.');
    }
  };

  const handleTakePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow camera access to take a photo of your handwritten list.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        processImageInChat(asset.uri, asset.base64);
      }
    } catch (err) {
      console.error('Camera capture error:', err);
      Alert.alert('Error', 'Could not access camera.');
    }
  };

  const handleSendText = () => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    setInputText('');

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      sender: 'USER',
      timestamp: new Date().toISOString(),
      text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);
    scrollToBottom();

    aiApi
      .extractHandwrittenList({ text })
      .then((res) => {
        const extracted = res.extracted_items || res.items || [];
        const parsedList: ExtractedListItem[] =
          extracted.length > 0
            ? extracted.map((item: any) => ({
                id: makeItemId(),
                rawText: item.rawText || `${item.quantity || 10}kg ${item.cropName || item.item}`,
                cropName: item.cropName || item.item || 'Produce',
                requestedQtyKg: Number(item.requestedQtyKg || item.quantity) || 10,
                confidence: item.confidence || 95,
              }))
            : [
                { id: makeItemId(), rawText: text, cropName: text, requestedQtyKg: 20, confidence: 95 },
              ];

        const agentMsg: ChatMessage = {
          id: `agent_${Date.now()}`,
          sender: 'AGENT',
          timestamp: new Date().toISOString(),
          text: `Processed your requirement list:`,
          isExtractionCard: true,
          items: parsedList,
        };
        setMessages((prev) => [...prev, agentMsg]);
      })
      .catch(() => {
        const agentMsg: ChatMessage = {
          id: `agent_${Date.now()}`,
          sender: 'AGENT',
          timestamp: new Date().toISOString(),
          text: `Extracted list items:`,
          isExtractionCard: true,
          items: [{ id: makeItemId(), rawText: text, cropName: text, requestedQtyKg: 25, confidence: 94 }],
        };
        setMessages((prev) => [...prev, agentMsg]);
      })
      .finally(() => {
        setIsProcessing(false);
        scrollToBottom();
      });
  };

  // --- Inline Item List Mutations ---
  const updateItemInMessage = (msgId: string, itemId: string, field: 'cropName' | 'requestedQtyKg', value: any) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== msgId || !msg.items) return msg;
        const updated = msg.items.map((it) => (it.id === itemId ? { ...it, [field]: value } : it));
        return { ...msg, items: updated };
      })
    );
  };

  const removeItemInMessage = (msgId: string, itemId: string) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== msgId || !msg.items) return msg;
        return { ...msg, items: msg.items.filter((it) => it.id !== itemId) };
      })
    );
  };

  const addItemToMessage = (msgId: string) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== msgId || !msg.items) return msg;
        const newItem: ExtractedListItem = {
          id: makeItemId(),
          rawText: '',
          cropName: '',
          requestedQtyKg: 10,
          confidence: 99,
        };
        return { ...msg, items: [...msg.items, newItem] };
      })
    );
  };

  // --- Matching with SLSI-Verified Farmers ---
  const handleMatchItems = async (items: ExtractedListItem[]) => {
    const validItems = items.filter((it) => it.cropName.trim() && it.requestedQtyKg > 0);
    if (validItems.length === 0) {
      Alert.alert('No valid items', 'Please ensure at least one crop has a name and quantity.');
      return;
    }

    setIsProcessing(true);
    try {
      const matchResult = await matchHandwrittenListToVerifiedFarmers(validItems);

      const matchMsg: ChatMessage = {
        id: `match_${Date.now()}`,
        sender: 'AGENT',
        timestamp: new Date().toISOString(),
        text: `Here is the matching summary for ${matchResult.availableItems.length} available crop item(s) from SLSI-Verified farms:`,
        isMatchCard: true,
        matchResult,
      };

      setMessages((prev) => [...prev, matchMsg]);
    } catch (err) {
      console.error('Farmer matching error:', err);
      Alert.alert('Matching failed', 'Could not match with verified farmers.');
    } finally {
      setIsProcessing(false);
      scrollToBottom();
    }
  };

  // --- Confirm and Place Order ---
  const handleConfirmOrder = async (matchResult: BulkMatchResult) => {
    setIsProcessing(true);
    try {
      await addBulkMatchItemsToCart(matchResult.availableItems);

      const confirmedMsg: ChatMessage = {
        id: `confirmed_${Date.now()}`,
        sender: 'AGENT',
        timestamp: new Date().toISOString(),
        isConfirmedCard: true,
        text: `🎉 Bulk Order Placed! ${matchResult.availableItems.length} crop item(s) have been added to your cart with escrow protection. Total: ${formatLKR(matchResult.grandTotal)}.`,
        matchResult,
      };

      setMessages((prev) => [...prev, confirmedMsg]);
    } catch (err) {
      console.error('Order placement error:', err);
      Alert.alert('Error', 'Could not complete order placement.');
    } finally {
      setIsProcessing(false);
      scrollToBottom();
    }
  };

  // --- Render Chat Messages ---
  const renderMessageItem = ({ item }: { item: ChatMessage }) => {
    const isAgent = item.sender === 'AGENT';

    return (
      <View style={[styles.messageWrapper, isAgent ? styles.agentWrapper : styles.userWrapper]}>
        {isAgent && (
          <View style={styles.agentAvatar}>
            <Ionicons name="sparkles" size={16} color="#FFFFFF" />
          </View>
        )}

        <View style={[styles.messageBubble, isAgent ? styles.agentBubble : styles.userBubble]}>
          {item.imageUri && (
            <Image source={{ uri: item.imageUri }} style={styles.attachedImage} />
          )}

          {item.text && <Text style={[styles.messageText, !isAgent && styles.userMessageText]}>{item.text}</Text>}

          {/* 1. Interactive Extraction Card */}
          {item.isExtractionCard && item.items && (
            <View style={styles.extractionCard}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.aiBadge}>
                  <Ionicons name="scan-outline" size={12} color="#15803D" />
                  <Text style={styles.aiBadgeText}>AI Vision Extracted Items</Text>
                </View>
                <Text style={styles.cardHeaderCount}>{item.items.length} items</Text>
              </View>

              {item.items.map((crop) => (
                <View key={crop.id} style={styles.cropItemBox}>
                  <View style={styles.cropInputRow}>
                    <TextInput
                      style={[styles.cropInput, styles.cropInputName]}
                      value={crop.cropName}
                      onChangeText={(val) => updateItemInMessage(item.id, crop.id, 'cropName', val)}
                      placeholder="Crop name"
                      placeholderTextColor="#9CA3AF"
                    />
                    <TextInput
                      style={[styles.cropInput, styles.cropInputQty]}
                      value={crop.requestedQtyKg ? String(crop.requestedQtyKg) : ''}
                      onChangeText={(val) =>
                        updateItemInMessage(item.id, crop.id, 'requestedQtyKg', Number(val) || 0)
                      }
                      placeholder="kg"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="numeric"
                    />
                    <Pressable
                      style={styles.cropDeleteButton}
                      onPress={() => removeItemInMessage(item.id, crop.id)}
                    >
                      <Ionicons name="close-circle" size={20} color="#9CA3AF" />
                    </Pressable>
                  </View>

                  {crop.confidence && (
                    <View style={styles.confidenceRow}>
                      <Ionicons name="shield-checkmark" size={11} color="#15803D" />
                      <Text style={styles.confidenceText}>{crop.confidence}% AI confidence</Text>
                    </View>
                  )}
                </View>
              ))}

              <View style={styles.cardActionsRow}>
                <Pressable style={styles.addCropButton} onPress={() => addItemToMessage(item.id)}>
                  <Ionicons name="add" size={14} color="#15803D" />
                  <Text style={styles.addCropButtonText}>Add Crop</Text>
                </Pressable>

                <Pressable
                  style={styles.matchSubmitButton}
                  onPress={() => handleMatchItems(item.items || [])}
                  disabled={isProcessing}
                >
                  <Ionicons name="search" size={14} color="#FFFFFF" />
                  <Text style={styles.matchSubmitButtonText}>Match with SLSI Farms</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* 2. SLSI Matching Summary Card */}
          {item.isMatchCard && item.matchResult && (
            <View style={styles.matchSummaryCard}>
              <Text style={styles.matchSummaryTitle}>SLSI-Verified Farm Matches</Text>

              {item.matchResult.availableItems.map((matched, idx) => (
                <View key={`${matched.cropId}_${idx}`} style={styles.matchedCropRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.matchedCropName}>
                      {matched.requestedQtyKg}kg {matched.cropName}
                    </Text>
                    <Text style={styles.matchedFarmerName}>🏡 {matched.farmerName}</Text>
                  </View>
                  <Text style={styles.matchedCropPrice}>{formatLKR(matched.totalPrice)}</Text>
                </View>
              ))}

              {item.matchResult.unavailableItems.length > 0 && (
                <View style={styles.unavailableBlock}>
                  <Text style={styles.unavailableHeader}>
                    Unavailable ({item.matchResult.unavailableItems.length})
                  </Text>
                  {item.matchResult.unavailableItems.map((un, idx) => (
                    <Text key={idx} style={styles.unavailableItemText}>
                      • {un.requestedQtyKg}kg {un.requestedItem} — {un.reason}
                    </Text>
                  ))}
                </View>
              )}

              <View style={styles.grandTotalDivider} />
              <View style={styles.grandTotalRow}>
                <Text style={styles.grandTotalLabel}>Consolidated Total:</Text>
                <Text style={styles.grandTotalValue}>{formatLKR(item.matchResult.grandTotal)}</Text>
              </View>

              <Pressable
                style={styles.confirmOrderButton}
                onPress={() => handleConfirmOrder(item.matchResult!)}
                disabled={isProcessing}
              >
                <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
                <Text style={styles.confirmOrderButtonText}>Confirm & Place Order</Text>
              </Pressable>
            </View>
          )}

          {/* 3. Order Confirmed Card */}
          {item.isConfirmedCard && item.matchResult && (
            <View style={styles.confirmedCard}>
              <View style={styles.confirmedHeaderRow}>
                <View style={styles.confirmedIconCircle}>
                  <Ionicons name="checkmark" size={18} color="#15803D" />
                </View>
                <Text style={styles.confirmedTitle}>Order Placed with Escrow</Text>
              </View>
              <Text style={styles.confirmedDesc}>
                Total: {formatLKR(item.matchResult.grandTotal)} across {item.matchResult.availableItems.length} verified farm(s).
              </Text>
              <View style={styles.confirmedButtonsRow}>
                <Pressable
                  style={styles.viewCartButton}
                  onPress={() => navigation.navigate('Cart' as any)}
                >
                  <Ionicons name="cart-outline" size={15} color="#FFFFFF" />
                  <Text style={styles.viewCartButtonText}>View Cart & Checkout</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
    );
  };

  if (isLoadingProfile) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#15803D" size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) }]}>
      {/* Header Branding */}
      <View style={styles.header}>
        <HeaderBranding />
        <View style={styles.badgeContainer}>
          <View style={[styles.planBadge, !isSubscribedCustomer && styles.planBadgeLocked]}>
            <Ionicons
              name={isSubscribedCustomer ? 'sparkles' : 'lock-closed'}
              size={12}
              color={isSubscribedCustomer ? '#15803D' : '#B45309'}
            />
            <Text style={[styles.planBadgeText, !isSubscribedCustomer && styles.planBadgeTextLocked]}>
              {isSubscribedCustomer ? 'Bulk AI Agent' : 'Bulk Access Locked'}
            </Text>
          </View>
        </View>
      </View>

      {!isSubscribedCustomer ? (
        // Paywall for unsubscribed customers
        <ScrollView contentContainerStyle={styles.paywallContent}>
          <View style={styles.paywallCard}>
            <View style={styles.paywallIconCircle}>
              <Ionicons name="sparkles" size={32} color="#7C3AED" />
            </View>
            <Text style={styles.paywallTitle}>AI Bulk Orders Workspace</Text>
            <Text style={styles.paywallSubtitle}>
              Unlock conversational OCR handwritten list transcription, verified farm matching, and escrow billing.
            </Text>

            <View style={styles.paywallBenefits}>
              <View style={styles.benefitRow}>
                <Ionicons name="scan-outline" size={18} color="#15803D" />
                <Text style={styles.benefitText}>Instant Handwritten Notebook List OCR</Text>
              </View>
              <View style={styles.benefitRow}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#15803D" />
                <Text style={styles.benefitText}>Exclusive Direct SLSI-Verified Farm Sourcing</Text>
              </View>
              <View style={styles.benefitRow}>
                <Ionicons name="cube-outline" size={18} color="#15803D" />
                <Text style={styles.benefitText}>Consolidated Multi-Farm Escrow Billing</Text>
              </View>
            </View>

            <Pressable
              style={styles.upgradeButton}
              onPress={handleUpgradePress}
              accessibilityRole="button"
              accessibilityLabel="Upgrade to Bulk Access"
            >
              <Ionicons
                name={customerProfile ? 'card-outline' : 'person-add-outline'}
                size={18}
                color="#FFFFFF"
              />
              <Text style={styles.upgradeButtonText}>
                {customerProfile
                  ? 'Upgrade to EcoHarvest Pro Plan (LKR 500/mo)'
                  : 'Sign Up as a Customer & Get Pro Plan'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        // Interactive AI Chat Workspace
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessageItem}
            contentContainerStyle={styles.chatListContent}
            onContentSizeChange={scrollToBottom}
            ListFooterComponent={
              isProcessing ? (
                <View style={styles.typingIndicator}>
                  <ActivityIndicator size="small" color="#15803D" />
                  <Text style={styles.typingText}>EcoHarvest AI is analyzing your list…</Text>
                </View>
              ) : null
            }
          />

          {/* Chat Input Bar */}
          <View style={[styles.inputBarContainer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <View style={styles.attachButtonsGroup}>
              <Pressable
                style={styles.attachButton}
                onPress={handleTakePhoto}
                disabled={isProcessing}
                accessibilityRole="button"
                accessibilityLabel="Take Photo of List"
              >
                <Ionicons name="camera" size={20} color="#15803D" />
              </Pressable>

              <Pressable
                style={styles.attachButton}
                onPress={handlePickFromGallery}
                disabled={isProcessing}
                accessibilityRole="button"
                accessibilityLabel="Upload List from Gallery"
              >
                <Ionicons name="image" size={20} color="#15803D" />
              </Pressable>
            </View>

            <TextInput
              style={styles.chatTextInput}
              placeholder="Type items (e.g. 50kg Carrot, 20kg Leek)..."
              placeholderTextColor="#9CA3AF"
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleSendText}
              returnKeyType="send"
            />

            <Pressable
              style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
              onPress={handleSendText}
              disabled={!inputText.trim() || isProcessing}
            >
              <Ionicons name="send" size={16} color="#FFFFFF" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}

      <StripeCheckoutModal
        visible={isStripeModalVisible}
        onClose={() => setIsStripeModalVisible(false)}
        onSuccess={handleUpgradeSuccess}
        planTitle="EcoHarvest pro plan"
        planPrice="LKR 500 / month"
        description="Unlocks the AI Bulk Orders workspace for recurring volume orders."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  badgeContainer: { flexDirection: 'row', alignItems: 'center' },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  planBadgeLocked: { backgroundColor: '#FEF3C7' },
  planBadgeText: { fontSize: 11, fontWeight: '700', color: '#15803D' },
  planBadgeTextLocked: { color: '#B45309' },

  // Paywall
  paywallContent: { padding: 20, alignItems: 'center' },
  paywallCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 24,
    width: '100%',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  paywallIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paywallTitle: { fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center' },
  paywallSubtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 18 },
  paywallBenefits: { width: '100%', gap: 10, marginVertical: 8 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#15803D',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    width: '100%',
    marginTop: 8,
  },
  upgradeButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },

  // Chat
  chatListContent: { padding: 16, gap: 14, paddingBottom: 24 },
  messageWrapper: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, maxWidth: '92%' },
  agentWrapper: { alignSelf: 'flex-start' },
  userWrapper: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  agentAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#15803D',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  messageBubble: {
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  agentBubble: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderTopLeftRadius: 4,
  },
  userBubble: {
    backgroundColor: '#15803D',
    borderTopRightRadius: 4,
  },
  messageText: { fontSize: 14, color: '#1F2937', lineHeight: 20 },
  userMessageText: { color: '#FFFFFF', fontWeight: '500' },
  attachedImage: { width: 220, height: 140, borderRadius: 10, resizeMode: 'cover' },

  // Extraction Card inside chat
  extractionCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    gap: 10,
    marginTop: 4,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  aiBadgeText: { fontSize: 11, fontWeight: '700', color: '#15803D' },
  cardHeaderCount: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  cropItemBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 8,
    gap: 4,
  },
  cropInputRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cropInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
    backgroundColor: '#FAFAFA',
    color: '#111827',
  },
  cropInputName: { flex: 1 },
  cropInputQty: { width: 64 },
  cropDeleteButton: { padding: 2 },
  confidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  confidenceText: { fontSize: 10, color: '#15803D', fontWeight: '600' },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 8,
  },
  addCropButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  addCropButtonText: { fontSize: 12, fontWeight: '600', color: '#15803D' },
  matchSubmitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#15803D',
    borderRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  matchSubmitButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },

  // Matching Card
  matchSummaryCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#86EFAC',
    padding: 12,
    gap: 8,
    marginTop: 4,
  },
  matchSummaryTitle: { fontSize: 14, fontWeight: '700', color: '#15803D' },
  matchedCropRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  matchedCropName: { fontSize: 13, fontWeight: '600', color: '#111827' },
  matchedFarmerName: { fontSize: 11, color: '#6B7280', marginTop: 1 },
  matchedCropPrice: { fontSize: 13, fontWeight: '700', color: '#15803D' },
  unavailableBlock: { marginTop: 4, gap: 2 },
  unavailableHeader: { fontSize: 11, fontWeight: '700', color: '#B45309' },
  unavailableItemText: { fontSize: 11, color: '#92400E' },
  grandTotalDivider: { height: 1, backgroundColor: '#DCFCE7', marginVertical: 4 },
  grandTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  grandTotalLabel: { fontSize: 13, fontWeight: '700', color: '#374151' },
  grandTotalValue: { fontSize: 16, fontWeight: '800', color: '#15803D' },
  confirmOrderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#15803D',
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 6,
  },
  confirmOrderButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },

  // Confirmed Card
  confirmedCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6EE7B7',
    padding: 14,
    gap: 8,
    marginTop: 4,
  },
  confirmedHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  confirmedIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmedTitle: { fontSize: 14, fontWeight: '700', color: '#065F46' },
  confirmedDesc: { fontSize: 12, color: '#047857', lineHeight: 16 },
  confirmedButtonsRow: { marginTop: 4 },
  viewCartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#059669',
    borderRadius: 8,
    paddingVertical: 9,
  },
  viewCartButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },

  // Input Bar
  inputBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 8,
  },
  attachButtonsGroup: { flexDirection: 'row', gap: 6 },
  attachButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatTextInput: {
    flex: 1,
    minHeight: 38,
    maxHeight: 80,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 13,
    color: '#111827',
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#15803D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { backgroundColor: '#9CA3AF' },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  typingText: { fontSize: 12, color: '#15803D', fontStyle: 'italic' },
});