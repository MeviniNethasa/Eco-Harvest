// src/screens/DeliveryTrackingScreen.tsx
//
// Screen M-04: Uber Developer Sandbox Live Delivery Tracking.
//
// `react-native-maps` isn't available in this environment (native module
// install blocked by local network restrictions), so the "map" here is a
// custom-built visual simulation: a fixed-height viewport with farm/buyer
// pins and a courier marker positioned via simple lat/lng -> pixel
// projection, plus a rotated dashed line standing in for the routing
// polyline. It reads/writes through the same `storage.ts` sandbox
// functions (`getDeliveryTracking`, `updateDeliveryStatus`,
// `simulateCourierMovement`) that back the Orders tab.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Linking,
  Animated,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useRoute } from '@react-navigation/native';
import { DeliveryStatus, DeliveryTrackingData, GeoCoordinate } from '../types';
import {
  getDeliveryTracking,
  simulateCourierMovement,
  subscribeToTracking,
  updateDeliveryStatus,
} from '../utils/storage';

// This screen is pushed from both the Cart stack (post-checkout) and the
// Orders stack ("Track Delivery"), both of which declare an identically
// shaped `OrderTracking: { orderId: string }` route, so a local route type
// keeps this screen decoupled from either specific ParamList.
type TrackingRoute = RouteProp<{ OrderTracking: { orderId: string } }, 'OrderTracking'>;

const colors = {
  primaryGreen: '#15803D',
  farmGreen: '#16A34A',
  buyerRed: '#DC2626',
  bgMain: '#FAFAFA',
  bgCard: '#FFFFFF',
  bgMap: '#E7F0E9',
  borderGray: '#E5E7EB',
  textDark: '#111827',
  textMuted: '#6B7280',
  warning: '#D97706',
  danger: '#DC2626',
  otpBg: '#111827',
};

const MAP_HEIGHT = 450;
const MAP_INSET = 46; // keeps markers off the viewport edges
const SCREEN_WIDTH = Dimensions.get('window').width;
const MAP_WIDTH = SCREEN_WIDTH - 32; // matches 16px screen padding each side

// Simulate courier movement every 1.5s while IN_TRANSIT, matching the
// "call on an interval" usage note on `simulateCourierMovement`.
const SIMULATION_TICK_MS = 1500;

type TimelineStepId = 'assigned' | 'at_pickup' | 'in_transit' | 'delivered';

const TIMELINE_STEPS: { id: TimelineStepId; label: string }[] = [
  { id: 'assigned', label: 'Driver Assigned' },
  { id: 'at_pickup', label: 'Arrived at Farm' },
  { id: 'in_transit', label: 'In Transit' },
  { id: 'delivered', label: 'Delivered' },
];

// Order in the state machine, used to derive which timeline steps are
// "reached" for a given status (e.g. IN_TRANSIT means the first three
// steps are all complete).
const STATUS_ORDER: DeliveryStatus[] = [
  'ORDER_PLACED',
  'COURIER_ASSIGNED',
  'COURIER_AT_PICKUP',
  'IN_TRANSIT',
  'DELIVERED',
];

const STEP_STATUS_FLOOR: Record<TimelineStepId, DeliveryStatus> = {
  assigned: 'COURIER_ASSIGNED',
  at_pickup: 'COURIER_AT_PICKUP',
  in_transit: 'IN_TRANSIT',
  delivered: 'DELIVERED',
};

function statusIndex(status: DeliveryStatus): number {
  const idx = STATUS_ORDER.indexOf(status);
  return idx === -1 ? 0 : idx;
}

function isStepComplete(step: TimelineStepId, status: DeliveryStatus): boolean {
  if (status === 'CANCELLED') return false;
  return statusIndex(status) >= statusIndex(STEP_STATUS_FLOOR[step]);
}

