// src/screens/MarketplaceScreen.tsx
//
// PART 2 REFACTOR: "Product-First" -> "Farmer-First" landing view.
// Instead of listing individual crops, this screen now renders a directory
// of Farms (FarmerProfile records). Tapping a Farm Card pushes into
// FarmerDetailScreen (the per-farm storefront), where the farm's crops are
// listed using the existing ProductCard.

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Image,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { FarmerProfile, MarketplaceStackParamList } from '../types';
import { getFarmers } from '../utils/storage';
import SLSIBadge from '../components/SLSIBadge';
import HeaderBranding from '../components/HeaderBranding';

type MarketplaceNavProp = NativeStackNavigationProp<
  MarketplaceStackParamList,
  'MarketplaceHome'
>;

const PLACEHOLDER_COVER =
  'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=400&q=60';

// Builds a "City, District, Province" label from FarmerProfile's actual
// (required, string) location fields — there's no single pre-formatted
// `location` field on FarmerProfile, per src/types/index.ts.
function formatFarmLocation(farm: FarmerProfile): string {
  const parts = [farm.city, farm.district, farm.province].filter(
    (part) => !!part
  );
  return parts.length > 0 ? parts.join(', ') : 'Location unavailable';
}

interface FarmCardProps {
  farm: FarmerProfile;
  onPress: () => void;
}

function FarmCard({ farm, onPress }: FarmCardProps) {
  const coverUri = farm.farmCoverPhotoUrl || PLACEHOLDER_COVER;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {/* position: 'relative' required here so SLSIBadge (position: absolute
          internally) anchors correctly within this card. */}
      <View style={styles.coverWrap}>
        <Image source={{ uri: coverUri }} style={styles.coverImage} />
        {/* SLSIBadge has no isVerified prop by design (see SLSIBadge.tsx) —
            it's always rendered as "✓ SLSI Verified" and the caller decides
            whether it should be mounted at all. Pinned to the top-right
            corner of the cover image (rather than left in its default
            in-flow position) so it never sits on top of farmName below. */}
        {farm.isSLSIVerified && <SLSIBadge style={styles.slsiBadge} />}
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.farmName} numberOfLines={1}>
          {farm.farmName}
        </Text>

        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={13} color="#6B7280" />
          <Text style={styles.locationText} numberOfLines={1}>
            {formatFarmLocation(farm)}
          </Text>
        </View>

        {/* FarmerProfile's "About this farm" field is `description`, not
            `bio` — see src/types/index.ts. */}
        {farm.description ? (
          <Text style={styles.bioText} numberOfLines={2}>
            {farm.description}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default function MarketplaceScreen() {
  const navigation = useNavigation<MarketplaceNavProp>();
  const [searchQuery, setSearchQuery] = useState('');
  const [farms, setFarms] = useState<FarmerProfile[]>([]);

  // getFarmers() reads AsyncStorage (it merges the on-device farmer profile
  // into MOCK_FARMERS) so it's async. Re-read on every focus so a farm
  // published/edited via Farmer Onboarding (Screen M-02) shows up
  // immediately when the user returns to this tab — including right after
  // the on-device profile itself was just created/edited.
  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      getFarmers().then((result) => {
        if (isActive) setFarms(result);
      });
      return () => {
        isActive = false;
      };
    }, [])
  );

  const filteredFarms = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return farms;
    return farms.filter((farm) => {
      const nameMatch = farm.farmName.toLowerCase().includes(query);
      const locationMatch = formatFarmLocation(farm).toLowerCase().includes(query);
      return nameMatch || locationMatch;
    });
  }, [farms, searchQuery]);

  const handlePressFarm = useCallback(
    (farm: FarmerProfile) => {
      navigation.navigate('FarmerDetailScreen', {
        farmerId: farm.id,
        farmName: farm.farmName,
      });
    },
    [navigation]
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.brandRow}>
        <HeaderBranding />
      </View>

      {/* Sticky Top Header. The category/price FilterModal from the
          Product-First layout is intentionally dropped here — those filters
          don't map onto a farm directory (no category, no price range per
          farm). If you want farm-level filtering (e.g. verified-only,
          province), that would need a small farm-specific filter component;
          out of scope for this pass since FilterModal wasn't part of the
          Part 2 brief or the uploaded files. */}
      <View style={styles.header}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#6B7280" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search farms or locations..."
            placeholderTextColor="#6B7280"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <FlatList
        data={filteredFarms}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.gridContent}
        renderItem={({ item }) => (
          <FarmCard farm={item} onPress={() => handlePressFarm(item)} />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No farms match your search.
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E2EB',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F4F5',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    padding: 0,
  },
  gridContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  card: {
    width: 171,
    backgroundColor: '#F4F4F5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    marginBottom: 16,
  },
  coverWrap: {
    // Required so SLSIBadge (position: absolute) anchors to this card's
    // cover image rather than the nearest other positioned ancestor.
    position: 'relative',
    width: '100%',
    height: 100,
    backgroundColor: '#E5E7EB',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  // Pins the badge to the cover image's top-right corner instead of its
  // default in-flow position, so it never overlaps farmName in cardBody.
  slsiBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  cardBody: {
    padding: 8,
  },
  farmName: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    color: '#111827',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 3,
  },
  locationText: {
    fontSize: 12,
    color: '#6B7280',
    flexShrink: 1,
  },
  bioText: {
    fontSize: 12,
    color: '#374151',
    marginTop: 6,
    lineHeight: 16,
  },
  emptyState: {
    marginTop: 64,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});