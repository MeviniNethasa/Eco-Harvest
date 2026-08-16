// src/navigation/TabNavigator.tsx

import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { NavigationContainer, useIsFocused, useNavigation } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { CartStackParamList, OrdersStackParamList, RootTabParamList } from '../types';
import { getCartCount, subscribeToCart } from '../utils/storage';
import MarketplaceScreen from '../screens/MarketplaceScreen';
import FarmerOnboardingScreen from '../screens/FarmerOnboardingScreen';
import CartScreen from '../screens/CartScreen';
import OrdersScreen from '../screens/OrdersScreen';
import DeliveryTrackingScreen from '../screens/DeliveryTrackingScreen';
import BulkOrdersScreen from '../screens/BulkOrdersScreen';
import ChatScreen from '../screens/ChatScreen';

const Tab = createBottomTabNavigator<RootTabParamList>();

// Screen M-02 isn't a top-level tab per the design spec ("Accessible via the
// App Navigation stack — e.g. Profile / Switch to Farmer Mode or dedicated
// screen route"), so it's nested inside the Profile tab as its own stack
// rather than added to RootTabParamList (src/types/index.ts).
export type ProfileStackParamList = {
  ProfileHome: undefined;
  FarmerOnboarding: undefined;
};
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

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

type ProfileNavProp = NativeStackNavigationProp<ProfileStackParamList, 'ProfileHome'>;

function ProfileScreen() {
  const navigation = useNavigation<ProfileNavProp>();

  return (
    <View style={styles.profileContainer}>
      <Text style={styles.placeholderText}>Profile</Text>

      <Pressable
        style={styles.farmerModeCard}
        onPress={() => navigation.navigate('FarmerOnboarding')}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.farmerModeTitle}>Switch to Farmer Mode</Text>
          <Text style={styles.farmerModeSubtitle}>
            Onboard your farm and publish crops to the marketplace
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#6B7280" />
      </Pressable>
    </View>
  );
}

function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: true }}>
      <ProfileStack.Screen
        name="ProfileHome"
        component={ProfileScreen}
        options={{ title: 'Profile', headerShown: false }}
      />
      <ProfileStack.Screen
        name="FarmerOnboarding"
        component={FarmerOnboardingScreen}
        options={{ title: 'Farmer Portal' }}
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
        <Tab.Screen
          name="Marketplace"
          component={MarketplaceScreen}
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
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
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
  placeholderText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  profileContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAFA',
    gap: 20,
    paddingHorizontal: 16,
  },
  farmerModeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: '#F4F4F5',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    minHeight: 44,
  },
  farmerModeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#15803D',
    marginBottom: 2,
  },
  farmerModeSubtitle: {
    fontSize: 12,
    color: '#6B7280',
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