const STATUS_LABELS: Record<DeliveryStatus, string> = {
  ORDER_PLACED: 'Order Placed',
  COURIER_ASSIGNED: 'Courier Assigned',
  COURIER_AT_PICKUP: 'Courier At Pickup',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

function computeBounds(a: GeoCoordinate, b: GeoCoordinate): MapBounds {
  return {
    minLat: Math.min(a.latitude, b.latitude),
    maxLat: Math.max(a.latitude, b.latitude),
    minLng: Math.min(a.longitude, b.longitude),
    maxLng: Math.max(a.longitude, b.longitude),
  };
}

/** Projects a lat/lng coordinate onto the map viewport's pixel space. */
function project(
  coord: GeoCoordinate,
  bounds: MapBounds,
  width: number,
  height: number
): { x: number; y: number } {
  const latRange = bounds.maxLat - bounds.minLat || 0.0001;
  const lngRange = bounds.maxLng - bounds.minLng || 0.0001;
  const usableW = width - MAP_INSET * 2;
  const usableH = height - MAP_INSET * 2;

  const x = MAP_INSET + ((coord.longitude - bounds.minLng) / lngRange) * usableW;
  // Invert latitude so "north" (higher lat) renders toward the top.
  const y = MAP_INSET + ((bounds.maxLat - coord.latitude) / latRange) * usableH;

  return { x, y };
}

function formatOrderIdSuffix(orderId: string): string {
  return orderId.length > 10 ? orderId.slice(-10) : orderId;
}

// --- Map viewport -----------------------------------------------------

function MapViewport({ tracking }: { tracking: DeliveryTrackingData }) {
  const bounds = computeBounds(tracking.farmCoordinate, tracking.buyerCoordinate);
  const farmPx = project(tracking.farmCoordinate, bounds, MAP_WIDTH, MAP_HEIGHT);
  const buyerPx = project(tracking.buyerCoordinate, bounds, MAP_WIDTH, MAP_HEIGHT);
  const courierPx = project(tracking.courierCoordinate, bounds, MAP_WIDTH, MAP_HEIGHT);

  const dx = buyerPx.x - farmPx.x;
  const dy = buyerPx.y - farmPx.y;
  const distance = Math.hypot(dx, dy);
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

  const courierAnim = useRef(new Animated.ValueXY({ x: courierPx.x, y: courierPx.y })).current;

  useEffect(() => {
    Animated.timing(courierAnim, {
      toValue: { x: courierPx.x, y: courierPx.y },
      duration: 900,
      useNativeDriver: false,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courierPx.x, courierPx.y]);

  const courierIconName = tracking.courier.vehicleType.toLowerCase().includes('tuk')
    ? 'bicycle'
    : tracking.courier.vehicleType.toLowerCase().includes('van') ||
      tracking.courier.vehicleType.toLowerCase().includes('truck')
    ? 'car'
    : 'bicycle';

  return (
    <View style={styles.mapViewport}>
      {/* Faux background grid to sell the "map" illusion without a real tile provider */}
      <View style={styles.mapGridOverlay} pointerEvents="none">
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={`h-${i}`} style={[styles.gridLineH, { top: (MAP_HEIGHT / 6) * i }]} />
        ))}
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={`v-${i}`} style={[styles.gridLineV, { left: (MAP_WIDTH / 6) * i }]} />
        ))}
      </View>

      {/* Routing polyline: a single dashed line rotated to connect the two pins */}
      <View
        pointerEvents="none"
        style={[
          styles.polyline,
          {
            width: distance,
            left: farmPx.x,
            top: farmPx.y,
            transform: [{ rotate: `${angleDeg}deg` }],
          },
        ]}
      />

      {/* Farm origin marker */}
      <View style={[styles.markerWrap, { left: farmPx.x - 16, top: farmPx.y - 32 }]}>
        <View style={[styles.markerPin, { backgroundColor: colors.farmGreen }]}>
          <Ionicons name="location" size={18} color="#FFFFFF" />
        </View>
        <Text style={styles.markerLabel}>Farm</Text>
      </View>

      {/* Buyer dropoff marker */}
      <View style={[styles.markerWrap, { left: buyerPx.x - 16, top: buyerPx.y - 32 }]}>
        <View style={[styles.markerPin, { backgroundColor: colors.buyerRed }]}>
          <Ionicons name="pin" size={18} color="#FFFFFF" />
        </View>
        <Text style={styles.markerLabel}>You</Text>
      </View>

      {/* Animated courier marker */}
      <Animated.View
        style={[
          styles.courierMarker,
          {
            transform: [
              { translateX: Animated.subtract(courierAnim.x, 18) },
              { translateY: Animated.subtract(courierAnim.y, 18) },
            ],
          },
        ]}
      >
        <View style={styles.courierPulse} />
        <View style={styles.courierPin}>
          <Ionicons name={courierIconName as any} size={18} color="#FFFFFF" />
        </View>
      </Animated.View>

      <View style={styles.etaChip}>
        <Ionicons name="time-outline" size={13} color={colors.primaryGreen} />
        <Text style={styles.etaChipText}>
          {tracking.status === 'DELIVERED' ? 'Arrived' : `${tracking.etaMinutes} min ETA`}
        </Text>
      </View>
    </View>
  );
}

// --- Shipment timeline --------------------------------------------------

