import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Reminder,
  DoseEvent,
  DoseResolution,
  ScheduleConfigState,
  ColumnStockStatus,
} from '../types/reminder';
import {
  formatDateLocal,
  formatTime12,
  computeTargetTriggerEpoch,
  calculateColumnStock,
  extractCompartmentCoords,
} from './medicationLogic';

const REMINDERS_STORAGE_KEY = '@medicine_reminders';
const DOSE_HISTORY_STORAGE_KEY = '@medicine_dose_history';

/**
 * Load all stored reminders
 */
export async function loadReminders(): Promise<Reminder[]> {
  try {
    const json = await AsyncStorage.getItem(REMINDERS_STORAGE_KEY);
    if (!json) return [];
    return JSON.parse(json) as Reminder[];
  } catch {
    return [];
  }
}

/**
 * Save reminders array
 */
export async function saveReminders(reminders: Reminder[]): Promise<void> {
  try {
    await AsyncStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(reminders));
  } catch {
    // silently fail
  }
}

/**
 * Add or update a reminder, maintaining sync status
 */
export async function addReminder(reminder: Reminder): Promise<Reminder[]> {
  const existing = await loadReminders();
  const reminderWithSync: Reminder = {
    ...reminder,
    syncStatus: reminder.syncStatus ?? 'SYNC_PENDING',
  };

  // 1. If updating an existing ID:
  const existingIdIdx = existing.findIndex((r) => r.id === reminder.id);
  if (existingIdIdx >= 0) {
    existing[existingIdIdx] = reminderWithSync;
    await saveReminders(existing);
    return existing;
  }

  // 2. If compartment or slotIndex is set and already has a reminder on the same date, replace it:
  if (reminder.compartment) {
    const existingCompIdx = existing.findIndex(
      (r) =>
        r.compartment?.trim().toLowerCase() === reminder.compartment?.trim().toLowerCase() &&
        (r.date ?? '') === (reminder.date ?? '')
    );
    if (existingCompIdx >= 0) {
      existing[existingCompIdx] = reminderWithSync;
      await saveReminders(existing);
      return existing;
    }
  } else if (reminder.slotIndex !== undefined) {
    const existingSlotIdx = existing.findIndex(
      (r) => r.slotIndex === reminder.slotIndex && (r.date ?? '') === (reminder.date ?? '')
    );
    if (existingSlotIdx >= 0) {
      existing[existingSlotIdx] = reminderWithSync;
      await saveReminders(existing);
      return existing;
    }
  }

  // 3. Append as new reminder
  const updated = [...existing, reminderWithSync];
  await saveReminders(updated);
  return updated;
}

/**
 * Delete a reminder by ID
 */
export async function deleteReminder(id: string): Promise<Reminder[]> {
  const existing = await loadReminders();
  const updated = existing.filter((r) => r.id !== id);
  await saveReminders(updated);
  return updated;
}

/**
 * Update the Wi-Fi sync status of a reminder
 */
export async function markReminderSyncStatus(
  id: string,
  syncStatus: ScheduleConfigState
): Promise<Reminder[]> {
  const existing = await loadReminders();
  const updated = existing.map((r) =>
    r.id === id ? { ...r, syncStatus } : r
  );
  await saveReminders(updated);
  return updated;
}

/**
 * Get all reminders pending sync to the hardware
 */
export async function getPendingSyncReminders(): Promise<Reminder[]> {
  const existing = await loadReminders();
  return existing.filter((r) => r.syncStatus === 'SYNC_PENDING');
}

/**
 * Load all recorded dose history logs
 */
export async function loadDoseHistory(): Promise<DoseEvent[]> {
  try {
    const json = await AsyncStorage.getItem(DOSE_HISTORY_STORAGE_KEY);
    if (!json) return [];
    return JSON.parse(json) as DoseEvent[];
  } catch {
    return [];
  }
}

/**
 * Save dose history logs
 */
export async function saveDoseHistory(history: DoseEvent[]): Promise<void> {
  try {
    await AsyncStorage.setItem(DOSE_HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // silently fail
  }
}

/**
 * Record a dose event resolution (TAKEN, TAKEN_MANUAL, MISSED)
 */
export async function recordDoseResolution(
  reminder: Reminder,
  resolution: DoseResolution,
  resolvedAtEpochMs: number = Date.now()
): Promise<DoseEvent> {
  const history = await loadDoseHistory();
  const targetTriggerEpochMs = computeTargetTriggerEpoch(reminder, new Date(resolvedAtEpochMs));
  const triggerDate = reminder.date || formatDateLocal(new Date(targetTriggerEpochMs));
  const targetTriggerEpochSec = Math.floor(targetTriggerEpochMs / 1000);
  const resolvedAtEpochSec = Math.floor(resolvedAtEpochMs / 1000);
  const elapsedSeconds = Math.max(0, resolvedAtEpochSec - targetTriggerEpochSec);

  const event: DoseEvent = {
    eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    scheduleId: reminder.id,
    compartment: reminder.compartment,
    slotIndex: reminder.slotIndex,
    triggerDate,
    scheduledTimeFormatted: formatTime12(reminder.hour, reminder.minute, reminder.amPm),
    targetTriggerEpoch: targetTriggerEpochSec,
    resolvedAtEpoch: resolvedAtEpochSec,
    resolution,
    elapsedSeconds,
  };

  // Replace existing log for same schedule & date if already present, or append
  const existingIdx = history.findIndex(
    (h) => h.scheduleId === reminder.id && h.triggerDate === triggerDate
  );

  if (existingIdx >= 0) {
    history[existingIdx] = event;
  } else {
    history.unshift(event); // newest first
  }

  // Keep up to 100 history entries
  const trimmed = history.slice(0, 100);
  await saveDoseHistory(trimmed);
  return event;
}

const COLUMN_REFILLS_STORAGE_KEY = '@medicine_column_refills';

/**
 * Load refill dates map: key is `${drawer}_${column}` e.g. "1_A" -> "2026-10-20"
 */
export async function loadColumnRefills(): Promise<Record<string, string>> {
  try {
    const json = await AsyncStorage.getItem(COLUMN_REFILLS_STORAGE_KEY);
    if (!json) return {};
    return JSON.parse(json) as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * Record that a column has been restocked/refilled
 */
export async function recordColumnRefill(
  drawer: number,
  column: string,
  dateStr: string = formatDateLocal(new Date())
): Promise<void> {
  try {
    const map = await loadColumnRefills();
    const key = `${drawer}_${column.toUpperCase()}`;
    map[key] = dateStr;
    await AsyncStorage.setItem(COLUMN_REFILLS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // silently fail
  }
}

/**
 * Computes current stock status for all active schedules grouped by column
 */
export async function getColumnStockList(cycleDays: number = 7): Promise<ColumnStockStatus[]> {
  const [reminders, history, refillMap] = await Promise.all([
    loadReminders(),
    loadDoseHistory(),
    loadColumnRefills(),
  ]);

  const results: ColumnStockStatus[] = [];
  const processedKeys = new Set<string>();

  for (const reminder of reminders) {
    const coords = extractCompartmentCoords(reminder.compartment, reminder.slotIndex);
    const key = `${coords.drawer}_${coords.column}`;
    if (processedKeys.has(key)) continue;
    processedKeys.add(key);

    const refillDate = refillMap[key];
    const status = calculateColumnStock(reminder, history, cycleDays, refillDate);
    results.push(status);
  }

  return results;
}

