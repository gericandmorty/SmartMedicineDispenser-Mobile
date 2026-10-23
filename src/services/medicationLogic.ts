import type {
  Reminder,
  DoseEvent,
  DoseOccurrenceState,
  ColumnStockStatus,
  AmPm,
} from '../types/reminder.ts';

export const GRACE_PERIOD_MINUTES = 20;
export const GRACE_PERIOD_SECONDS = GRACE_PERIOD_MINUTES * 60; // 1200 seconds
export const GRACE_PERIOD_MS = GRACE_PERIOD_SECONDS * 1000;    // 1,200,000 ms

/**
 * Converts 12-hour format + AM/PM to 24-hour integer (0-23)
 */
export function to24Hour(hour12: number, amPm: AmPm): number {
  let h = hour12 % 12;
  if (amPm === 'PM') {
    h += 12;
  }
  return h;
}

/**
 * Returns 12-hour hour (1-12), minute (0-59), second (0-59), and amPm ('AM' | 'PM') for a given Date (defaults to now).
 */
export function getCurrentTime12(d: Date = new Date()): { hour: number; minute: number; second: number; amPm: AmPm } {
  const rawHours = d.getHours();
  const minute = d.getMinutes();
  const second = d.getSeconds();
  const amPm: AmPm = rawHours >= 12 ? 'PM' : 'AM';
  let hour = rawHours % 12;
  if (hour === 0) {
    hour = 12;
  }
  return { hour, minute, second, amPm };
}

/**
 * Formats hour, minute, amPm, and optional second to a standard string e.g. "11:00 AM" or "11:00:30 AM"
 */
export function formatTime12(hour: number, minute: number, amPm: AmPm, second?: number): string {
  const padMin = String(minute).padStart(2, '0');
  if (second !== undefined) {
    const padSec = String(second).padStart(2, '0');
    return `${hour}:${padMin}:${padSec} ${amPm}`;
  }
  return `${hour}:${padMin} ${amPm}`;
}

/**
 * Formats a Date object to YYYY-MM-DD in local time
 */
export function formatDateLocal(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Computes the absolute target trigger epoch (in ms) for a reminder on a given date.
 */
export function computeTargetTriggerEpoch(reminder: Reminder, referenceDate: Date = new Date()): number {
  const h24 = to24Hour(reminder.hour, reminder.amPm);
  const sec = reminder.second ?? 0;

  if (reminder.date) {
    const [y, m, d] = reminder.date.split('-').map(Number);
    const target = new Date(y, m - 1, d, h24, reminder.minute, sec, 0);
    return target.getTime();
  }

  // Daily recurring reminder: target is today on referenceDate
  const target = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
    h24,
    reminder.minute,
    sec,
    0
  );
  return target.getTime();
}

export interface DoseOccurrenceResult {
  state: DoseOccurrenceState;
  remainingSeconds: number;
  elapsedSeconds: number;
  targetTriggerEpochMs: number;
  triggerDate: string;
}

/**
 * Determines the current dose occurrence state and countdown timers.
 * 
 * Logic Guarantee:
 * - Uses absolute epoch math (never in-memory intervals).
 * - Honors the 20-minute (1200-second) window.
 * - Accurately transitions UPCOMING -> ALERTING -> TAKEN / MISSED.
 */
