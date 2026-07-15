import AsyncStorage from '@react-native-async-storage/async-storage';

// Offline-first sync queue placeholder (SPEC.md §8.2). POP checks are queued locally
// (AsyncStorage) and flushed to the API when connectivity returns.
const QUEUE_KEY = 'abonten.pop.queue.v1';

export interface QueuedItem {
  id: string;
  payload: unknown;
  queuedAt: number;
}

export async function enqueue(item: QueuedItem): Promise<void> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  const queue: QueuedItem[] = raw ? (JSON.parse(raw) as QueuedItem[]) : [];
  queue.push(item);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function readQueue(): Promise<QueuedItem[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? (JSON.parse(raw) as QueuedItem[]) : [];
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
