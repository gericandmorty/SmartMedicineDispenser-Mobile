import { useState, useEffect, useCallback, startTransition } from 'react';
import { Reminder } from '../types/reminder';
import { loadReminders, addReminder, deleteReminder } from '../services/storage';
import {
  scheduleReminderNotification,
  cancelReminderNotification,
} from '../services/notifications';

function sortReminders(data: Reminder[]): Reminder[] {
  return [...data].sort((a, b) => {
    const toMins = (r: Reminder) => {
      let h = r.hour;
      if (r.amPm === 'AM' && r.hour === 12) h = 0;
      if (r.amPm === 'PM' && r.hour !== 12) h = r.hour + 12;
      return h * 60 + r.minute;
    };
    return toMins(a) - toMins(b);
  });
}

export function useReminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await loadReminders();
    const sorted = sortReminders(data);
    startTransition(() => {
      setReminders(sorted);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = useCallback(async (reminder: Reminder): Promise<Reminder[]> => {
    const notificationId = await scheduleReminderNotification(reminder);
    const withNotif: Reminder = notificationId
      ? { ...reminder, notificationId }
      : reminder;
    const updated = await addReminder(withNotif);
    const sorted = sortReminders(updated);
    startTransition(() => {
      setReminders(sorted);
    });
    return updated;
  }, []);

  const remove = useCallback(async (id: string): Promise<void> => {
    // Read from storage directly to avoid stale closure
    const current = await loadReminders();
    const target = current.find((r) => r.id === id);
    if (target?.notificationId) {
      await cancelReminderNotification(target.notificationId);
    }
    const updated = await deleteReminder(id);
    const sorted = sortReminders(updated);
    startTransition(() => {
      setReminders(sorted);
    });
  }, []);

  return { reminders, loading, refresh, add, remove };
}