export function calculateDoseOccurrence(
  reminder: Reminder,
  nowEpochMs: number = Date.now(),
  historyLogs: DoseEvent[] = []
): DoseOccurrenceResult {
  const nowDate = new Date(nowEpochMs);
  const triggerEpochMs = computeTargetTriggerEpoch(reminder, nowDate);
  const triggerDateStr = reminder.date || formatDateLocal(new Date(triggerEpochMs));

  // 1. Check if an event log already exists for this reminder on this trigger date
  const existingLog = historyLogs.find(
    (log) => log.scheduleId === reminder.id && log.triggerDate === triggerDateStr
  );

  if (existingLog) {
    return {
      state: existingLog.resolution,
      remainingSeconds: 0,
      elapsedSeconds: existingLog.elapsedSeconds ?? 0,
      targetTriggerEpochMs: triggerEpochMs,
      triggerDate: triggerDateStr,
    };
  }

  // 2. No explicit log found yet. Evaluate current time relative to the 20-minute window.
  const diffMs = nowEpochMs - triggerEpochMs;

  if (diffMs < 0) {
    // Scheduled in future
    return {
      state: 'UPCOMING',
      remainingSeconds: 0,
      elapsedSeconds: 0,
      targetTriggerEpochMs: triggerEpochMs,
      triggerDate: triggerDateStr,
    };
  }

  if (diffMs <= GRACE_PERIOD_MS) {
    // Active within 20-minute window
    const elapsedSeconds = Math.floor(diffMs / 1000);
    const remainingSeconds = Math.max(0, GRACE_PERIOD_SECONDS - elapsedSeconds);
    return {
      state: 'ALERTING',
      remainingSeconds,
      elapsedSeconds,
      targetTriggerEpochMs: triggerEpochMs,
      triggerDate: triggerDateStr,
    };
  }

  // More than 20 minutes elapsed without intake
  return {
    state: 'MISSED',
    remainingSeconds: 0,
    elapsedSeconds: GRACE_PERIOD_SECONDS,
    targetTriggerEpochMs: triggerEpochMs,
    triggerDate: triggerDateStr,
  };
}

/**
 * Checks for conflicting schedules on the same compartment or slot.
 * Enforces TC-4.5: A physical compartment cannot have multiple active reminders
 * on the same date.
 */
export function validateScheduleConflict(
  newReminder: Reminder,
  existingReminders: Reminder[]
): { hasConflict: boolean; reason?: string } {
  const newDate = newReminder.date || '';

  for (const existing of existingReminders) {
    // Ignore self when editing
    if (existing.id === newReminder.id) continue;

    const existingDate = existing.date || '';

    // Check compartment collision
    const sameCompartment =
      newReminder.compartment &&
      existing.compartment &&
      newReminder.compartment.trim().toLowerCase() === existing.compartment.trim().toLowerCase();

    // Check slot index collision
    const sameSlot =
      newReminder.slotIndex !== undefined &&
      existing.slotIndex !== undefined &&
      newReminder.slotIndex === existing.slotIndex;

    if (sameCompartment || sameSlot) {
      // Conflict if both are daily OR both target the exact same date
      const datesOverlap =
        !newDate || !existingDate || newDate === existingDate;

      if (datesOverlap) {
        const slotDesc = newReminder.compartment || `Slot ${(newReminder.slotIndex ?? 0) + 1}`;
        return {
          hasConflict: true,
          reason: `A schedule already exists for ${slotDesc}. Each compartment holds one dose per schedule period.`,
        };
      }
    }
  }

  return { hasConflict: false };
}

/**
 * Reconciles local event history with hardware event logs fetched over Wi-Fi.
 * Enforces TC-4.1: If the phone was offline and the hardware logged "TAKEN",
 * hardware resolution takes precedence.
 */
