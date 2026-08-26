// src/components/MapLocationPickerModal.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  Dimensions,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SRI_LANKA_LOCATIONS, PROVINCES, getDistricts, getCities } from '../data/sriLankaLocations';

export interface SelectedLocationData {
  address: string;
  city: string;
  district: string;
  province: string;
  latitude: number;
  longitude: number;
}

interface MapLocationPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectLocation: (data: SelectedLocationData) => void;
  initialLatitude?: number;
  initialLongitude?: number;
  title?: string;
}

const DEFAULT_LAT = 6.9271; // Colombo, Sri Lanka
const DEFAULT_LNG = 79.8612;

export default function MapLocationPickerModal({
  visible,
  onClose,
  onSelectLocation,
  initialLatitude = DEFAULT_LAT,
  initialLongitude = DEFAULT_LNG,
  title = 'Pin Location on Map',
}: MapLocationPickerModalProps) {
  const [currentLat, setCurrentLat] = useState<number>(initialLatitude);
  const [currentLng, setCurrentLng] = useState<number>(initialLongitude);
  const [zoom, setZoom] = useState<number>(14);
  const [resolvedAddress, setResolvedAddress] = useState<string>('Detecting address...');
  const [detectedCity, setDetectedCity] = useState<string>('');
  const [detectedDistrict, setDetectedDistrict] = useState<string>('');
  const [detectedProvince, setDetectedProvince] = useState<string>('');
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Pin animation for bounce effect on movement
  const pinBounceAnim = useRef(new Animated.Value(0)).current;
  const geocodeTimeoutRef = useRef<any>(null);

  // Match geocoded state/district/city to Sri Lanka dataset
  const matchToSriLankaDataset = useCallback((rawCity: string, rawDistrict: string, rawState: string) => {
    let matchedProvince = '';
    let matchedDistrict = '';
    let matchedCity = '';

    const clean = (s: string) => (s || '').toLowerCase().replace(/province|district/g, '').trim();

    // Match Province
    for (const prov of PROVINCES) {
      if (clean(rawState).includes(clean(prov)) || clean(prov).includes(clean(rawState))) {
        matchedProvince = prov;
        break;
      }
    }

    // Match District
    const districtPool = matchedProvince ? getDistricts(matchedProvince) : Object.keys(SRI_LANKA_LOCATIONS).flatMap((p) => Object.keys(SRI_LANKA_LOCATIONS[p]));
    for (const dist of districtPool) {
      if (clean(rawDistrict).includes(clean(dist)) || clean(rawCity).includes(clean(dist)) || clean(dist).includes(clean(rawDistrict))) {
        matchedDistrict = dist;
        if (!matchedProvince) {
          for (const prov of PROVINCES) {
            if (SRI_LANKA_LOCATIONS[prov]?.[dist]) {
              matchedProvince = prov;
              break;
            }
          }
        }
        break;
      }
    }

    // Match City
    if (matchedProvince && matchedDistrict) {
      const cityPool = getCities(matchedProvince, matchedDistrict);
      for (const c of cityPool) {
        if (clean(rawCity).includes(clean(c)) || clean(c).includes(clean(rawCity))) {
          matchedCity = c;
          break;
        }
      }
      if (!matchedCity && cityPool.length > 0) {
        matchedCity = cityPool[0];
      }
    }

    return {
      province: matchedProvince || 'Western',
      district: matchedDistrict || 'Colombo',
      city: matchedCity || (rawCity ? rawCity.trim() : 'Colombo'),
    };
  }, []);

  // Reverse geocode lat/lng to readable address
  const fetchAddress = useCallback(
    async (lat: number, lng: number) => {
      setIsGeocoding(true);
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
        const res = await fetch(url, {
          headers: {
            'Accept-Language': 'en',
            'User-Agent': 'EcoHarvest-App/1.0',
          },
        });
        if (res.ok) {
          const data = await res.json();
          const addr = data.address || {};
          const road = addr.road || addr.pedestrian || addr.suburb || addr.neighbourhood || '';
          const rawCity = addr.city || addr.town || addr.village || addr.municipality || addr.suburb || '';
          const rawDistrict = addr.county || addr.state_district || '';
          const rawState = addr.state || '';

          const matched = matchToSriLankaDataset(rawCity, rawDistrict, rawState);
          setDetectedProvince(matched.province);
          setDetectedDistrict(matched.district);
          setDetectedCity(matched.city);

          const formattedLine = [road, matched.city, matched.district].filter(Boolean).join(', ');
          setResolvedAddress(formattedLine || data.display_name?.split(',').slice(0, 3).join(', ') || 'Selected Location');
        } else {
          setResolvedAddress(`Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
      } catch (err) {
        console.log('Reverse geocoding notice:', err);
        setResolvedAddress(`Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      } finally {
        setIsGeocoding(false);
      }
    },
    [matchToSriLankaDataset]
  );

  // Trigger debounced geocoding on coordinate update
  const handleCoordinateChange = useCallback(
    (lat: number, lng: number) => {
      setCurrentLat(lat);
      setCurrentLng(lng);

      if (geocodeTimeoutRef.current) {
        clearTimeout(geocodeTimeoutRef.current);
      }
      geocodeTimeoutRef.current = setTimeout(() => {
        fetchAddress(lat, lng);
      }, 400);
    },
    [fetchAddress]
  );

  // Request user's GPS Location
  const handleLocateMe = useCallback(() => {
    setIsLocating(true);
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          handleCoordinateChange(latitude, longitude);
          setIsLocating(false);
        },
        (error) => {
          console.log('GPS Location Error:', error.message);
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 }
      );
    } else {
      setIsLocating(false);
    }
  }, [handleCoordinateChange]);

  // Initial load
  useEffect(() => {
    if (visible) {
      handleCoordinateChange(initialLatitude, initialLongitude);
      handleLocateMe();
    }
  }, [visible]);

  // Search places / cities
  const handleSearchPlace = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const q = encodeURIComponent(`${searchQuery.trim()}, Sri Lanka`);
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=1`;
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'en', 'User-Agent': 'EcoHarvest-App/1.0' },
      });
      if (res.ok) {
        const results = await res.json();
        if (results && results.length > 0) {
          const lat = parseFloat(results[0].lat);
          const lng = parseFloat(results[0].lon);
          handleCoordinateChange(lat, lng);
        }
      }
    } catch (err) {
      console.log('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  // Map Panning simulation / interaction
  const panMap = (dLat: number, dLng: number) => {
    Animated.sequence([
      Animated.timing(pinBounceAnim, { toValue: -14, duration: 150, useNativeDriver: true }),
      Animated.timing(pinBounceAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();

    const newLat = currentLat + dLat;
    const newLng = currentLng + dLng;
    handleCoordinateChange(newLat, newLng);
  };

  const handleConfirm = () => {
    onSelectLocation({
      address: resolvedAddress,
      city: detectedCity || 'Colombo',
      district: detectedDistrict || 'Colombo',
      province: detectedProvince || 'Western',
      latitude: currentLat,
      longitude: currentLng,
    });
    onClose();
  };

  // Compute OpenStreetMap static tile / dynamic interactive web canvas
  const mapEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${currentLng - 0.015}%2C${currentLat - 0.01}%2C${currentLng + 0.015}%2C${currentLat + 0.01}&layer=mapnik&marker=${currentLat}%2C${currentLng}`;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIconCircle}>
                <Ionicons name="location" size={20} color="#15803D" />
              </View>
              <View>
                <Text style={styles.headerTitle}>{title}</Text>
                <Text style={styles.headerSubtitle}>Drag or pan to position your exact pin</Text>
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </Pressable>
          </View>

          {/* Search Bar */}
          <View style={styles.searchBarContainer}>
            <Ionicons name="search-outline" size={18} color="#9CA3AF" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search town, city or area (e.g. Kandy, Negombo)"
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearchPlace}
              returnKeyType="search"
            />
            {isSearching ? (
              <ActivityIndicator size="small" color="#15803D" style={{ marginRight: 8 }} />
            ) : searchQuery.length > 0 ? (
              <Pressable onPress={handleSearchPlace} style={styles.searchActionBtn}>
                <Text style={styles.searchActionBtnText}>Go</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Interactive Map Viewport Container */}
          <View style={styles.mapViewport}>
            {/* Embedded Visual Map Layer */}
            {Platform.OS === 'web' ? (
              <iframe
                src={mapEmbedUrl}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  pointerEvents: 'none', // Allows center pin gestures
                }}
                title="Map Pin Picker"
              />
            ) : (
              <View style={styles.nativeMapBackground}>
                <View style={styles.mapGridPattern} />
              </View>
            )}

            {/* Fixed Center Pin with Bounce Animation */}
            <View style={styles.centerPinContainer} pointerEvents="none">
              <Animated.View
                style={[
                  styles.pinWrapper,
                  {
                    transform: [{ translateY: pinBounceAnim }],
                  },
                ]}
              >
                <View style={styles.pinBubble}>
                  <Ionicons name="pin" size={38} color="#DC2626" />
                </View>
                <View style={styles.pinShadow} />
              </Animated.View>
            </View>

            {/* D-Pad Pan Control Arrows for precise movement */}
            <View style={styles.panControlsContainer}>
              <Pressable
                style={[styles.panBtn, styles.panBtnNorth]}
                onPress={() => panMap(0.003, 0)}
                accessibilityLabel="Pan North"
              >
                <Ionicons name="chevron-up" size={18} color="#374151" />
              </Pressable>
              <View style={styles.panHorizontalRow}>
                <Pressable
                  style={[styles.panBtn, styles.panBtnWest]}
                  onPress={() => panMap(0, -0.003)}
                  accessibilityLabel="Pan West"
                >
                  <Ionicons name="chevron-back" size={18} color="#374151" />
                </Pressable>
                <Pressable
                  style={[styles.panBtn, styles.panBtnEast]}
                  onPress={() => panMap(0, 0.003)}
                  accessibilityLabel="Pan East"
                >
                  <Ionicons name="chevron-forward" size={18} color="#374151" />
                </Pressable>
              </View>
              <Pressable
                style={[styles.panBtn, styles.panBtnSouth]}
                onPress={() => panMap(-0.003, 0)}
                accessibilityLabel="Pan South"
              >
                <Ionicons name="chevron-down" size={18} color="#374151" />
              </Pressable>
            </View>

            {/* Quick GPS "Locate Me" Button */}
            <Pressable
              style={styles.gpsLocateBtn}
              onPress={handleLocateMe}
              disabled={isLocating}
              accessibilityLabel="Locate My GPS Position"
            >
              {isLocating ? (
                <ActivityIndicator size="small" color="#15803D" />
              ) : (
                <Ionicons name="navigate" size={20} color="#15803D" />
              )}
            </Pressable>

            {/* Coordinate Pill Badge */}
            <View style={styles.coordsBadge}>
              <Ionicons name="globe-outline" size={12} color="#4B5563" style={{ marginRight: 4 }} />
              <Text style={styles.coordsBadgeText}>
                {currentLat.toFixed(4)}° N, {currentLng.toFixed(4)}° E
              </Text>
            </View>
          </View>

          {/* Bottom Confirmation & Address Card */}
          <View style={styles.bottomCard}>
            <View style={styles.addressInfoRow}>
              <View style={styles.addressIconWrapper}>
                <Ionicons name="business-outline" size={20} color="#15803D" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.addressLabel}>Selected Address & Region</Text>
                {isGeocoding ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <ActivityIndicator size="small" color="#15803D" />
                    <Text style={styles.geocodingText}>Resolving street address…</Text>
                  </View>
                ) : (
                  <Text style={styles.addressValueText} numberOfLines={2}>
                    {resolvedAddress}
                  </Text>
                )}
                <View style={styles.tagsRow}>
                  {!!detectedCity && (
                    <View style={styles.tagBadge}>
                      <Text style={styles.tagBadgeText}>City: {detectedCity}</Text>
                    </View>
                  )}
                  {!!detectedDistrict && (
                    <View style={styles.tagBadge}>
                      <Text style={styles.tagBadgeText}>District: {detectedDistrict}</Text>
                    </View>
                  )}
                  {!!detectedProvince && (
                    <View style={[styles.tagBadge, { backgroundColor: '#DCFCE7' }]}>
                      <Text style={[styles.tagBadgeText, { color: '#15803D', fontWeight: '700' }]}>
                        {detectedProvince} Province
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionRow}>
              <Pressable style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmBtn} onPress={handleConfirm}>
                <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.confirmBtnText}>Confirm Location</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 600,
    maxHeight: '92%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },
  closeBtn: {
    padding: 4,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 12,
    height: 42,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#111827',
  },
  searchActionBtn: {
    backgroundColor: '#15803D',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  searchActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  mapViewport: {
    height: 320,
    width: '100%',
    position: 'relative',
    backgroundColor: '#E7F0E9',
    overflow: 'hidden',
  },
  nativeMapBackground: {
    flex: 1,
    backgroundColor: '#E7F0E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapGridPattern: {
    width: '100%',
    height: '100%',
    opacity: 0.15,
  },
  centerPinContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 38, // Anchors the pin point precisely to the center
  },
  pinBubble: {
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  pinShadow: {
    width: 14,
    height: 5,
    borderRadius: 7,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    marginTop: -4,
  },
  panControlsContainer: {
    position: 'absolute',
    left: 14,
    bottom: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 14,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  panHorizontalRow: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 2,
  },
  panBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  panBtnNorth: {},
  panBtnSouth: {},
  panBtnWest: {},
  panBtnEast: {},
  gpsLocateBtn: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  coordsBadge: {
    position: 'absolute',
    top: 10,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  coordsBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
  },
  bottomCard: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  addressInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  addressIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  addressLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addressValueText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginTop: 2,
    lineHeight: 18,
  },
  geocodingText: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: '500',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  tagBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 44,
    backgroundColor: '#F4F4F5',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  confirmBtn: {
    flex: 2,
    minHeight: 44,
    backgroundColor: '#15803D',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#15803D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
