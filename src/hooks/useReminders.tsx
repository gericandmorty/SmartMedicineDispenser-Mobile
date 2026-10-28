import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  startTransition,
  useMemo,
} from 'react';
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
  calculateDoseOccurrence,
  GRACE_PERIOD_MS,
  computeTargetTriggerEpoch,
} from '../services/medicationLogic';
import {
  scheduleReminderNotification,
  cancelReminderNotification,
  triggerImmediateMissedNotification,
} from '../services/notifications';
import {
  syncScheduleToESP32,
  deleteScheduleFromESP32,
  triggerHardwareAlert,
  silenceAlertOrConfirm,
  checkHardwareDoseResolved,
  autoDiscoverHardware,
} from '../services/hardware';
import MedicationAlertModal from '../components/MedicationAlertModal';

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

export interface RemindersContextType {
  reminders: Reminder[];
  doseHistory: DoseEvent[];
  loading: boolean;
  refresh: () => Promise<void>;
  flushSyncQueue: () => Promise<void>;
  add: (reminder: Reminder) => Promise<Reminder[]>;
  remove: (id: string) => Promise<void>;
  resolveDose: (reminder: Reminder, resolution: DoseResolution) => Promise<DoseEvent>;
  seedPhasedOut: () => Promise<void>;
  clearAll: () => Promise<void>;
  // Medication Alert Modal states
  activeAlertReminder: Reminder | null;
  alertModalVisible: boolean;
  confirmAlertDose: (reminder: Reminder) => Promise<void>;
  missAlertDose: (reminder: Reminder) => Promise<void>;
  dismissAlertModal: () => void;
  triggerManualTestAlert: (customReminder?: Reminder) => void;
}

const RemindersContext = createContext<RemindersContextType | null>(null);

