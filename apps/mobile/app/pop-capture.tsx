import { Text, View } from 'react-native';

export default function PopCapture() {
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: '600' }}>POP Capture</Text>
      <Text>Offline-first photo + status capture; checks queue locally and sync when online (see src/lib/sync.ts).</Text>
    </View>
  );
}
