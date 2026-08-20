// src/components/StandardHeader.tsx
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import HeaderBranding from './HeaderBranding';

interface StandardHeaderProps {
  title?: string;
  subtitle?: string;
  showBranding?: boolean;
  rightElement?: React.ReactNode;
  onBack?: () => void;
}

export default function StandardHeader({
  title,
  subtitle,
  showBranding = true,
  rightElement,
  onBack,
}: StandardHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrapper, { paddingTop: Math.max(insets.top, 12) }]}>
      {showBranding && (
        <View style={styles.brandingRow}>
          <HeaderBranding />
          {rightElement && <View style={styles.rightSlot}>{rightElement}</View>}
        </View>
      )}

      {(title || onBack) && (
        <View style={[styles.titleRow, !showBranding && styles.titleRowNoBranding]}>
          {onBack && (
            <Pressable
              style={styles.backButton}
              onPress={onBack}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={24} color="#111827" />
            </Pressable>
          )}
          <View style={styles.titleTextContainer}>
            {title && <Text style={styles.titleText}>{title}</Text>}
            {subtitle && <Text style={styles.subtitleText}>{subtitle}</Text>}
          </View>
          {!showBranding && rightElement && (
            <View style={styles.rightSlot}>{rightElement}</View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  brandingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  rightSlot: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRowNoBranding: {
    marginTop: 4,
  },
  backButton: {
    marginRight: 8,
    padding: 2,
  },
  titleTextContainer: {
    flex: 1,
  },
  titleText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  subtitleText: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 1,
  },
});
