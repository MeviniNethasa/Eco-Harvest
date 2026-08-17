import React, { useState, useRef } from 'react';
import { StyleSheet, Animated } from 'react-native';

import TabNavigator from './src/navigation/TabNavigator';
import SplashScreen from './src/screens/SplashScreen';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  // Used to cross-fade the splash overlay out once it finishes, rather than
  // hard-cutting straight to TabNavigator.
  const splashOpacity = useRef(new Animated.Value(1)).current;

  const handleSplashFinish = () => {
    Animated.timing(splashOpacity, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }).start(() => {
      setShowSplash(false);
    });
  };

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