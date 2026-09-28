export type AmPm = 'AM' | 'PM';

export interface Reminder {
  id: string;
  hour: number;      // 1-12
  minute: number;    // 0-59
  amPm: AmPm;
  recurrence: 'every-day';
  notificationId?: string;
  createdAt: string; // ISO string
}
