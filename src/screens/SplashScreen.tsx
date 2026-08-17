// src/screens/SplashScreen.tsx

import React, { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, Animated } from 'react-native';

type SplashScreenProps = {
  onFinish: () => void;
};

// Per design.md Section 3.1: displays for 2.2s on boot, then invokes
// onFinish() so the parent (App.tsx) can reveal the main app interface.
const SPLASH_DURATION_MS = 2200;
const FADE_IN_DURATION_MS = 600;

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: FADE_IN_DURATION_MS,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      onFinish();
    }, SPLASH_DURATION_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.brandContainer, { opacity: fadeAnim }]}>
        <Image
          source={require('../../assets/adaptive-icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>EcoHarvest</Text>
        <Text style={styles.tagline}>Fresh Produce • Direct from Farms</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F382C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandContainer: {
    alignItems: 'center',
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 24,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tagline: {
    marginTop: 8,
    fontSize: 14,
    color: '#86EFAC',
  },
});