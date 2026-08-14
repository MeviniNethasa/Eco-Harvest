import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

/*export default function App() {
  return (
    <View style={styles.container}>
      <Text>Open up App.tsx to start working on your app!</Text>
      <StatusBar style="auto" />
    </View>
  );
}
  */

import TabNavigator from './src/navigation/TabNavigator';

export default function App() {
  return <TabNavigator />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
