// src/components/SLSIBadge.tsx
//
// Reusable "✓ SLSI Verified" badge with an attached info tooltip explaining
// what SLSI Organic Certification means. Used anywhere a verified crop or
// farm profile is shown (Marketplace crop cards, Farm Profile Page header,
// Bulk Match cards, etc.) so the explanation only has to be written once.
//
// Cross-platform interaction model:
//   - Native (iOS/Android): tap toggles the tooltip open/closed.
//   - Web (react-native-web): hover shows the tooltip, tap also toggles it
//     (so it still works on touch-enabled laptops/tablets running the web
//     build), and hovering away closes it.
//
// The tooltip renders inside a transparent, full-screen <Modal> rather than
// as an absolutely-positioned sibling View. Modals render in their own
// top-level native layer above everything else on screen, so the popover
// can never be clipped by a parent card's `overflow: 'hidden'` (or by a
// FlatList row boundary) the way an in-tree `position: 'absolute'` popover
// can. We measure the badge's on-screen position (via `measureInWindow`)
// right before opening so the Modal can still place the tooltip directly
// beside the badge that triggered it.

import React, { useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

const SLSI_GREEN = '#15803D';
const SLSI_GREEN_TINT = '#F0FDF4'; // faint green wash behind the badge chip
const SLSI_GREEN_BORDER = '#BBF7D0';

const TOOLTIP_TITLE = 'SLSI Organic Certified';
const TOOLTIP_BODY =
  'Verified under Sri Lanka Standard 1324. Guarantees produce is grown ' +
  'without toxic synthetic pesticides, chemical fertilizers, or heavy metals.';

const TOOLTIP_WIDTH = 240;
// Rough height estimate for this tooltip's fixed, short copy — used only to
// keep 'top' placement from measuring the tooltip itself (which would need
// an extra render pass). Generous enough that the card never overlaps the
// badge even if the copy above changes slightly.
const TOOLTIP_HEIGHT_ESTIMATE = 90;
const SCREEN_MARGIN = 12; // keeps the tooltip off the very edge of the screen
const TOOLTIP_GAP = 8; // vertical gap between the badge and the tooltip

export interface SLSIBadgeProps {
  /** Optional style override for the outer wrapper (e.g. margin/positioning
   * within a card's header row). Does not affect the tooltip's own styling. */
  style?: ViewStyle;
  /** Which side the tooltip opens on relative to the badge. Defaults to
   * 'bottom', which fits most crop-card and list-row layouts. Use 'top' for
   * badges near the bottom of a card (e.g. a sticky footer badge) so the
   * popover doesn't get clipped off-screen. */
  tooltipPlacement?: 'top' | 'bottom';
}

/** Measured on-screen position of the badge, used to place the Modal tooltip. */
interface BadgeAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * "✓ SLSI Verified" badge. Tap (native) or hover/tap (web) to reveal a short
 * explanation of what the certification covers.
 */
export function SLSIBadge({ style, tooltipPlacement = 'bottom' }: SLSIBadgeProps) {
  const [isTooltipVisible, setTooltipVisible] = useState(false);
  const [anchor, setAnchor] = useState<BadgeAnchor | null>(null);
  const badgeRef = useRef<View>(null);

  // Measures the badge's current on-screen position, then opens the
  // tooltip anchored to that measurement. Re-measuring on every open (not
  // just once on mount) means the tooltip still lands in the right place
  // even if the badge's card has scrolled or reflowed since last time.
  const measureAndShow = () => {
    badgeRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setTooltipVisible(true);
    });
  };

  const hideTooltip = () => setTooltipVisible(false);

  const toggleTooltip = () => {
    if (isTooltipVisible) {
      hideTooltip();
    } else {
      measureAndShow();
    }
  };

  // react-native-web's Pressable supports onHoverIn/onHoverOut; on native
  // these props are simply never invoked, so passing them unconditionally
  // is safe and avoids a runtime Platform branch inside the JSX.
  const webHoverHandlers =
    Platform.OS === 'web'
      ? { onHoverIn: measureAndShow, onHoverOut: hideTooltip }
      : {};

  const tooltipStyle = anchor ? computeTooltipStyle(anchor, tooltipPlacement) : null;

  return (
    <View style={[styles.wrapper, style]}>
      <Pressable
        ref={badgeRef}
        onPress={toggleTooltip}
        accessibilityRole="button"
        accessibilityLabel="SLSI Verified badge. Activate for certification details."
        hitSlop={6}
        style={({ pressed }) => [styles.badge, pressed && styles.badgePressed]}
        {...webHoverHandlers}
      >
        <Text style={styles.badgeText}>✓ SLSI Verified</Text>
      </Pressable>

      <Modal
        visible={isTooltipVisible}
        transparent
        animationType="fade"
        onRequestClose={hideTooltip}
      >
        {/* Full-screen backdrop: tapping anywhere outside the tooltip card
            dismisses it. Renders above every screen (Modals sit in their
            own native layer) so it's never clipped by a parent card's
            overflow:hidden. */}
        <Pressable style={styles.modalBackdrop} onPress={hideTooltip}>
          {tooltipStyle && (
            // A Pressable (not a plain View) so a tap on the tooltip card
            // itself is absorbed here rather than bubbling to the backdrop
            // and immediately closing it.
            <Pressable style={[styles.tooltip, tooltipStyle]} onPress={() => {}}>
              <Text style={styles.tooltipTitle}>{TOOLTIP_TITLE}</Text>
              <Text style={styles.tooltipBody}>{TOOLTIP_BODY}</Text>
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

/**
 * Positions the tooltip just below (or above) the measured badge, clamped
 * horizontally so it stays fully on-screen regardless of where the badge
 * sits (e.g. a badge pinned to a card's top-right corner near the screen edge).
 */
function computeTooltipStyle(
  anchor: BadgeAnchor,
  placement: 'top' | 'bottom'
): ViewStyle {
  const { width: screenWidth } = Dimensions.get('window');

  const maxLeft = screenWidth - TOOLTIP_WIDTH - SCREEN_MARGIN;
  const left = Math.max(SCREEN_MARGIN, Math.min(anchor.x, maxLeft));

  if (placement === 'bottom') {
    return { position: 'absolute', top: anchor.y + anchor.height + TOOLTIP_GAP, left };
  }
  // 'top' placement: anchor the tooltip's bottom edge just above the badge,
  // using the fixed height estimate above rather than a second measure pass.
  const top = Math.max(SCREEN_MARGIN, anchor.y - TOOLTIP_HEIGHT_ESTIMATE - TOOLTIP_GAP);
  return { position: 'absolute', top, left };
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'flex-start',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: SLSI_GREEN_TINT,
    borderColor: SLSI_GREEN_BORDER,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  badgePressed: {
    opacity: 0.7,
  },
  badgeText: {
    color: SLSI_GREEN,
    fontSize: 12,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    // Transparent on purpose — this tooltip is informational, not a
    // heavyweight dialog, so we don't want to dim the whole screen behind
    // it. The Pressable still covers the full screen to catch dismiss taps.
    backgroundColor: 'transparent',
  },
  tooltip: {
    width: TOOLTIP_WIDTH,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    // Card elevation/shadow, cross-platform: shadow* props for iOS/web,
    // elevation for Android.
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  tooltipTitle: {
    color: SLSI_GREEN,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  tooltipBody: {
    color: '#374151',
    fontSize: 12,
    lineHeight: 17,
  },
});

export default SLSIBadge;