// src/navigation/TabNavigator.tsx

import React, { useState, useCallback, useEffect } from 'react';
import { ActivityIndicator, View, Text, Pressable, StyleSheet } from 'react-native';
import { NavigationContainer, useIsFocused, useNavigation, useFocusEffect } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import {
  AppMode,
  CartStackParamList,
  CombinedTabParamList,
  FarmerProfile,
  MarketplaceStackParamList,
  OrdersStackParamList,
} from '../types';
import {
  getActiveMode,
  getCartCount,
  getFarmerProfile,
  hasCompletedFarmerOnboarding,
  setActiveMode,
  subscribeToActiveMode,
  subscribeToCart,
} from '../utils/storage';
import MarketplaceScreen from '../screens/MarketplaceScreen';
import FarmerDetailScreen from '../screens/FarmerDetailScreen';
import FarmerOnboardingScreen from '../screens/FarmerOnboardingScreen';
import CartScreen from '../screens/CartScreen';
import OrdersScreen from '../screens/OrdersScreen';
import DeliveryTrackingScreen from '../screens/DeliveryTrackingScreen';
import BulkOrdersScreen from '../screens/BulkOrdersScreen';
import ChatScreen from '../screens/ChatScreen';
import MyProductsScreen from '../screens/MyProductsScreen';
import AddProductScreen from '../screens/AddProductScreen';
import FarmerOrdersScreen from '../screens/FarmerOrdersScreen';
import ProfileScreen from '../screens/ProfileScreen';

// Typed against the union of both bars' route names (see
// `CombinedTabParamList` in src/types/index.ts) so a single navigator
// instance can register either the Customer Mode or Farmer Mode `Tab.Screen`
// set depending on `activeMode`, without unmounting/remounting
// `NavigationContainer` on every switch (see `TabNavigator` below).
const Tab = createBottomTabNavigator<CombinedTabParamList>();

// Screen M-02 isn't a top-level tab per the design spec ("Accessible via the
// App Navigation stack — e.g. Profile / Switch to Farmer Mode or dedicated
// screen route"), so it's nested inside the Profile tab as its own stack
// rather than added to RootTabParamList (src/types/index.ts).
export type ProfileStackParamList = {
  ProfileHome: undefined;
  FarmerOnboarding: undefined;
};
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

// --- Marketplace (Farm directory -> Farmer storefront) ---
//
// PART 2 REFACTOR: MarketplaceScreen moved from a flat product grid to a
// directory of farms. It now needs its own stack so tapping a Farm Card can
// push into FarmerDetailScreen (that farm's storefront + product grid),
// same pattern as CartStack/OrdersStack below.

const MarketplaceStack = createNativeStackNavigator<MarketplaceStackParamList>();

function MarketplaceStackNavigator() {
  return (
    <MarketplaceStack.Navigator screenOptions={{ headerShown: false }}>
      <MarketplaceStack.Screen name="MarketplaceHome" component={MarketplaceScreen} />
      <MarketplaceStack.Screen
        name="FarmerDetailScreen"
        component={FarmerDetailScreen}
        options={({ route }) => ({
          headerShown: true,
          title: route.params?.farmName || 'Farm',
        })}
      />
    </MarketplaceStack.Navigator>
  );
}

// --- Cart (Screen M-03 -> Screen M-04) ---
//
// The Cart tab gets its own stack so a successful Stripe test payment on
// Screen M-03 (CartScreen) can push into Screen M-04 (Uber Sandbox Live
// Delivery Tracking) with the new order's id, per design.md Section 4.4.

const CartStack = createNativeStackNavigator<CartStackParamList>();

function CartStackNavigator() {
  return (
    <CartStack.Navigator screenOptions={{ headerShown: false }}>
      <CartStack.Screen name="CartHome" component={CartScreen} />
      <CartStack.Screen
        name="OrderTracking"
        component={DeliveryTrackingScreen}
        options={{ headerShown: true, title: 'Delivery Tracking' }}
      />
    </CartStack.Navigator>
  );
}

// --- Orders (Orders tab -> Screen M-04) ---
//
// Same pattern as the Cart stack above: the Orders tab gets its own stack
// so tapping "Track Delivery" on an active order (OrdersScreen) can push
// into the same Screen M-04 implementation, keyed by orderId, without any
// cross-tab navigation workarounds.

