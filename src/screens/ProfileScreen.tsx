// src/screens/ProfileScreen.tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ProfileStackParamList } from '../navigation/TabNavigator';

type ProfileNavProp = NativeStackNavigationProp<ProfileStackParamList, 'ProfileHome'>;

export default function ProfileScreen() {
  const navigation = useNavigation<ProfileNavProp>();

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>Profile</Text>

      {/* Entry point into Screen M-02: Farmer Account Onboarding & Product
          Publisher. Keeps the buyer-facing Profile screen unchanged while
          giving farmers a clean way to switch into the Farmer Portal. */}
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
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    padding: 16,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  farmerModeCard: {
    flexDirection: 'row',
    alignItems: 'center',
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
  chevron: {
    fontSize: 24,
    color: '#6B7280',
  },
});