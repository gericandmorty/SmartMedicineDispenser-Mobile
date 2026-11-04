import type {
  Reminder,
  HardwareStatus,
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
  const newSlots = newReminder.bulkSlots && newReminder.bulkSlots.length > 0
    ? newReminder.bulkSlots
    : (newReminder.slotIndex !== undefined ? [newReminder.slotIndex] : []);

  for (const existing of existingReminders) {
    // Ignore self when editing
    if (existing.id === newReminder.id) continue;

    const existingDate = existing.date || '';
    const datesOverlap = !newDate || !existingDate || newDate === existingDate;
    if (!datesOverlap) continue;

    const existingSlots = existing.bulkSlots && existing.bulkSlots.length > 0
      ? existing.bulkSlots
      : (existing.slotIndex !== undefined ? [existing.slotIndex] : []);

    // Check slot intersection
    const slotCollision = newSlots.length > 0 && existingSlots.length > 0 &&
      newSlots.some((s) => existingSlots.includes(s));

    // Check compartment collision
    const sameCompartment =
      newReminder.compartment &&
      existing.compartment &&
      newReminder.compartment.trim().toLowerCase() === existing.compartment.trim().toLowerCase();

    if (slotCollision || sameCompartment) {
      const slotDesc = newReminder.compartment || `Slot ${(newReminder.slotIndex ?? 0) + 1}`;
      return {
        hasConflict: true,
        reason: `A schedule already exists for ${slotDesc}. Each compartment holds one dose per schedule period.`,
      };
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


/** Resolve legacy label-only bulk reminders and keep both controllers on the same slots. */
export function resolveBulkSchedule(reminder: Pick<Reminder, 'compartment' | 'slotIndex' | 'bulkSlots' | 'bulkCompartments'>) {
  const drawer = /drawer\s*2/i.test(reminder.compartment ?? '') || (reminder.slotIndex ?? 0) >= 21 ? 2 : 1;
  const labels = reminder.bulkCompartments?.length
    ? reminder.bulkCompartments
    : reminder.compartment?.match(/[A-G][1-3]/gi) ?? [];
  const candidates = reminder.bulkSlots?.length ? reminder.bulkSlots : labels.length
    ? labels.map((label) => {
      const normalized = label.toUpperCase();
      return /^[A-G][1-3]$/.test(normalized)
        ? (drawer - 1) * 21 + (Number(normalized[1]) - 1) * 7 + normalized.charCodeAt(0) - 65
        : -1;
    })
    : reminder.slotIndex === undefined ? [] : [reminder.slotIndex];
  if (!candidates.length || candidates.some((slot) => !Number.isInteger(slot) || slot < 0 || slot >= 42)) {
    return null;
  }
  const slots = [...new Set(candidates)].sort((a, b) => a - b);
  const slotLabel = (slot: number) => `${String.fromCharCode(65 + slot % 7)}${Math.floor((slot % 21) / 7) + 1}`;
  const compartment = [1, 2].flatMap((d) => {
    const group = slots.filter((slot) => Math.floor(slot / 21) + 1 === d);
    return group.length ? [`Drawer ${d} (${group.map(slotLabel).join(', ')})`] : [];
  }).join('; ');
  return { slots, compartment, drawer: Math.floor(slots[0] / 21) + 1 };
}

export function matchesSchedulePicker(reminder: Reminder, hour: number, minute: number, amPm: AmPm, date?: string): boolean {
  return to24Hour(reminder.hour, reminder.amPm) === to24Hour(hour, amPm) &&
    reminder.minute === minute && (!reminder.date || reminder.date === date);
}

export function hardwareEventMatchesOccurrence(reminder: Reminder, event: DoseEvent, now = Date.now()): boolean {
  const occurrence = calculateDoseOccurrence(reminder, now);
  if (event.triggerDate !== occurrence.triggerDate) return false;
  const timestamp = event.targetTriggerEpoch > 0 ? event.targetTriggerEpoch * 1000
    : Date.parse(event.scheduledTimeFormatted.replace(' ', 'T'));
  if (!Number.isFinite(timestamp) || Math.floor(timestamp / 60000) !== Math.floor(occurrence.targetTriggerEpochMs / 60000)) return false;
  if (event.scheduleId === reminder.id) return true;
  const target = resolveBulkSchedule(reminder);
  const eventSlots = [...(event.compartment ?? '').matchAll(/Drawer\s*([12])\s*\(([^)]+)\)/gi)].flatMap((group) =>
    resolveBulkSchedule({ compartment: `Drawer ${group[1]} (${group[2]})` })?.slots ?? []);
  return !!target && target.slots.every((slot) => eventSlots.includes(slot));
}

/** A missing pickup event is not proof that a dose is still waiting. */
export function hardwareConfirmsActiveOccurrence(reminder: Reminder, status: HardwareStatus | null, now = Date.now()): boolean {
  const alert = status?.active_alert;
  if (status?.status !== 'online' || !alert?.is_alerting || !status.device_time ||
      !Number.isFinite(alert.elapsed_seconds) || alert.elapsed_seconds < 0) return false;
  const controllerNow = Date.parse(status.device_time.replace(' ', 'T'));
  const triggerMs = controllerNow - alert.elapsed_seconds * 1000;
  if (!Number.isFinite(triggerMs)) return false;
  const triggerDate = formatDateLocal(new Date(triggerMs));
  return hardwareEventMatchesOccurrence(reminder, {
    eventId: 'active-status', scheduleId: alert.schedule_id, compartment: alert.compartment,
    triggerDate, targetTriggerEpoch: triggerMs / 1000, scheduledTimeFormatted: '', resolution: 'TAKEN',
  }, now);
}

/** Live alarms use the phone clock; alarms due while away require controller confirmation. */
export function shouldPresentDoseAlert(
  reminder: Reminder,
  history: DoseEvent[],
  foregroundStartedAt: number,
  status: HardwareStatus | null,
  now = Date.now(),
): boolean {
  const occurrence = calculateDoseOccurrence(reminder, now, history);
  const savedAt = Date.parse(reminder.createdAt ?? '');
  // Minute-only schedules point at :00. A schedule saved at 01:25:10 for
  // 01:25 must still alert, even if this foreground session started at :05.
  const savedForCurrentMinute = Number.isFinite(savedAt) && savedAt >= foregroundStartedAt && savedAt <= now &&
    Math.floor(savedAt / 60000) === Math.floor(occurrence.targetTriggerEpochMs / 60000);
  return occurrence.state === 'ALERTING' &&
    (savedForCurrentMinute || occurrence.targetTriggerEpochMs >= foregroundStartedAt || hardwareConfirmsActiveOccurrence(reminder, status, now));
}
