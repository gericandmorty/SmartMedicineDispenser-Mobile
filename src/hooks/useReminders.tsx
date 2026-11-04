import { AppState } from 'react-native';
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  startTransition,
  useMemo,
  useRef,
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
  resolveBulkSchedule,
  validateScheduleConflict,
  hardwareEventMatchesOccurrence,
  shouldPresentDoseAlert,
} from '../services/medicationLogic';
import {
  scheduleReminderNotification,
  cancelReminderNotification,
  clearMedicineNotifications,
  reconcileMedicineNotifications,
  triggerImmediateMissedNotification,
} from '../services/notifications';
import {
  syncScheduleToESP32,
  deleteScheduleFromESP32,
  triggerHardwareAlert,
  silenceAlertOrConfirm,
  fetchHardwareEvents,
  fetchHardwareStatus,
  getESP32IP,
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
    await reconcileMedicineNotifications(remData);
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

  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [foregroundStartedAt, setForegroundStartedAt] = useState(() => Date.now());
  const foregroundGeneration = useRef(0);
  const presentedOccurrences = useRef(new Set<string>());
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      foregroundGeneration.current += 1;
      setForeground(state === 'active');
      // Never bring an old modal back before reconciling the controller.
      setAlertModalVisible(false);
      setActiveAlertReminder(null);
      if (state === 'active') {
        setForegroundStartedAt(Date.now());
        presentedOccurrences.current.clear();
      }
    });
    return () => subscription.remove();
  }, [presentedOccurrences]);

  // A live alarm must not wait for Wi-Fi requests or controller availability.
  useEffect(() => {
    if (!foreground || loading) return;
    const generation = foregroundGeneration.current;
    const tick = () => {
      if (AppState.currentState !== 'active' || generation !== foregroundGeneration.current) return;
      const now = Date.now();
      for (const reminder of reminders) {
        if (!shouldPresentDoseAlert(reminder, doseHistory, foregroundStartedAt, null, now)) continue;
        const occurrence = calculateDoseOccurrence(reminder, now, doseHistory);
        const key = `${reminder.id}:${occurrence.triggerDate}`;
        if (presentedOccurrences.current.has(key)) continue;
        presentedOccurrences.current.add(key);
        setActiveAlertReminder(reminder);
        setAlertModalVisible(true);
        break;
      }
    };
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [foreground, loading, reminders, doseHistory, foregroundStartedAt]);

  // Reconcile before presenting, including when no modal is currently visible.
  useEffect(() => {
    if (!foreground || loading) return;
    let cancelled = false;
    let busy = false;
    const poll = async () => {
      if (busy || cancelled || AppState.currentState !== 'active') return;
      busy = true;
      const generation = foregroundGeneration.current;
      const stale = () => cancelled || generation !== foregroundGeneration.current || AppState.currentState !== 'active';
      try {
        const stored = await loadReminders();
        let history = await loadDoseHistory();
        const controllerIP = await getESP32IP();
        const status = await fetchHardwareStatus(controllerIP);
        const hardwareEvents = await fetchHardwareEvents(controllerIP, 20);
        if (stale()) return;
        for (const reminder of stored) {
          if (stale()) return;
          const occurrence = calculateDoseOccurrence(reminder, Date.now(), history);
          if (occurrence.state !== 'ALERTING' && occurrence.state !== 'MISSED') continue;
          const hardware = hardwareEvents.find((event) => event.resolution === 'TAKEN' && hardwareEventMatchesOccurrence(reminder, event));
          if (stale()) return;
          const key = `${reminder.id}:${occurrence.triggerDate}`;
          if (hardware) {
            await recordDoseResolution(reminder, hardware.resolution, occurrence.targetTriggerEpochMs + (hardware.elapsedSeconds ?? 0) * 1000);
            history = await loadDoseHistory();
            if (stale()) return;
            setDoseHistory(history);
            setActiveAlertReminder((active) => {
              if (active?.id !== reminder.id) return active;
              return null;
            });
            presentedOccurrences.current.add(key);
          } else if (shouldPresentDoseAlert(reminder, history, foregroundStartedAt, status) && !presentedOccurrences.current.has(key)) {
            presentedOccurrences.current.add(key);
            setActiveAlertReminder(reminder);
            setAlertModalVisible(true);
          } else if (occurrence.state === 'MISSED' && !history.some((event) =>
            event.scheduleId === reminder.id && event.triggerDate === occurrence.triggerDate)) {
            await recordDoseResolution(reminder, 'MISSED', occurrence.targetTriggerEpochMs + GRACE_PERIOD_MS);
            history = await loadDoseHistory();
            if (stale()) return;
            setDoseHistory(history);
            triggerImmediateMissedNotification(reminder.compartment || 'Dispenser').catch(() => {});
          }
        }
      } catch (error) {
        console.warn('[DoseSync] Reconciliation failed:', error);
      } finally { busy = false; }
    };
    void poll();
    const interval = setInterval(() => { void poll(); }, 1200);
    return () => { cancelled = true; clearInterval(interval); };
  }, [foreground, loading, foregroundStartedAt, presentedOccurrences]);

  const add = useCallback(async (reminder: Reminder): Promise<Reminder[]> => {
    if (reminder.isBulk || reminder.compartment?.includes(',')) {
      const bulk = resolveBulkSchedule(reminder);
      if (!bulk) throw new Error('Select valid compartments.');
      reminder = { ...reminder, isBulk: true, bulkSlots: bulk.slots, compartment: bulk.compartment, slotIndex: bulk.slots[0] };
    }
    const conflict = validateScheduleConflict(reminder, await loadReminders());
    if (conflict.hasConflict) throw new Error(conflict.reason);
    // Validate and persist before scheduling an OS notification.
    const saved = await addReminder({ ...reminder, syncStatus: 'SYNC_PENDING' });
    // Publish immediately; an OS permission prompt must not block the in-app alarm.
    setReminders(sortReminders(saved));
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
    await cancelReminderNotification(target?.notificationId || id);
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

  const seedPhasedOut = useCallback(async () => {
    await seedPhasedOutMedicineData();
    await refresh();
  }, [refresh]);

  const clearAll = useCallback(async () => {
    await clearMedicineNotifications();
    const stored = await loadReminders();
    await Promise.all(stored.map((r) => deleteScheduleFromESP32(r.id)));
    setAlertModalVisible(false);
    setActiveAlertReminder(null);
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
        visible={foreground && alertModalVisible && activeAlertReminder !== null}
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

