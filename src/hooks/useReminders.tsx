import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  isDoseSuperseded,
  selectVisibleMissedDoses,
  completedDrawer,
  formatDateLocal,
} from '../services/medicationLogic';
import {
  scheduleReminderNotification,
  cancelReminderNotification,
  clearMedicineNotifications,
  reconcileMedicineNotifications,
  suspendScheduledMedicineNotifications,
  triggerImmediateMissedNotification,
  triggerDrawerCompleteNotification,
} from '../services/notifications';
import {
  syncScheduleToESP32,
  deleteScheduleFromESP32,
  triggerHardwareAlert,
  silenceAlertOrConfirm,
  fetchHardwareEvents,
  fetchHardwareStatus,
  getArduinoIP,
  getESP32IP,
  autoDiscoverHardware,
} from '../services/hardware';
import { enqueueDose, removeDose, selectDose } from '../services/alertQueue';
import { useDrawerStatus } from './useDrawerStatus';
import DrawerStatusBanner from '../components/DrawerStatusBanner';
import MedicationAlertModal from '../components/MedicationAlertModal';
import CloseCabinetModal from '../components/CloseCabinetModal';

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
  drawers: ReturnType<typeof useDrawerStatus>;
  reminders: Reminder[];
  doseHistory: DoseEvent[];
  missedDoseCount: number;
  openMissedReview: () => void;
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
const MISSED_ACK_STORAGE_KEY = 'smart_medicine_missed_acknowledgements';
const missedKey = (event: DoseEvent) => `${event.scheduleId}:${event.triggerDate}`;
function parseAcknowledgedMissed(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function RemindersProvider({ children }: { children: React.ReactNode }) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [doseHistory, setDoseHistory] = useState<DoseEvent[]>([]);
  const [acknowledgedMissedKeys, setAcknowledgedMissedKeys] = useState<string[]>([]);
  const acknowledgedMissedRef = useRef<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Active Alert Modal State
  const [alertQueue, setAlertQueue] = useState<Reminder[]>([]);
  const [missedModalDismissed, setMissedModalDismissed] = useState(false);
  const activeAlertReminder = alertQueue[0] ?? null;
  const enqueueAlert = useCallback((reminder: Reminder) => {
    setAlertQueue((queue) => enqueueDose(queue, reminder));
  }, []);
  const removeAlert = useCallback((id: string) => {
    setAlertQueue((queue) => queue.some((item) => item.id === id) ? removeDose(queue, id) : queue);
  }, []);
  const [alertModalVisible, setAlertModalVisible] = useState(false);

  const refresh = useCallback(async () => {
    const [remData, histData, savedAcknowledgements] = await Promise.all([
      loadReminders(), loadDoseHistory(), AsyncStorage.getItem(MISSED_ACK_STORAGE_KEY),
    ]);

    const sorted = sortReminders(remData);
    const parsedAcknowledgements = parseAcknowledgedMissed(savedAcknowledgements);
    acknowledgedMissedRef.current = parsedAcknowledgements;
    startTransition(() => {
      setReminders(sorted);
      setDoseHistory(histData);
      setAcknowledgedMissedKeys(parsedAcknowledgements);
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
  const drawers = useDrawerStatus(foreground);
  const [foregroundStartedAt, setForegroundStartedAt] = useState(() => Date.now());
  const [visibleNowEpoch, setVisibleNowEpoch] = useState(() => Date.now());
  const missedDoseEvents = selectVisibleMissedDoses(reminders, doseHistory, acknowledgedMissedKeys, visibleNowEpoch);
  useEffect(() => {
    if (missedDoseEvents.length) void suspendScheduledMedicineNotifications(reminders).catch(() => {});
  }, [missedDoseEvents.length, reminders]);
  const openMissedReview = useCallback(() => setMissedModalDismissed(false), []);
  const acknowledgeMissedDose = useCallback((event: DoseEvent) => {
    const key = missedKey(event);
    const next = [...new Set([...acknowledgedMissedRef.current, key])];
    acknowledgedMissedRef.current = next;
    setAcknowledgedMissedKeys(next);
    void AsyncStorage.setItem(MISSED_ACK_STORAGE_KEY, JSON.stringify(next));
    // Only the last reviewed missed dose may release the Arduino's alarm latch.
    const remaining = selectVisibleMissedDoses(reminders, doseHistory, next, Date.now());
    if (remaining.length === 0) {
      void getArduinoIP().then(ip => fetch(`http://${ip}/ack-missed`)).catch(() => {});
      void reconcileMedicineNotifications(reminders).catch(() => {});
    }
  }, [reminders, doseHistory]);
  const foregroundGeneration = useRef(0);
  const presentedOccurrences = useRef(new Set<string>());
  const completedDrawersNotified = useRef(new Set<string>());
  useEffect(() => {
    if (!foreground || loading) return;
    const date = formatDateLocal(new Date());
    for (const drawer of [1, 2] as const) {
      const key = `${date}:${drawer}`;
      if (completedDrawersNotified.current.has(key) || !completedDrawer(reminders, doseHistory, drawer)) continue;
      completedDrawersNotified.current.add(key);
      void triggerDrawerCompleteNotification(drawer).catch(() => {});
    }
  }, [foreground, loading, reminders, doseHistory]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      foregroundGeneration.current += 1;
      setForeground(state === 'active');
      // Never bring an old modal back before reconciling the controller.
      setAlertModalVisible(false);
      setAlertQueue([]);
      if (state === 'active') {
        setForegroundStartedAt(Date.now());
        setVisibleNowEpoch(Date.now());
        setMissedModalDismissed(false);
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
        if (isDoseSuperseded(reminder, reminders, now)) {
          removeAlert(reminder.id);
          continue;
        }
        if (!shouldPresentDoseAlert(reminder, doseHistory, foregroundStartedAt, null, now)) continue;
        const occurrence = calculateDoseOccurrence(reminder, now, doseHistory);
        const key = `${reminder.id}:${occurrence.triggerDate}`;
        if (presentedOccurrences.current.has(key)) continue;
        presentedOccurrences.current.add(key);
        setVisibleNowEpoch(now);
        setMissedModalDismissed(false);
        enqueueAlert(reminder);
        setAlertModalVisible(true);
      }
    };
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [foreground, loading, reminders, doseHistory, foregroundStartedAt, enqueueAlert, removeAlert]);

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
          const hardware = hardwareEvents.find((event) => event.resolution === 'TAKEN' && hardwareEventMatchesOccurrence(reminder, event))
            ?? hardwareEvents.find((event) => event.resolution === 'MISSED' && hardwareEventMatchesOccurrence(reminder, event));
          if (stale()) return;
          const key = `${reminder.id}:${occurrence.triggerDate}`;
          const existing = history.find((event) => event.scheduleId === reminder.id && event.triggerDate === occurrence.triggerDate);
          if (hardware && existing?.resolution === hardware.resolution) {
            removeAlert(reminder.id);
            presentedOccurrences.current.add(key);
          } else if (hardware) {
            await recordDoseResolution(reminder, hardware.resolution, occurrence.targetTriggerEpochMs + (hardware.elapsedSeconds ?? 0) * 1000);
            history = await loadDoseHistory();
            if (stale()) return;
            setDoseHistory(history);
            removeAlert(reminder.id);
            presentedOccurrences.current.add(key);
            if (hardware.resolution === 'MISSED') {
              setMissedModalDismissed(false);
              void suspendScheduledMedicineNotifications(stored).catch(() => {});
            triggerImmediateMissedNotification(reminder.compartment || 'Dispenser').catch(() => {});
            }
          } else if (isDoseSuperseded(reminder, stored, Date.now()) && !history.some((event) =>
            event.scheduleId === reminder.id && event.triggerDate === occurrence.triggerDate)) {
            removeAlert(reminder.id);
            presentedOccurrences.current.add(key);
            const nextDue = Math.min(...stored.filter((item) => item.id !== reminder.id && item.syncStatus !== 'INACTIVE')
              .map((item) => calculateDoseOccurrence(item, Date.now()).targetTriggerEpochMs)
              .filter((time) => time > occurrence.targetTriggerEpochMs && time <= Date.now()));
            await recordDoseResolution(reminder, 'MISSED', nextDue);
            history = await loadDoseHistory();
            if (stale()) return;
            setDoseHistory(history);
            setMissedModalDismissed(false);
            void suspendScheduledMedicineNotifications(stored).catch(() => {});
            triggerImmediateMissedNotification(reminder.compartment || 'Dispenser').catch(() => {});
          } else if (!isDoseSuperseded(reminder, stored, Date.now()) && selectVisibleMissedDoses(stored, history, acknowledgedMissedRef.current, Date.now()).length === 0 && shouldPresentDoseAlert(reminder, history, foregroundStartedAt, status) && !presentedOccurrences.current.has(key)) {
            presentedOccurrences.current.add(key);
            enqueueAlert(reminder);
            setAlertModalVisible(true);
          } else if (occurrence.state === 'MISSED' && !history.some((event) =>
            event.scheduleId === reminder.id && event.triggerDate === occurrence.triggerDate)) {
            removeAlert(reminder.id);
            await recordDoseResolution(reminder, 'MISSED', occurrence.targetTriggerEpochMs + GRACE_PERIOD_MS);
            history = await loadDoseHistory();
            if (stale()) return;
            setDoseHistory(history);
            setMissedModalDismissed(false);
            void suspendScheduledMedicineNotifications(stored).catch(() => {});
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
  }, [foreground, loading, foregroundStartedAt, presentedOccurrences, enqueueAlert, removeAlert]);

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
    removeAlert(id);
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
  }, [removeAlert]);

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
    setAlertQueue([]);
    setMissedModalDismissed(true);
    await clearAllMedicineData();
    await AsyncStorage.removeItem(MISSED_ACK_STORAGE_KEY).catch(() => {});
    acknowledgedMissedRef.current = [];
    setAcknowledgedMissedKeys([]);
    presentedOccurrences.current.clear();
    completedDrawersNotified.current.clear();
    await refresh();
    if ((await loadReminders()).length > 0) {
      throw new Error('Some schedules are still saved on this phone. Please try again.');
    }
  }, [refresh]);

  // Modal actions
  const confirmAlertDose = useCallback(
    async (reminder: Reminder) => {
      await resolveDose(reminder, 'TAKEN_MANUAL');
      removeAlert(reminder.id);
      // Current firmware treats /stop-vibrate as a global confirmation even
      // when schedule_id is supplied. Never clear another pending dose.
      const [stored, history] = await Promise.all([loadReminders(), loadDoseHistory()]);
      const anotherDosePending = stored.some((item) => item.id !== reminder.id &&
        calculateDoseOccurrence(item, Date.now(), history).state === 'ALERTING');
      if (!anotherDosePending) silenceAlertOrConfirm(reminder.id).catch(() => {});
    },
    [resolveDose, removeAlert]
  );

  const missAlertDose = useCallback(
    async (reminder: Reminder) => {
      await resolveDose(reminder, 'MISSED');
      removeAlert(reminder.id);
      void suspendScheduledMedicineNotifications(reminders).catch(() => {});
      triggerImmediateMissedNotification(reminder.compartment || 'Dispenser').catch(() => {});
    },
    [resolveDose, removeAlert, reminders]
  );

  const dismissAlertModal = useCallback(() => {
    // Dismissal is not intake confirmation; preserve other pending doses.
    if (activeAlertReminder) removeAlert(activeAlertReminder.id);
    else setMissedModalDismissed(true);
  }, [activeAlertReminder, removeAlert]);

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
      enqueueAlert(target);
      setAlertModalVisible(true);
    },
    [reminders, enqueueAlert]
  );

  const value = useMemo(
    () => ({
      drawers,
      reminders,
      doseHistory,
      missedDoseCount: missedDoseEvents.length,
      openMissedReview,
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
      drawers,
      reminders,
      doseHistory,
      missedDoseEvents.length,
      openMissedReview,
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
        key={activeAlertReminder?.id ?? 'no-alert'}
        drawerStatus={<DrawerStatusBanner drawers={drawers} />}
        pendingReminders={alertQueue}
        missedDoseEvents={missedDoseEvents}
        onAcknowledgeMissed={acknowledgeMissedDose}
        onSelectReminder={(id) => setAlertQueue((queue) => selectDose(queue, id))}
        visible={foreground && !drawers.some(drawer => drawer.closureRequired) && ((alertModalVisible && activeAlertReminder !== null) || (!missedModalDismissed && missedDoseEvents.length > 0))}
        reminder={activeAlertReminder}
        onConfirmDose={confirmAlertDose}
        onDismiss={dismissAlertModal}
      />
      <CloseCabinetModal visible={foreground && drawers.some(drawer => drawer.closureRequired)} />
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

