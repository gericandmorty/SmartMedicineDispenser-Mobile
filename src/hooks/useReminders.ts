import { useState, useEffect, useCallback, startTransition } from 'react';
import { Reminder, DoseEvent, DoseResolution } from '../types/reminder';
import {
  loadReminders,
  addReminder,
  deleteReminder,
  markReminderSyncStatus,
  getPendingSyncReminders,
  loadDoseHistory,
  recordDoseResolution,
  seedPhasedOutMedicineData,
  clearAllMedicineData,
} from '../services/storage';
import {
  scheduleReminderNotification,
  cancelReminderNotification,
} from '../services/notifications';
import {
  syncScheduleToESP32,
  deleteScheduleFromESP32,
  triggerHardwareAlert,
} from '../services/hardware';

function sortReminders(data: Reminder[]): Reminder[] {
  return [...data].sort((a, b) => {
    // If both have specific dates, sort by date first
    if (a.date && b.date && a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
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
  const [doseHistory, setDoseHistory] = useState<DoseEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    let remData = await loadReminders();
    let histData = await loadDoseHistory();

    // Auto-seed 0/7 doses phased out data on initial fresh start
    if (remData.length === 0 && histData.length === 0) {
      await seedPhasedOutMedicineData();
      remData = await loadReminders();
      histData = await loadDoseHistory();
    }

    const sorted = sortReminders(remData);
    startTransition(() => {
      setReminders(sorted);
      setDoseHistory(histData);
      setLoading(false);
    });
  }, []);

  // Flush any pending sync queue when Wi-Fi reconnects or on refresh
  const flushSyncQueue = useCallback(async () => {
    const pending = await getPendingSyncReminders();
    if (pending.length === 0) return;

    for (const item of pending) {
      const ok = await syncScheduleToESP32(item);
      if (ok) {
        await markReminderSyncStatus(item.id, 'ACTIVE');
      }
    }
    const latest = await loadReminders();
    startTransition(() => {
      setReminders(sortReminders(latest));
    });
  }, []);

  useEffect(() => {
    refresh().then(() => {
      flushSyncQueue().catch(() => {});
    });
  }, [refresh, flushSyncQueue]);

  // Live watchdog: when scheduled time arrives on phone, trigger hardware buzzer over Wi-Fi
  useEffect(() => {
    if (reminders.length === 0) return;

    const alertedSet = new Set<string>();

    const interval = setInterval(() => {
      const now = new Date();
      const curHour = now.getHours();
      const curMin = now.getMinutes();
      const curSec = now.getSeconds();

      for (const r of reminders) {
        let rHour = r.hour;
        if (r.amPm === 'AM' && r.hour === 12) rHour = 0;
        else if (r.amPm === 'PM' && r.hour !== 12) rHour = r.hour + 12;

        const targetSec = r.second ?? 0;
        const secMatch = r.second === undefined || Math.abs(curSec - targetSec) <= 1;

        if (rHour === curHour && r.minute === curMin && secMatch) {
          const key = `${r.id}-${now.toDateString()}-${curHour}:${curMin}:${targetSec}`;
          if (!alertedSet.has(key)) {
            alertedSet.add(key);
            const comp = r.compartment || 'Drawer 1 (A1)';
            const drawer = comp.includes('Drawer 2') ? 2 : 1;
            console.log(`[Watchdog] ⏰ Scheduled time hit for ${comp}! Triggering hardware buzzer...`);
            triggerHardwareAlert(comp, drawer).catch(() => {});
          }
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [reminders]);

  const add = useCallback(async (reminder: Reminder): Promise<Reminder[]> => {
    const notificationId = await scheduleReminderNotification(reminder);
    const withNotif: Reminder = notificationId
      ? { ...reminder, notificationId, syncStatus: 'SYNC_PENDING' }
      : { ...reminder, syncStatus: 'SYNC_PENDING' };

    const updated = await addReminder(withNotif);
    const sorted = sortReminders(updated);
    startTransition(() => {
      setReminders(sorted);
    });

    // Attempt immediate Wi-Fi sync to ESP32 Mini
    syncScheduleToESP32(withNotif)
      .then(async (success) => {
        if (success) {
          const synced = await markReminderSyncStatus(withNotif.id, 'ACTIVE');
          startTransition(() => {
            setReminders(sortReminders(synced));
          });
        }
      })
      .catch((e) => {
        console.log('[useReminders] ESP32 Wi-Fi sync offline, queued:', e);
      });

    return updated;
  }, []);

  const remove = useCallback(async (id: string): Promise<void> => {
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

    // Remove schedule from ESP32 Mini over Wi-Fi
    deleteScheduleFromESP32(id).catch((e) => {
      console.log('[useReminders] ESP32 Wi-Fi delete error:', e);
    });
  }, []);

  const resolveDose = useCallback(
    async (reminder: Reminder, resolution: DoseResolution): Promise<DoseEvent> => {
      const event = await recordDoseResolution(reminder, resolution);
      const updatedHistory = await loadDoseHistory();
      startTransition(() => {
        setDoseHistory(updatedHistory);
      });
      return event;
    },
    []
  );

  const seedPhasedOut = useCallback(async () => {
    await seedPhasedOutMedicineData();
    await refresh();
  }, [refresh]);

  const clearAll = useCallback(async () => {
    await clearAllMedicineData();
    await refresh();
  }, [refresh]);

  return {
    reminders,
    doseHistory,
    loading,
    refresh,
    flushSyncQueue,
    add,
    remove,
    resolveDose,
    seedPhasedOut,
    clearAll,
  };
}