export function reconcileHardwareEvents(
  localEvents: DoseEvent[],
  hardwareEvents: DoseEvent[]
): DoseEvent[] {
  const map = new Map<string, DoseEvent>();

  // Insert local events first
  for (const event of localEvents) {
    const key = `${event.scheduleId}_${event.triggerDate}`;
    map.set(key, event);
  }

  // Overlay hardware events
  for (const hwEvent of hardwareEvents) {
    const key = `${hwEvent.scheduleId}_${hwEvent.triggerDate}`;
    const local = map.get(key);

    if (!local) {
      map.set(key, hwEvent);
    } else {
      // If local is pending or missed, but hardware confirmed taken:
      if (hwEvent.resolution === 'TAKEN') {
        map.set(key, { ...local, ...hwEvent, resolution: 'TAKEN' });
      }
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => b.targetTriggerEpoch - a.targetTriggerEpoch
  );
}

/**
 * Extracts drawer, column (A-G), and row (1-3) from compartment label or slotIndex
 */
export function extractCompartmentCoords(
  compartment?: string,
  slotIndex?: number
): { drawer: number; column: string; row: string } {
  if (compartment) {
    const match = compartment.match(/Drawer\s*(\d+)\s*\(([A-G])([1-3])\)/i);
    if (match) {
      return {
        drawer: parseInt(match[1], 10),
        column: match[2].toUpperCase(),
        row: match[3],
      };
    }
  }

  if (slotIndex !== undefined) {
    const drawer = Math.floor(slotIndex / 21) + 1;
    const inDrawer = slotIndex % 21;
    const row = String(Math.floor(inDrawer / 7) + 1);
    const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const column = cols[inDrawer % 7] || 'A';
    return { drawer, column, row };
  }

  return { drawer: 1, column: 'A', row: '1' };
}

/**
 * Calculates stock levels and weekly refill status for a column without needing hardware sensors.
 * Based on user requirement:
 * - Tracks dose intake count for the scheduled column.
 * - For a daily schedule, cycleCapacity defaults to 7 days (1 week).
 * - When all 7 doses have been taken, marks isOutOfStock = true and schedules a restock alert.
 */
export function calculateColumnStock(
  reminder: Reminder,
  doseHistory: DoseEvent[] = [],
  cycleDays: number = 7,
  lastRefilledDateStr?: string,
  referenceNow: Date = new Date()
): ColumnStockStatus {
  const coords = extractCompartmentCoords(reminder.compartment, reminder.slotIndex);
  const compartmentLabel = `Drawer ${coords.drawer} (Column ${coords.column})`;

  // Refill baseline date: either explicit refill date or reminder creation date
  const refillBaseline = lastRefilledDateStr || formatDateLocal(new Date(reminder.createdAt || referenceNow));

  // Count taken doses for this schedule since the last refill date
  const dosesTaken = doseHistory.filter((event) => {
    const isSameSchedule = event.scheduleId === reminder.id;
    const isAfterRefill = event.triggerDate >= refillBaseline;
    const isTaken = event.resolution === 'TAKEN' || event.resolution === 'TAKEN_MANUAL';
    return isSameSchedule && isAfterRefill && isTaken;
  }).length;

  const remainingDoses = Math.max(0, cycleDays - dosesTaken);
  const isOutOfStock = remainingDoses === 0;
  const isLowStock = remainingDoses <= 2 && remainingDoses > 0;

  // Calculate next restock date (refillBaseline + cycleDays days)
  const [ry, rm, rd] = refillBaseline.split('-').map(Number);
  const nextRestock = new Date(ry, rm - 1, rd + cycleDays);
  const nextRestockDate = formatDateLocal(nextRestock);

  return {
    drawer: coords.drawer,
    column: coords.column,
    compartmentLabel,
    cycleDays,
    dosesTaken,
    remainingDoses,
    isOutOfStock,
    isLowStock,
    lastRefilledDate: refillBaseline,
    nextRestockDate,
  };
}

/**
 * Generates user-facing notification content for restocking
 */
export function generateRestockNotificationMessage(status: ColumnStockStatus): {
  title: string;
  body: string;
} {
  if (status.isOutOfStock) {
    return {
      title: '📦 Medicine Restock Required',
      body: `Time to restock Column ${status.column} (${status.compartmentLabel}). You have completed your ${status.cycleDays}-day cycle.`,
    };
  }

  return {
    title: '⚠️ Low Medicine Stock',
    body: `Only ${status.remainingDoses} dose(s) left in Column ${status.column} (${status.compartmentLabel}). Please prepare to restock by ${status.nextRestockDate}.`,
  };
}

