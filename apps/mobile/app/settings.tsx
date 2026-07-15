import { Text, View } from 'react-native';

export default function Settings() {
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: '600' }}>Settings</Text>
      <Text>API base URL, language (EN/FR), and sync preferences.</Text>
    </View>
  );
}