export function RemindersProvider({ children }: { children: React.ReactNode }) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [doseHistory, setDoseHistory] = useState<DoseEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Active Alert Modal State
  const [activeAlertReminder, setActiveAlertReminder] = useState<Reminder | null>(null);
  const [alertModalVisible, setAlertModalVisible] = useState(false);

  const refresh = useCallback(async () => {
    const remData = await loadReminders();
    const histData = await loadDoseHistory();

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
      autoDiscoverHardware().catch(() => {});
    });
  }, [refresh, flushSyncQueue]);

  // Live watchdog: when scheduled time arrives, trigger hardware buzzer over Wi-Fi AND show flashing modal.
  // Also evaluates 20-minute window: if 20 mins have passed without intake, automatically marks dose as MISSED.
  useEffect(() => {
    if (reminders.length === 0) return;

    const alertedSet = new Set<string>();

    const interval = setInterval(() => {
      const now = new Date();
      const nowMs = now.getTime();
      const curHour = now.getHours();
      const curMin = now.getMinutes();
      const curSec = now.getSeconds();

      for (const r of reminders) {
        let rHour = r.hour;
        if (r.amPm === 'AM' && r.hour === 12) rHour = 0;
        else if (r.amPm === 'PM' && r.hour !== 12) rHour = r.hour + 12;

        const targetSec = r.second ?? 0;
        const secMatch = r.second === undefined || Math.abs(curSec - targetSec) <= 1;

        // 1. Scheduled alert trigger: exactly at alarm time
        if (rHour === curHour && r.minute === curMin && secMatch) {
          // Verify dose has not already been taken today
          const occ = calculateDoseOccurrence(r, nowMs, doseHistory);
          if (occ.state === 'TAKEN' || occ.state === 'TAKEN_MANUAL') {
            continue;
          }

          const key = `${r.id}-${now.toDateString()}-${curHour}:${curMin}:${targetSec}`;
          if (!alertedSet.has(key)) {
            alertedSet.add(key);
            const comp = r.compartment || 'Drawer 1 (A1)';
            const drawer = comp.includes('Drawer 2') ? 2 : 1;
            console.log(`[Watchdog] ⏰ Scheduled time hit for ${comp}! Triggering hardware alert & modal...`);

            triggerHardwareAlert(comp, drawer).catch(() => {});
            setActiveAlertReminder(r);
            setAlertModalVisible(true);
          }
        }

        // 2. 20-Minute Window Watchdog: If 20 mins passed, mark as MISSED in database & notify
        const occ = calculateDoseOccurrence(r, nowMs, doseHistory);
        if (occ.state === 'MISSED') {
          const alreadyLogged = doseHistory.some(
            (h) => h.scheduleId === r.id && h.triggerDate === occ.triggerDate
          );
          if (!alreadyLogged) {
            console.log(`[Watchdog] ⚠️ 20 minutes passed for schedule ${r.id}! Marking dosage as MISSED.`);
            recordDoseResolution(r, 'MISSED', occ.targetTriggerEpochMs + GRACE_PERIOD_MS)
              .then(async () => {
                const updatedHistory = await loadDoseHistory();
                startTransition(() => {
                  setDoseHistory(updatedHistory);
                });
                triggerImmediateMissedNotification(r.compartment || 'Dispenser').catch(() => {});
              })
              .catch(() => {});
          }
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [reminders, doseHistory]);

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
    const updatedHistory = await loadDoseHistory();
    const sorted = sortReminders(updated);
    startTransition(() => {
      setReminders(sorted);
      setDoseHistory(updatedHistory);
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

  // Active Alert Auto-Dismiss Watchdog:
  // When alertModalVisible is true, actively poll hardware (ESP32 and Arduino)
  // to detect when the medicine was taken and the drawer was pushed closed, and automatically dismiss the modal.
  useEffect(() => {
    if (!alertModalVisible || !activeAlertReminder) return;

    let isSubscribed = true;

    const pollHardwareForDoseIntake = async () => {
      if (!isSubscribed) return;

      try {
        // 1. Check local dose history: if already marked taken today, dismiss modal immediately
        const occ = calculateDoseOccurrence(activeAlertReminder, Date.now(), doseHistory);
        if (occ.state === 'TAKEN' || occ.state === 'TAKEN_MANUAL') {
          console.log(`[AlertWatchdog] Dose for ${activeAlertReminder.id} was taken. Closing modal.`);
          setAlertModalVisible(false);
          setActiveAlertReminder(null);
          return;
        }

        // 2. Query hardware controllers (ESP32 events & status, Arduino status)
        const hwResult = await checkHardwareDoseResolved(activeAlertReminder);
        if (!isSubscribed) return;

        if (hwResult.resolved) {
          console.log(
            `[AlertWatchdog] 💊 Medicine retrieved and drawer closed on hardware for ${activeAlertReminder.id}! Auto-dismissing modal.`
          );
          // Record dose resolution in local SQLite database
          await resolveDose(activeAlertReminder, hwResult.resolution || 'TAKEN');
          // Silence hardware alert buzzer & vibration if still active
          silenceAlertOrConfirm(activeAlertReminder.id).catch(() => {});
          // Auto-dismiss the alert modal immediately
          setAlertModalVisible(false);
          setActiveAlertReminder(null);
        }
      } catch (err) {
        // Ignore transient network errors during poll
      }
    };

    // Run immediate check then every 1.2 seconds while modal is up
    pollHardwareForDoseIntake();
    const interval = setInterval(pollHardwareForDoseIntake, 1200);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [alertModalVisible, activeAlertReminder, doseHistory, resolveDose]);

  const seedPhasedOut = useCallback(async () => {
    await seedPhasedOutMedicineData();
    await refresh();
  }, [refresh]);

  const clearAll = useCallback(async () => {
    await clearAllMedicineData();
    await refresh();
  }, [refresh]);

  // Modal actions
  const confirmAlertDose = useCallback(
    async (reminder: Reminder) => {
      await resolveDose(reminder, 'TAKEN');
      silenceAlertOrConfirm(reminder.id).catch(() => {});
      setAlertModalVisible(false);
      setActiveAlertReminder(null);
    },
    [resolveDose]
  );

  const missAlertDose = useCallback(
    async (reminder: Reminder) => {
      await resolveDose(reminder, 'MISSED');
      silenceAlertOrConfirm(reminder.id).catch(() => {});
      triggerImmediateMissedNotification(reminder.compartment || 'Dispenser').catch(() => {});
    },
    [resolveDose]
  );

  const dismissAlertModal = useCallback(() => {
    if (activeAlertReminder) {
      silenceAlertOrConfirm(activeAlertReminder.id).catch(() => {});
    }
    setAlertModalVisible(false);
    setActiveAlertReminder(null);
  }, [activeAlertReminder]);

  const triggerManualTestAlert = useCallback(
    (customReminder?: Reminder) => {
      const target =
        customReminder ||
        reminders[0] || {
          id: `test_${Date.now()}`,
          hour: 8,
          minute: 30,
          second: 0,
          amPm: 'AM',
          recurrence: 'every-day',
          compartment: 'Drawer 1 (A1)',
          slotIndex: 0,
        };

      const drawer = target.compartment?.includes('Drawer 2') ? 2 : 1;
      triggerHardwareAlert(target.compartment || 'Drawer 1 (A1)', drawer).catch(() => {});
      setActiveAlertReminder(target);
      setAlertModalVisible(true);
    },
    [reminders]
  );

  const value = useMemo(
    () => ({
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
      activeAlertReminder,
      alertModalVisible,
      confirmAlertDose,
      missAlertDose,
      dismissAlertModal,
      triggerManualTestAlert,
    }),
    [
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
      activeAlertReminder,
      alertModalVisible,
      confirmAlertDose,
      missAlertDose,
      dismissAlertModal,
      triggerManualTestAlert,
    ]
  );

  return (
    <RemindersContext.Provider value={value}>
      {children}
      {/* Root Flashing Medication Alert Modal */}
      <MedicationAlertModal
        visible={alertModalVisible}
        reminder={activeAlertReminder}
        onConfirmDose={confirmAlertDose}
        onMissedDose={missAlertDose}
        onDismiss={dismissAlertModal}
      />
    </RemindersContext.Provider>
  );
}

export function useReminders(): RemindersContextType {
  const context = useContext(RemindersContext);
  if (!context) {
    throw new Error('useReminders must be used within a RemindersProvider');
  }
  return context;
}

