import AsyncStorage from '@react-native-async-storage/async-storage';
import { Reminder } from '../types/reminder';

const STORAGE_KEY = '@medicine_reminders';

export async function loadReminders(): Promise<Reminder[]> {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    if (!json) return [];
    return JSON.parse(json) as Reminder[];
  } catch {
    return [];
  }
}

export async function saveReminders(reminders: Reminder[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
  } catch {
    // silently fail
  }
}

export async function addReminder(reminder: Reminder): Promise<Reminder[]> {
  const existing = await loadReminders();
  // Prevent duplicate times
  const isDuplicate = existing.some(
    (r) => r.hour === reminder.hour && r.minute === reminder.minute && r.amPm === reminder.amPm
  );
  if (isDuplicate) return existing;
  const updated = [...existing, reminder];
  await saveReminders(updated);
  return updated;
}

export async function deleteReminder(id: string): Promise<Reminder[]> {
  const existing = await loadReminders();
  const updated = existing.filter((r) => r.id !== id);
  await saveReminders(updated);
  return updated;
}