const OrdersStack = createNativeStackNavigator<OrdersStackParamList>();

// Screen M-07 (Hardware-Restricted Product Review Modal) is intentionally
// NOT a stack screen/route here. It's rendered by OrdersScreen itself as a
// React Native `<Modal>` (see ReviewModal.tsx), which mounts in its own
// native overlay above the entire app — including this bottom tab bar —
// so it needs no route, no extra param list entry, and no changes to the
// tab/stack layout below to avoid colliding with or being clipped by the
// tab bar.
function OrdersStackNavigator() {
  return (
    <OrdersStack.Navigator screenOptions={{ headerShown: false }}>
      <OrdersStack.Screen name="OrdersHome" component={OrdersScreen} />
      <OrdersStack.Screen
        name="OrderTracking"
        component={DeliveryTrackingScreen}
        options={{ headerShown: true, title: 'Delivery Tracking' }}
      />
      {/* Screen M-06: e.g. a "Message Farmer" action on an active order.
          headerShown stays false — ChatScreen renders its own Header Bar +
          Transaction Summary Header per design.md Section 3.1. */}
      <OrdersStack.Screen name="Chat" component={ChatScreen} />
    </OrdersStack.Navigator>
  );
}

// --- Profile (entry point into the Farmer Portal / Screen M-02) ---

export type ProfileNavProp = NativeStackNavigationProp<ProfileStackParamList, 'ProfileHome'>;

function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen
        name="ProfileHome"
        component={ProfileScreen}
        options={{ title: 'Profile', headerShown: false }}
      />
      <ProfileStack.Screen
        name="FarmerOnboarding"
        component={FarmerOnboardingScreen}
        options={{ title: 'Farmer Portal', headerShown: true }}
      />
    </ProfileStack.Navigator>
  );
}

function CartTabIcon({ color, size }: { color: string; size: number }) {
  const [count, setCount] = useState(0);
  const isFocused = useIsFocused();

  const refreshCount = useCallback(async () => {
    const total = await getCartCount();
    setCount(total);
  }, []);

  // Refresh whenever the Cart tab regains focus...
  React.useEffect(() => {
    if (isFocused) refreshCount();
  }, [isFocused, refreshCount]);

  // ...and also live, via pub/sub, so edits/checkout happening on a screen
  // nested inside the Cart stack (e.g. Screen M-03 clearing the cart after
  // a Stripe test payment while Screen M-04 is on top) still update the
  // badge immediately instead of waiting for the tab to be refocused.
  React.useEffect(() => {
    refreshCount();
    const unsubscribe = subscribeToCart((cart) => {
      const total = cart.reduce((sum, item) => sum + item.quantity, 0);
      setCount(total);
    });
    return unsubscribe;
  }, [refreshCount]);

  return (
    <View>
      <Ionicons name="cart-outline" size={size} color={color} />
      {count > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      )}
    </View>
  );
}

