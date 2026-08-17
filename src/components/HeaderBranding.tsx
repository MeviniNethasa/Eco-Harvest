// src/components/HeaderBranding.tsx

import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

// Reusable brand lockup (logo + "EcoHarvest" wordmark) meant to be dropped
// into top header bars across primary screens, per design.md Section 3.2
// (MarketplaceScreen, OrdersScreen, FarmerOnboardingScreen).
export default function HeaderBranding() {
  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/adaptive-icon.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.title}>EcoHarvest</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    width: 32,
    height: 32,
    marginRight: 8,
    borderRadius: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#15803D',
  },
});