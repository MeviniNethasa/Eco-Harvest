// src/navigation/TabNavigator.tsx

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer, useIsFocused } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { RootTabParamList } from '../types';
import { getCartCount } from '../utils/storage';
import MarketplaceScreen from '../screens/MarketplaceScreen';

const Tab = createBottomTabNavigator<RootTabParamList>();

// --- Minimal placeholder screens for Orders / Cart / Profile ---
// Replace these with your real screen implementations as needed.

function OrdersScreen() {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>Orders</Text>
    </View>
  );
}

function CartScreen() {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>Cart</Text>
    </View>
  );
}

function ProfileScreen() {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>Profile</Text>
    </View>
  );
}

function CartTabIcon({ color, size }: { color: string; size: number }) {
  const [count, setCount] = useState(0);
  const isFocused = useIsFocused();

  const refreshCount = useCallback(async () => {
    const total = await getCartCount();
    setCount(total);
  }, []);

  React.useEffect(() => {
    if (isFocused) refreshCount();
  }, [isFocused, refreshCount]);

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
        <Tab.Screen
          name="Orders"
          component={OrdersScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="receipt-outline" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Cart"
          component={CartScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <CartTabIcon color={color} size={size} />
            ),
          }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person-outline" size={size} color={color} />
            ),
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
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAFA',
  },
  placeholderText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
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