function ShipmentTimeline({ status }: { status: DeliveryStatus }) {
  return (
    <View style={styles.timelineRow}>
      {TIMELINE_STEPS.map((step, i) => {
        const complete = isStepComplete(step.id, status);
        const isLast = i === TIMELINE_STEPS.length - 1;
        return (
          <View key={step.id} style={styles.timelineStepWrap}>
            <View style={styles.timelineDotRow}>
              <View
                style={[
                  styles.timelineDot,
                  complete && { backgroundColor: colors.primaryGreen, borderColor: colors.primaryGreen },
                ]}
              >
                {complete && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
              </View>
              {!isLast && (
                <View
                  style={[
                    styles.timelineConnector,
                    complete && isStepComplete(TIMELINE_STEPS[i + 1].id, status) && {
                      backgroundColor: colors.primaryGreen,
                    },
                  ]}
                />
              )}
            </View>
            <Text
              style={[
                styles.timelineLabel,
                complete && { color: colors.textDark, fontWeight: '600' },
              ]}
            >
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// --- Main screen ----------------------------------------------------------

export default function DeliveryTrackingScreen() {
  const route = useRoute<TrackingRoute>();
  const { orderId } = route.params;

  const [tracking, setTracking] = useState<DeliveryTrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);

  const loadTracking = useCallback(async () => {
    const data = await getDeliveryTracking(orderId);
    setTracking(data);
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    loadTracking();
  }, [loadTracking]);

  useEffect(() => {
    const unsubscribe = subscribeToTracking(orderId, setTracking);
    return unsubscribe;
  }, [orderId]);

  // Drive the courier marker along the farm -> buyer line while IN_TRANSIT.
  useEffect(() => {
    if (!tracking || tracking.status !== 'IN_TRANSIT') return;
    const interval = setInterval(() => {
      simulateCourierMovement(orderId);
    }, SIMULATION_TICK_MS);
    return () => clearInterval(interval);
  }, [orderId, tracking?.status]);

  const runTransition = useCallback(
    async (status: DeliveryStatus) => {
      setActionPending(true);
      try {
        await updateDeliveryStatus(orderId, status);
      } finally {
        setActionPending(false);
      }
    },
    [orderId]
  );

  const handleCall = useCallback(() => {
    if (!tracking) return;
    Linking.openURL(`tel:${tracking.courier.phone}`).catch(() => {
      // Best-effort — sandbox environments (e.g. simulators) may not
      // support tel: links, so silently ignore rather than crashing.
    });
  }, [tracking]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primaryGreen} />
      </View>
    );
  }

  if (!tracking) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={40} color={colors.textMuted} />
        <Text style={styles.emptyText}>Couldn't load tracking for this order.</Text>
      </View>
    );
  }

  const { status } = tracking;
  const canTriggerPickup = status === 'COURIER_ASSIGNED';
  const canAdvanceTransit = status === 'COURIER_AT_PICKUP';
  const canTriggerDelivery = status === 'IN_TRANSIT';
  const isTerminal = status === 'DELIVERED' || status === 'CANCELLED';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
      <View style={styles.orderMeta}>
        <Text style={styles.orderMetaText}>
          Order #{formatOrderIdSuffix(tracking.orderId)}
        </Text>
        <View
          style={[
            styles.statusPill,
            { backgroundColor: `${status === 'CANCELLED' ? colors.danger : colors.primaryGreen}1A` },
          ]}
        >
          <Text
            style={[
              styles.statusPillText,
              { color: status === 'CANCELLED' ? colors.danger : colors.primaryGreen },
            ]}
          >
            {STATUS_LABELS[status]}
          </Text>
        </View>
      </View>

      <MapViewport tracking={tracking} />

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Shipment Progress</Text>
        <ShipmentTimeline status={status} />
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Handshake OTP</Text>
        <Text style={styles.panelSubtitle}>
          Share this code with the courier when they arrive to confirm delivery.
        </Text>
        <View style={styles.otpBox}>
          {tracking.otp.split('').map((digit, i) => (
            <View key={i} style={styles.otpDigitBox}>
              <Text style={styles.otpDigitText}>{digit}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Your Courier</Text>
        <View style={styles.courierCard}>
          <View style={styles.courierAvatar}>
            <Ionicons name="person" size={22} color={colors.primaryGreen} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.courierName}>{tracking.courier.name}</Text>
            <Text style={styles.courierSub}>
              {tracking.courier.vehicleType} • {tracking.courier.plateNumber}
            </Text>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={12} color={colors.warning} />
              <Text style={styles.ratingText}>{tracking.courier.rating.toFixed(1)}</Text>
            </View>
          </View>
          <Pressable style={styles.callButton} onPress={handleCall}>
            <Ionicons name="call" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <View style={[styles.panel, styles.sandboxPanel]}>
        <View style={styles.sandboxHeaderRow}>
          <Ionicons name="construct-outline" size={16} color={colors.textMuted} />
          <Text style={styles.sandboxTitle}>Developer Sandbox Controls</Text>
        </View>
        <Text style={styles.panelSubtitle}>
          Simulate courier state transitions for this order without a real Uber
          integration.
        </Text>

        <Pressable
          disabled={!canTriggerPickup || actionPending}
          onPress={() => runTransition('COURIER_AT_PICKUP')}
          style={[styles.sandboxButton, !canTriggerPickup && styles.sandboxButtonDisabled]}
        >
          <Text
            style={[
              styles.sandboxButtonText,
              !canTriggerPickup && styles.sandboxButtonTextDisabled,
            ]}
          >
            [ Trigger Pickup ]
          </Text>
        </Pressable>

        <Pressable
          disabled={!canAdvanceTransit || actionPending}
          onPress={() => runTransition('IN_TRANSIT')}
          style={[styles.sandboxButton, !canAdvanceTransit && styles.sandboxButtonDisabled]}
        >
          <Text
            style={[
              styles.sandboxButtonText,
              !canAdvanceTransit && styles.sandboxButtonTextDisabled,
            ]}
          >
            [ Advance to Transit ]
          </Text>
        </Pressable>

        <Pressable
          disabled={!canTriggerDelivery || actionPending}
          onPress={() => runTransition('DELIVERED')}
          style={[
            styles.sandboxButton,
            styles.sandboxButtonPrimary,
            !canTriggerDelivery && styles.sandboxButtonDisabled,
          ]}
        >
          <Text
            style={[
              styles.sandboxButtonText,
              styles.sandboxButtonPrimaryText,
              !canTriggerDelivery && styles.sandboxButtonTextDisabled,
            ]}
          >
            [ Trigger Delivery ]
          </Text>
        </Pressable>

        {isTerminal && (
          <Text style={styles.sandboxDoneText}>
            {status === 'DELIVERED'
              ? 'Delivery complete — no further sandbox transitions available.'
              : 'This order was cancelled.'}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgMain,
    gap: 8,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },

  orderMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  orderMetaText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textDark,
  },
  statusPill: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // --- Map viewport ---
  mapViewport: {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    borderRadius: 16,
    backgroundColor: colors.bgMap,
    borderWidth: 1,
    borderColor: colors.borderGray,
    overflow: 'hidden',
    position: 'relative',
  },
  mapGridOverlay: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
},
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#D1E3D6',
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: '#D1E3D6',
  },
  polyline: {
    position: 'absolute',
    height: 0,
    borderTopWidth: 3,
    borderStyle: 'dashed',
    borderColor: colors.primaryGreen,
    opacity: 0.6,
    transformOrigin: 'left center',
  },
  markerWrap: {
    position: 'absolute',
    alignItems: 'center',
    width: 32,
  },
  markerPin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  markerLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
    color: colors.textDark,
    backgroundColor: '#FFFFFFCC',
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  courierMarker: {
    position: 'absolute',
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  courierPulse: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${colors.warning}33`,
  },
  courierPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
  etaChip: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  etaChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryGreen,
  },

  // --- Panels ---
  panel: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderGray,
    padding: 16,
    gap: 10,
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textDark,
  },
  panelSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: -4,
  },

  // --- Timeline ---
  timelineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  timelineStepWrap: {
    flex: 1,
    alignItems: 'flex-start',
  },
  timelineDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.borderGray,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineConnector: {
    flex: 1,
    height: 2,
    backgroundColor: colors.borderGray,
    marginHorizontal: 2,
  },
  timelineLabel: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 6,
  },

  // --- OTP ---
  otpBox: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  otpDigitBox: {
    width: 48,
    height: 56,
    borderRadius: 10,
    backgroundColor: colors.otpBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpDigitText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
  },

  // --- Courier card ---
  courierCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  courierAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: `${colors.primaryGreen}1A`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  courierName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textDark,
  },
  courierSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textDark,
  },
  callButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // --- Sandbox controls ---
  sandboxPanel: {
    backgroundColor: '#F9FAFB',
    borderStyle: 'dashed',
  },
  sandboxHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sandboxTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sandboxButton: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primaryGreen,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  sandboxButtonPrimary: {
    backgroundColor: colors.primaryGreen,
  },
  sandboxButtonDisabled: {
    borderColor: colors.borderGray,
    backgroundColor: '#F4F4F5',
  },
  sandboxButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryGreen,
  },
  sandboxButtonPrimaryText: {
    color: '#FFFFFF',
  },
  sandboxButtonTextDisabled: {
    color: colors.textMuted,
  },
  sandboxDoneText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 2,
  },
});