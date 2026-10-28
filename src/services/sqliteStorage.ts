import * as SQLite from 'expo-sqlite';
import { Reminder, DoseEvent, ScheduleConfigState } from '../types/reminder';

const DB_NAME = 'smart_dispenser.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Initializes and returns the SQLite database instance
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY NOT NULL,
        hour INTEGER NOT NULL,
        minute INTEGER NOT NULL,
        second INTEGER,
        amPm TEXT NOT NULL,
        recurrence TEXT,
        date TEXT,
        compartment TEXT,
        slotIndex INTEGER,
        syncStatus TEXT,
        createdAt TEXT
      );

      CREATE TABLE IF NOT EXISTS dose_history (
        eventId TEXT PRIMARY KEY NOT NULL,
        scheduleId TEXT NOT NULL,
        compartment TEXT,
        slotIndex INTEGER,
        triggerDate TEXT NOT NULL,
        scheduledTimeFormatted TEXT NOT NULL,
        targetTriggerEpoch INTEGER NOT NULL,
        resolvedAtEpoch INTEGER,
        resolution TEXT NOT NULL,
        elapsedSeconds INTEGER
      );

      CREATE TABLE IF NOT EXISTS column_refills (
        drawer_column TEXT PRIMARY KEY NOT NULL,
        refillDate TEXT NOT NULL
      );
    `);

    try {
      await db.execAsync(`ALTER TABLE reminders ADD COLUMN second INTEGER;`);
    } catch {
      // Column already exists
    }

    dbInstance = db;
    return db;
  })();

  return initPromise;
}

/**
 * SQLite: Load all reminders
 */
export async function sqliteLoadReminders(): Promise<Reminder[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>('SELECT * FROM reminders ORDER BY hour ASC, minute ASC');
  return rows.map((r) => ({
    id: r.id,
    hour: r.hour,
    minute: r.minute,
    second: r.second !== null && r.second !== undefined ? Number(r.second) : undefined,
    amPm: r.amPm,
    recurrence: r.recurrence || undefined,
    date: r.date || undefined,
    compartment: r.compartment || undefined,
    slotIndex: r.slotIndex !== null ? r.slotIndex : undefined,
    syncStatus: r.syncStatus || 'SYNC_PENDING',
    createdAt: r.createdAt || undefined,
  }));
}

/**
 * SQLite: Upsert a reminder
 */
export async function sqliteSaveReminder(reminder: Reminder): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO reminders (id, hour, minute, second, amPm, recurrence, date, compartment, slotIndex, syncStatus, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      reminder.id,
      reminder.hour,
      reminder.minute,
      reminder.second !== undefined ? reminder.second : null,
      reminder.amPm,
      reminder.recurrence || null,
      reminder.date || null,
      reminder.compartment || null,
      reminder.slotIndex !== undefined ? reminder.slotIndex : null,
      reminder.syncStatus || 'SYNC_PENDING',
      reminder.createdAt || new Date().toISOString(),
    ]
  );
}

/**
 * SQLite: Delete a reminder and its associated dose history
 */
export async function sqliteDeleteReminder(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM reminders WHERE id = ?', [id]);
  await db.runAsync('DELETE FROM dose_history WHERE scheduleId = ?', [id]);
}

/**
 * SQLite: Update sync status
 */
export async function sqliteUpdateSyncStatus(id: string, syncStatus: ScheduleConfigState): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE reminders SET syncStatus = ? WHERE id = ?', [syncStatus, id]);
}

/**
 * SQLite: Load dose history (newest first)
 */
export async function sqliteLoadDoseHistory(): Promise<DoseEvent[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>('SELECT * FROM dose_history ORDER BY targetTriggerEpoch DESC LIMIT 100');
  return rows.map((r) => ({
    eventId: r.eventId,
    scheduleId: r.scheduleId,
    compartment: r.compartment || undefined,
    slotIndex: r.slotIndex !== null ? r.slotIndex : undefined,
    triggerDate: r.triggerDate,
    scheduledTimeFormatted: r.scheduledTimeFormatted,
    targetTriggerEpoch: r.targetTriggerEpoch,
    resolvedAtEpoch: r.resolvedAtEpoch !== null ? r.resolvedAtEpoch : undefined,
    resolution: r.resolution,
    elapsedSeconds: r.elapsedSeconds !== null ? r.elapsedSeconds : undefined,
  }));
}

/**
 * SQLite: Upsert dose event
 */
export async function sqliteRecordDoseEvent(event: DoseEvent): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO dose_history (eventId, scheduleId, compartment, slotIndex, triggerDate, scheduledTimeFormatted, targetTriggerEpoch, resolvedAtEpoch, resolution, elapsedSeconds)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.eventId,
      event.scheduleId,
      event.compartment || null,
      event.slotIndex !== undefined ? event.slotIndex : null,
      event.triggerDate,
      event.scheduledTimeFormatted,
      event.targetTriggerEpoch,
      event.resolvedAtEpoch !== undefined ? event.resolvedAtEpoch : null,
      event.resolution,
      event.elapsedSeconds !== undefined ? event.elapsedSeconds : null,
    ]
  );
}

/**
 * SQLite: Load column refills map
 */
export async function sqliteLoadColumnRefills(): Promise<Record<string, string>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ drawer_column: string; refillDate: string }>(
    'SELECT drawer_column, refillDate FROM column_refills'
  );
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.drawer_column] = row.refillDate;
  }
  return map;
}

/**
 * SQLite: Record column refill
 */
export async function sqliteRecordColumnRefill(drawer: number, column: string, refillDate: string): Promise<void> {
  const db = await getDatabase();
  const key = `${drawer}_${column.toUpperCase()}`;
  await db.runAsync(
    'INSERT OR REPLACE INTO column_refills (drawer_column, refillDate) VALUES (?, ?)',
    [key, refillDate]
  );
}

/**
 * SQLite: Clear all database data
 */
export async function sqliteClearAll(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`
    DELETE FROM reminders;
    DELETE FROM dose_history;
    DELETE FROM column_refills;
    VACUUM;
  `);
}