export default function TabNavigator() {
  // `null` = "not loaded yet" (distinct from either real mode) so we never
  // flash the Customer bar for a frame before a persisted Farmer Mode
  // preference has had a chance to load from AsyncStorage.
  const [activeMode, setActiveModeState] = useState<AppMode | null>(null);

  useEffect(() => {
    let cancelled = false;
    getActiveMode().then((mode) => {
      if (!cancelled) setActiveModeState(mode);
    });
    // Live subscription so a mode switch triggered from ProfileScreen (see
    // above) swaps the bottom bar immediately, without remounting
    // NavigationContainer or waiting for a focus event.
    const unsubscribe = subscribeToActiveMode(setActiveModeState);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (activeMode === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#15803D" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#15803D',
          tabBarInactiveTintColor: '#6B7280',
          tabBarStyle: styles.tabBar,
          tabBarLabelStyle: styles.tabLabel,
        }}
      >
        {activeMode === 'farmer' ? (
          <>
            {/* --- Farmer Mode bar (FarmerTabParamList) --- */}
            <Tab.Screen
              name="MyProducts"
              component={MyProductsScreen}
              options={{
                title: 'My Products',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="leaf-outline" size={size} color={color} />
                ),
              }}
            />
            <Tab.Screen
              name="AddProduct"
              component={AddProductScreen}
              options={{
                title: 'Add Product',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="add-circle-outline" size={size} color={color} />
                ),
              }}
            />
            {/* Incoming customer orders for this farm — distinct component
                from Customer Mode's OrdersStackNavigator below, but reuses
                the "Orders" tab name/icon convention. */}
            <Tab.Screen
              name="FarmerOrders"
              component={FarmerOrdersScreen}
              options={{
                title: 'Orders',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="receipt-outline" size={size} color={color} />
                ),
              }}
            />
            {/* Screen M-06, surfaced as its own always-visible tab in
                Farmer Mode (see `FarmerTabParamList.Messages` in
                src/types/index.ts) rather than the hidden root route
                Customer Mode uses below. `userRole: 'FARMER'` renders
                ChatScreen from the farm's side of the conversation. */}
            <Tab.Screen
              name="Messages"
              component={ChatScreen}
              initialParams={{ userRole: 'FARMER' }}
              options={{
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="chatbubble-outline" size={size} color={color} />
                ),
              }}
            />
            {/* Same ProfileStackNavigator as Customer Mode — ProfileScreen
                itself reads the active mode and renders the Farmer variant
                (farm details + "Switch to Customer Mode"). */}
            <Tab.Screen
              name="Profile"
              component={ProfileStackNavigator}
              options={{
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="person-outline" size={size} color={color} />
                ),
              }}
            />
          </>
        ) : (
          <>
            {/* --- Customer Mode bar (RootTabParamList) --- */}
            <Tab.Screen
              name="Marketplace"
              component={MarketplaceStackNavigator}
              options={{
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="storefront-outline" size={size} color={color} />
                ),
              }}
            />
            {/* Nested stack so the Orders tab can push into Screen M-04 (Track
                Delivery) while RootTabParamList's own "Orders: undefined" entry
                (src/types/index.ts) stays untouched. */}
            <Tab.Screen
              name="Orders"
              component={OrdersStackNavigator}
              options={{
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="receipt-outline" size={size} color={color} />
                ),
              }}
            />
            {/* Screen M-05: AI Bulk Orders Engine (Subscribed Customer Workspace). */}
            <Tab.Screen
              name="Bulk"
              component={BulkOrdersScreen}
              options={{
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="cube-outline" size={size} color={color} />
                ),
              }}
            />
            <Tab.Screen
              name="Cart"
              component={CartStackNavigator}
              options={{
                tabBarIcon: ({ color, size }) => (
                  <CartTabIcon color={color} size={size} />
                ),
              }}
            />
            {/* Nested stack so Profile can push into the Farmer Portal
                (Screen M-02) while RootTabParamList's own "Profile: undefined"
                entry (src/types/index.ts) stays untouched. */}
            <Tab.Screen
              name="Profile"
              component={ProfileStackNavigator}
              options={{
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="person-outline" size={size} color={color} />
                ),
              }}
            />
            {/* Screen M-06: registered on the root Tab.Navigator (per
                RootTabParamList in src/types/index.ts) so any tab — e.g. a
                "Message Farmer" action on MarketplaceScreen or OrdersScreen —
                can reach Chat directly via navigation.navigate('Chat', { ... }),
                not just the Orders stack above. `tabBarButton: () => null`
                alone still reserves the item's flex slot in the tab bar,
                leaving a blank gap after Profile; `tabBarItemStyle: { display:
                'none' }` is what actually removes it from layout, so both are
                needed together. Deliberately NOT touching `tabBarStyle` here —
                that would hide the *entire* bar (all items) whenever Chat is
                focused, which isn't what we want. */}
            <Tab.Screen
              name="Chat"
              component={ChatScreen}
              options={{
                tabBarButton: () => null,
                tabBarItemStyle: { display: 'none' },
              }}
            />
          </>
        )}
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAFA',
  },
  tabBar: {
    height: 64,
    paddingBottom: 8,
    paddingTop: 8,
    backgroundColor: '#FAFAFA',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  tabLabel: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.5,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#15803D',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});