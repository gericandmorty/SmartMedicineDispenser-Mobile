export type AmPm = 'AM' | 'PM';

export type ScheduleConfigState = 'ACTIVE' | 'SYNC_PENDING' | 'INACTIVE';

export type DoseOccurrenceState =
  | 'UPCOMING'
  | 'ALERTING'
  | 'TAKEN'
  | 'TAKEN_MANUAL'
  | 'MISSED';

export type DoseResolution = 'TAKEN' | 'TAKEN_MANUAL' | 'MISSED';

export interface Reminder {
  id: string;
  hour: number;      // 1-12
  minute: number;    // 0-59
  second?: number;   // 0-59
  amPm: AmPm;
  recurrence: 'every-day' | 'once';
  date?: string;     // YYYY-MM-DD
  notificationId?: string;
  createdAt: string; // ISO string
  compartment?: string; // e.g. "Drawer 1 (A1)"
  slotIndex?: number;   // 0-41
  syncStatus?: ScheduleConfigState; // default ACTIVE or SYNC_PENDING
}

export interface DoseEvent {
  eventId: string;
  scheduleId: string;
  compartment?: string;
  slotIndex?: number;
  triggerDate: string; // "YYYY-MM-DD"
  scheduledTimeFormatted: string; // e.g. "11:00 AM"
  targetTriggerEpoch: number; // in seconds
  resolvedAtEpoch?: number;   // in seconds
  resolution: DoseResolution;
  elapsedSeconds?: number;
}

export interface HardwareAlertState {
  is_alerting: boolean;
  schedule_id: string;
  compartment: string;
  slot_index: number;
  relay_num: number;
  elapsed_seconds: number;
  remaining_seconds: number;
}

export interface HardwareStatus {
  status: 'online' | 'offline';
  device?: string;
  ip?: string;
  time?: string;
  schedules_count?: number;
  is_vibrating?: boolean;
  active_alert?: HardwareAlertState;
}

export interface ColumnStockStatus {
  drawer: number;
  column: string;            // 'A' - 'G'
  compartmentLabel: string;  // e.g. "Drawer 1 (Column A)"
  cycleDays: number;         // e.g. 7 days for weekly cycle
  dosesTaken: number;        // doses consumed in current cycle
  remainingDoses: number;    // doses remaining before refill
  isOutOfStock: boolean;     // remainingDoses <= 0
  isLowStock: boolean;       // remainingDoses <= 2 && remainingDoses > 0
  lastRefilledDate: string;  // "YYYY-MM-DD"
  nextRestockDate: string;   // "YYYY-MM-DD"
}

