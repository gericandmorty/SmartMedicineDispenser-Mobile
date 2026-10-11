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
  // 1. If updating an existing ID:
  const existingIdIdx = existing.findIndex((r) => r.id === reminder.id);
  if (existingIdIdx >= 0) {
    existing[existingIdIdx] = reminder;
    await saveReminders(existing);
    return existing;
  }
  // 2. If compartment or slotIndex is set and already has a reminder on the same date, replace it:
  if (reminder.compartment) {
    const existingCompIdx = existing.findIndex(
      (r) => r.compartment === reminder.compartment && (r.date ?? '') === (reminder.date ?? '')
    );
    if (existingCompIdx >= 0) {
      existing[existingCompIdx] = reminder;
      await saveReminders(existing);
      return existing;
    }
  } else if (reminder.slotIndex !== undefined) {
    const existingSlotIdx = existing.findIndex(
      (r) => r.slotIndex === reminder.slotIndex && (r.date ?? '') === (reminder.date ?? '')
    );
    if (existingSlotIdx >= 0) {
      existing[existingSlotIdx] = reminder;
      await saveReminders(existing);
      return existing;
    }
  }
  // 3. Prevent exact duplicate times on the same date
  const isDuplicate = existing.some(
    (r) =>
      r.hour === reminder.hour &&
      r.minute === reminder.minute &&
      r.amPm === reminder.amPm &&
      (r.date ?? '') === (reminder.date ?? '')
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
