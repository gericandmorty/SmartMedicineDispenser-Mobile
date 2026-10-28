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
import {
  sqliteLoadReminders,
  sqliteSaveReminder,
  sqliteDeleteReminder,
  sqliteUpdateSyncStatus,
  sqliteLoadDoseHistory,
  sqliteRecordDoseEvent,
  sqliteLoadColumnRefills,
  sqliteRecordColumnRefill,
  sqliteClearAll,
} from './sqliteStorage';
import { triggerImmediateRestockNotification } from './notifications';

const REMINDERS_STORAGE_KEY = '@medicine_reminders';
const DOSE_HISTORY_STORAGE_KEY = '@medicine_dose_history';
const COLUMN_REFILLS_STORAGE_KEY = '@medicine_column_refills';
const MIGRATION_FLAG_KEY = '@sqlite_migrated_v2';

/**
 * Load all stored reminders from SQLite (with AsyncStorage fallback/sync)
 */
export async function loadReminders(): Promise<Reminder[]> {
  try {
    const sqliteData = await sqliteLoadReminders();
    const isMigrated = await AsyncStorage.getItem(MIGRATION_FLAG_KEY);
    if (sqliteData && (sqliteData.length > 0 || isMigrated === 'true')) {
      return sqliteData;
    }
    // Only on initial fresh upgrade check AsyncStorage for legacy migration
    const json = await AsyncStorage.getItem(REMINDERS_STORAGE_KEY);
    if (json) {
      const items = JSON.parse(json) as Reminder[];
      for (const item of items) {
        await sqliteSaveReminder(item).catch(() => {});
      }
      await AsyncStorage.setItem(MIGRATION_FLAG_KEY, 'true').catch(() => {});
      return items;
    }
    await AsyncStorage.setItem(MIGRATION_FLAG_KEY, 'true').catch(() => {});
    return [];
  } catch {
    try {
      const json = await AsyncStorage.getItem(REMINDERS_STORAGE_KEY);
      return json ? (JSON.parse(json) as Reminder[]) : [];
    } catch {
      return [];
    }
  }
}

/**
 * Save reminders array to both SQLite and AsyncStorage
 */
export async function saveReminders(reminders: Reminder[]): Promise<void> {
  try {
    for (const r of reminders) {
      await sqliteSaveReminder(r).catch(() => {});
    }
  } catch {}
  try {
    await AsyncStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(reminders));
  } catch {}
}

/**
 * Add or update a reminder in SQLite and AsyncStorage
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
  } else if (reminder.compartment) {
    const existingCompIdx = existing.findIndex(
      (r) =>
        r.compartment?.trim().toLowerCase() === reminder.compartment?.trim().toLowerCase() &&
        (r.date ?? '') === (reminder.date ?? '')
    );
    if (existingCompIdx >= 0) {
      existing[existingCompIdx] = reminderWithSync;
    } else {
      existing.push(reminderWithSync);
    }
  } else if (reminder.slotIndex !== undefined) {
    const existingSlotIdx = existing.findIndex(
      (r) => r.slotIndex === reminder.slotIndex && (r.date ?? '') === (reminder.date ?? '')
    );
    if (existingSlotIdx >= 0) {
      existing[existingSlotIdx] = reminderWithSync;
    } else {
      existing.push(reminderWithSync);
    }
  } else {
    existing.push(reminderWithSync);
  }

  // SQLite write
  try {
    await sqliteSaveReminder(reminderWithSync);
  } catch (e) {
    console.warn('[storage] SQLite add failed:', e);
  }

  // AsyncStorage mirror
  await AsyncStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(existing)).catch(() => {});
  return existing;
}

/**
 * Delete a reminder by ID (cleans both reminder and dose history in SQLite and mirrors)
 */
export async function deleteReminder(id: string): Promise<Reminder[]> {
  try {
    await sqliteDeleteReminder(id);
  } catch (e) {
    console.warn('[storage] SQLite delete failed:', e);
  }

  // Also clean up dose_history in AsyncStorage for this schedule
  try {
    const historyJson = await AsyncStorage.getItem(DOSE_HISTORY_STORAGE_KEY);
    if (historyJson) {
      const history = JSON.parse(historyJson) as DoseEvent[];
      const cleaned = history.filter((h) => h.scheduleId !== id);
      await AsyncStorage.setItem(DOSE_HISTORY_STORAGE_KEY, JSON.stringify(cleaned));
    }
  } catch {}

  // Single source of truth is SQLite
  const updated = await sqliteLoadReminders();
  await AsyncStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  await AsyncStorage.setItem(MIGRATION_FLAG_KEY, 'true').catch(() => {});
  return updated;
}

/**
 * Update the Wi-Fi sync status of a reminder
 */
