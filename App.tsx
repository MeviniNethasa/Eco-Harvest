import React, { useState, useRef, useEffect, useCallback } from 'react';
import { StyleSheet, Animated, Platform } from 'react-native';

import TabNavigator from './src/navigation/TabNavigator';
import SplashScreen from './src/screens/SplashScreen';
import AdminVerificationDeskScreen from './src/admin/AdminVerificationDeskScreen';

/**
 * Web-only helper: is the current browser URL under `/admin`?
 * Always `false` on native (iOS/Android), where there is no `window` and the
 * mobile app should only ever render the standard splash -> TabNavigator flow.
 */
function isAdminPathname(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return false;
  }
  return window.location.pathname.startsWith('/admin');
}

export default function App() {
  // ---------------------------------------------------------------------
  // Web Path Routing: EcoHarvest Desktop Admin Command Panel (Screen A-01)
  // is a separate, web-only surface reachable at `/admin`, architecturally
  // isolated from the mobile app's TabNavigator. On web, the very first
  // render decides which surface to mount based on the current URL; on
  // native builds this is always `false` and the app behaves exactly as
  // before.
  // ---------------------------------------------------------------------
  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(isAdminPathname);

  // Keep the admin/mobile decision in sync with browser back/forward
  // navigation and any other history changes (e.g. a link elsewhere in the
  // web app pushing a new URL), so `/admin` <-> `/` works cleanly without a
  // full page reload.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const handlePopState = () => {
      setIsAdminRoute(isAdminPathname());
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // ---------------------------------------------------------------------
  // Existing splash screen boot flow (mobile app + web `/` path only) —
  // unchanged from before.
  // ---------------------------------------------------------------------
  const [showSplash, setShowSplash] = useState(true);

  // Used to cross-fade the splash overlay out once it finishes, rather than
  // hard-cutting straight to TabNavigator.
  const splashOpacity = useRef(new Animated.Value(1)).current;

  const handleSplashFinish = useCallback(() => {
    Animated.timing(splashOpacity, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }).start(() => {
      setShowSplash(false);
    });
  }, [splashOpacity]);

  // Admin Command Panel: bypasses the splash screen entirely and renders
  // immediately, regardless of splash state above.
  if (isAdminRoute) {
    return <AdminVerificationDeskScreen />;
  }

  if (showSplash) {
    return (
      <Animated.View style={[styles.flexFill, { opacity: splashOpacity }]}>
        <SplashScreen onFinish={handleSplashFinish} />
      </Animated.View>
    );
  }

  return <TabNavigator />;
}

const styles = StyleSheet.create({
  flexFill: {
    flex: 1,
  },
});