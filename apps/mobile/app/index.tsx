import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function Home() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Abonten</Text>
      <Text>Outdoor advertising field operations.</Text>
      <Link href="/pop-capture" style={styles.link}>POP Capture</Link>
      <Link href="/campaign-monitor" style={styles.link}>Campaign Monitor</Link>
      <Link href="/settings" style={styles.link}>Settings</Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 8 },
  title: { fontSize: 22, fontWeight: 'bold' },
  link: { color: 'blue', marginTop: 8 },
});