export async function markReminderSyncStatus(
  id: string,
  syncStatus: ScheduleConfigState
): Promise<Reminder[]> {
  try {
    await sqliteUpdateSyncStatus(id, syncStatus);
  } catch (e) {
    console.warn('[storage] SQLite update syncStatus failed:', e);
  }
  const existing = await loadReminders();
  const updated = existing.map((r) => (r.id === id ? { ...r, syncStatus } : r));
  await AsyncStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
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
 * Load all recorded dose history logs from SQLite
 */
export async function loadDoseHistory(): Promise<DoseEvent[]> {
  try {
    const sqliteHistory = await sqliteLoadDoseHistory();
    const isMigrated = await AsyncStorage.getItem(MIGRATION_FLAG_KEY);
    if (sqliteHistory && (sqliteHistory.length > 0 || isMigrated === 'true')) {
      return sqliteHistory;
    }
    const json = await AsyncStorage.getItem(DOSE_HISTORY_STORAGE_KEY);
    if (json) {
      const items = JSON.parse(json) as DoseEvent[];
      for (const item of items) {
        await sqliteRecordDoseEvent(item).catch(() => {});
      }
      return items;
    }
    return [];
  } catch {
    try {
      const json = await AsyncStorage.getItem(DOSE_HISTORY_STORAGE_KEY);
      return json ? (JSON.parse(json) as DoseEvent[]) : [];
    } catch {
      return [];
    }
  }
}

/**
 * Save dose history logs
 */
export async function saveDoseHistory(history: DoseEvent[]): Promise<void> {
  try {
    for (const item of history) {
      await sqliteRecordDoseEvent(item).catch(() => {});
    }
  } catch {}
  try {
    await AsyncStorage.setItem(DOSE_HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {}
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
    scheduledTimeFormatted: formatTime12(reminder.hour, reminder.minute, reminder.amPm, reminder.second),
    targetTriggerEpoch: targetTriggerEpochSec,
    resolvedAtEpoch: resolvedAtEpochSec,
    resolution,
    elapsedSeconds,
  };

  // SQLite write
  try {
    await sqliteRecordDoseEvent(event);
  } catch (e) {
    console.warn('[storage] SQLite record dose failed:', e);
  }

  // AsyncStorage write
  const existingIdx = history.findIndex(
    (h) => h.scheduleId === reminder.id && h.triggerDate === triggerDate
  );
  if (existingIdx >= 0) {
    history[existingIdx] = event;
  } else {
    history.unshift(event);
  }
  const trimmed = history.slice(0, 100);
  await AsyncStorage.setItem(DOSE_HISTORY_STORAGE_KEY, JSON.stringify(trimmed)).catch(() => {});

  // If dose was taken, check if column is now out of stock (0/7 remaining)
  if (resolution === 'TAKEN' || resolution === 'TAKEN_MANUAL') {
    try {
      const coords = extractCompartmentCoords(reminder.compartment, reminder.slotIndex);
      const refillMap = await loadColumnRefills();
      const key = `${coords.drawer}_${coords.column}`;
      const refillDate = refillMap[key];
      const stock = calculateColumnStock(reminder, trimmed, 7, refillDate);
      if (stock.isOutOfStock) {
        await triggerImmediateRestockNotification(coords.drawer, coords.column);
      }
    } catch {}
  }

  return event;
}

/**
 * Load refill dates map from SQLite: key is `${drawer}_${column}` e.g. "1_A" -> "2026-10-20"
 */
export async function loadColumnRefills(): Promise<Record<string, string>> {
  try {
    const sqliteRefills = await sqliteLoadColumnRefills();
    if (sqliteRefills && Object.keys(sqliteRefills).length > 0) {
      return sqliteRefills;
    }
    const json = await AsyncStorage.getItem(COLUMN_REFILLS_STORAGE_KEY);
    return json ? (JSON.parse(json) as Record<string, string>) : {};
  } catch {
    try {
      const json = await AsyncStorage.getItem(COLUMN_REFILLS_STORAGE_KEY);
      return json ? (JSON.parse(json) as Record<string, string>) : {};
    } catch {
      return {};
    }
  }
}

/**
 * Record that a column has been restocked/refilled in SQLite
 */
export async function recordColumnRefill(
  drawer: number,
  column: string,
  dateStr: string = formatDateLocal(new Date())
): Promise<void> {
  try {
    await sqliteRecordColumnRefill(drawer, column, dateStr);
  } catch (e) {
    console.warn('[storage] SQLite column refill failed:', e);
  }
  try {
    const map = await loadColumnRefills();
    const key = `${drawer}_${column.toUpperCase()}`;
    map[key] = dateStr;
    await AsyncStorage.setItem(COLUMN_REFILLS_STORAGE_KEY, JSON.stringify(map));
  } catch {}
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

/**
 * Directly seeds phased-out (0/7 doses remaining) test data into SQLite
 */
export async function seedPhasedOutMedicineData(): Promise<{
  reminder: Reminder;
  historyCount: number;
}> {
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);
  const baselineStr = formatDateLocal(sevenDaysAgo);

  const demoReminder: Reminder = {
    id: 'demo_phased_out_colA',
    hour: 8,
    minute: 30,
    amPm: 'AM',
    recurrence: 'every-day',
    compartment: 'Drawer 1 (A1)',
    slotIndex: 0,
    syncStatus: 'ACTIVE',
    createdAt: `${baselineStr}T08:30:00.000Z`,
  };

  await addReminder(demoReminder);
  await recordColumnRefill(1, 'A', baselineStr);

  // Insert 7 doses taken (one for each past day from baseline to today)
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = formatDateLocal(d);

    await recordDoseResolution(
      demoReminder,
      'TAKEN',
      new Date(`${dateStr}T08:35:00`).getTime()
    );
  }

  // Fire the out of stock push notification
  await triggerImmediateRestockNotification(1, 'A').catch(() => {});

  return { reminder: demoReminder, historyCount: 7 };
}

/**
 * Clear all SQLite & AsyncStorage data cleanly
 */
export async function clearAllMedicineData(): Promise<void> {
  try {
    await sqliteClearAll();
  } catch (e) {
    console.warn('[storage] SQLite clear failed:', e);
  }
  await AsyncStorage.multiRemove([
    REMINDERS_STORAGE_KEY,
    DOSE_HISTORY_STORAGE_KEY,
    COLUMN_REFILLS_STORAGE_KEY,
  ]).catch(() => {});
  // Mark migrated so stale data is never revived
  await AsyncStorage.setItem(MIGRATION_FLAG_KEY, 'true').catch(() => {});
}
