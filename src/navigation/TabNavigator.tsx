// src/navigation/TabNavigator.tsx

import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { NavigationContainer, useIsFocused, useNavigation } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootTabParamList } from '../types';
import { getCartCount } from '../utils/storage';
import MarketplaceScreen from '../screens/MarketplaceScreen';
import FarmerOnboardingScreen from '../screens/FarmerOnboardingScreen';

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

// --- Minimal placeholder screens for Orders / Cart ---
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

// --- Profile (now the entry point into the Farmer Portal / Screen M-02) ---

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