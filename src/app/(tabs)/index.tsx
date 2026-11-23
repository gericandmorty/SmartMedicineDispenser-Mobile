import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  TouchableOpacity,
  Animated,
  Switch,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useReminders } from '../../hooks/useReminders';
import ReminderCard from '../../components/ReminderCard';
import PrimaryButton from '../../components/PrimaryButton';
import DispenserView, { CompartmentScheduleParams } from '../../components/DispenserView';
import SetScheduleBottomSheet, { SetScheduleParams } from '../../components/SetScheduleBottomSheet';
import { AmPm, Reminder } from '../../types/reminder';
import { drawerNeedsRestock, resolveBulkSchedule } from '../../services/medicationLogic';
import { recordDrawerRestock } from '../../services/storage';
import { setSolenoidLock, fetchHardwareStatus } from '../../services/hardware';

const toastFade = new Animated.Value(0);
const toastTranslate = new Animated.Value(-30);

export default function HomeScreen() {
  const { reminders, doseHistory, restockTimes, drawers, missedDoseCount, openMissedReview, loading, refresh, add, remove } = useReminders();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [restockSaving, setRestockSaving] = useState(false);
  const [restockUnlocked, setRestockUnlocked] = useState(false);
  const [restockError, setRestockError] = useState('');
  const [restockDrawer, setRestockDrawer] = useState<1 | 2 | null>(null);
  const [editingRestockId, setEditingRestockId] = useState<string | null>(null);
  const [editHour, setEditHour] = useState('');
  const [editMinute, setEditMinute] = useState('');
  const [editAmPm, setEditAmPm] = useState<AmPm>('AM');
  const openRestock = (drawer: 1 | 2) => {
    if (loading || !drawerNeedsRestock(reminders, doseHistory, drawer, restockTimes[String(drawer)] ?? 0)) return;
    setRestockDrawer(drawer);
    setRestockError('');
    setRestockUnlocked(false);
    void setSolenoidLock(drawer, true, 'restock').then(setRestockUnlocked).catch(() => setRestockUnlocked(false));
  };
  const closeRestock = () => {
    if (restockSaving) return;
    if (restockDrawer !== null) void setSolenoidLock(restockDrawer, false).catch(() => {});
    setRestockDrawer(null);
    setEditingRestockId(null);
  };
  const saveRestockTime = async (reminder: Reminder) => {
    const hour = Number(editHour);
    const minute = Number(editMinute);
    if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
      setRestockError('Enter a valid time (hour 1–12, minute 0–59).');
      return;
    }
    setRestockSaving(true);
    try {
      await add({ ...reminder, hour, minute, amPm: editAmPm, quantity: 1, syncStatus: 'SYNC_PENDING' });
      setRestockError('');
      setEditingRestockId(null);
    } catch (error) {
      setRestockError(error instanceof Error ? error.message : 'Could not save the new time.');
    } finally { setRestockSaving(false); }
  };
  const restockItems = restockDrawer === null ? [] : [...new Map(reminders.flatMap(reminder =>
    (resolveBulkSchedule(reminder)?.slots ?? [])
      .filter(slot => Math.floor(slot / 21) + 1 === restockDrawer)
      .map(slot => [slot, `${String.fromCharCode(65 + slot % 7)}${Math.floor((slot % 21) / 7) + 1}`] as const)
  )).values()];
  const confirmDrawerRestock = async () => {
    if (restockDrawer === null || restockSaving || editingRestockId !== null || !drawers.every(drawer => drawer.state === 'closed')) return;
    setRestockSaving(true);
    const drawer = restockDrawer;
    try {
      const hardware = await fetchHardwareStatus();
      if (hardware?.drawer1_open !== false || hardware?.drawer2_open !== false || hardware.cabinet_close_required === true) {
        setRestockError('Both reed switches must report closed. Check both drawers and the dispenser connection.');
        return;
      }
      setRestockError('');
      const columns = [...new Set(reminders.flatMap(reminder =>
        (resolveBulkSchedule(reminder)?.slots ?? []).filter(slot => Math.floor(slot / 21) + 1 === drawer)
          .map(slot => String.fromCharCode(65 + slot % 7))))];
      await recordDrawerRestock(drawer, columns);
      await setSolenoidLock(drawer, false).catch(() => {});
      await refresh();
      setRestockDrawer(null);
      setEditingRestockId(null);
      showToast(`Drawer ${drawer} restocked. Saved cells are ready again.`);
    } finally { setRestockSaving(false); }
  };
  const [sheetParams, setSheetParams] = useState<SetScheduleParams | undefined>(undefined);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [solenoidOpen, setSolenoidOpen] = useState(false);

  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);

    Animated.parallel([
      Animated.timing(toastFade, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.spring(toastTranslate, {
        toValue: 0,
        tension: 80,
        friction: 9,
        useNativeDriver: true,
      }),
    ]).start();

    toastTimeoutRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastFade, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(toastTranslate, {
          toValue: -30,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setToastMessage(null);
      });
    }, 2800);
  }, []);

  const handleToggleSolenoid = useCallback(async (unlock: boolean) => {
    setSolenoidOpen(unlock);
    try {
      await setSolenoidLock(0, unlock);
      showToast(unlock ? '🔓 Solenoid Unlocked (Drawers Open)' : '🔒 Solenoid Locked');
    } catch {
      showToast('⚠️ Solenoid command sent');
    }
  }, [showToast, setSolenoidOpen]);

  const [, setTick] = useState(0);

  // Periodic 10-second tick to update countdown badges and missed states in real-time
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Reminder',
      'Are you sure you want to delete this reminder?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => remove(id) },
      ]
    );
  };

  const handleOpenSheet = (params?: CompartmentScheduleParams) => {
    setSheetParams(params);
    setSheetVisible(true);
  };

  const handleSaveSchedule = async (reminder: Reminder) => {
    await add(reminder);
    const timeFormatted = reminder.second !== undefined && reminder.second > 0
      ? `${String(reminder.hour).padStart(2, '0')}:${String(reminder.minute).padStart(2, '0')}:${String(reminder.second).padStart(2, '0')} ${reminder.amPm}`
      : `${String(reminder.hour).padStart(2, '0')}:${String(reminder.minute).padStart(2, '0')} ${reminder.amPm}`;
    if (reminder.isBulk) {
      showToast(`Bulk schedule set for ${timeFormatted}`);
    } else {
      showToast(`Schedule set for ${timeFormatted}`);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Toast Notification Banner */}
      {toastMessage && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              opacity: toastFade,
              transform: [{ translateY: toastTranslate }],
            },
          ]}
          pointerEvents="none"
        >
          <View style={styles.toastCard}>
            <Ionicons name="checkmark-circle" size={18} color="#76FF03" style={{ marginRight: 8 }} />
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        </Animated.View>
      )}

      {/* Screen Header */}
      <View style={styles.header}>
        <View style={styles.placeholder} />
        <Text style={styles.title}>My Schedule</Text>
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => router.push('/settings')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="settings-outline" size={22} color="#212121" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {missedDoseCount > 0 && (
          <TouchableOpacity style={styles.missedReviewButton} onPress={openMissedReview} accessibilityRole="button">
            <Ionicons name="alert-circle" size={20} color="#B42318" />
            <View style={{ flex: 1 }}>
              <Text style={styles.missedReviewTitle}>{missedDoseCount} missed dose{missedDoseCount === 1 ? '' : 's'} need review</Text>
              <Text style={styles.missedReviewSubtitle}>Tap to open the missed-dose cards</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#B42318" />
          </TouchableOpacity>
        )}
        {/* ── Solenoid Lock Quick Control Switch ── */}
        <View style={styles.solenoidQuickCard}>
          <View style={styles.solenoidQuickLeft}>
            <View
              style={[
                styles.solenoidQuickIconBox,
                solenoidOpen ? styles.solenoidQuickIconOpen : styles.solenoidQuickIconLocked,
              ]}
            >
              <Ionicons
                name={solenoidOpen ? 'lock-open' : 'lock-closed'}
                size={18}
                color={solenoidOpen ? '#D97706' : '#15803D'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.solenoidQuickRow}>
                <Text style={styles.solenoidQuickTitle}>Solenoid Lock</Text>
                <View
                  style={[
                    styles.solenoidQuickBadge,
                    solenoidOpen ? styles.badgeOpen : styles.badgeLocked,
                  ]}
                >
                  <Text
                    style={[
                      styles.solenoidQuickBadgeText,
                      solenoidOpen ? styles.badgeTextOpen : styles.badgeTextLocked,
                    ]}
                  >
                    {solenoidOpen ? 'UNLOCKED / OPEN' : 'LOCKED'}
                  </Text>
                </View>
              </View>
              <Text style={styles.solenoidQuickDesc}>
                {solenoidOpen
                  ? 'Drawers are energized & unlocked'
                  : 'Toggle switch to open drawer solenoids'}
              </Text>
            </View>
          </View>
          <Switch
            value={solenoidOpen}
            onValueChange={handleToggleSolenoid}
            trackColor={{ false: '#E0E0E0', true: '#FDE68A' }}
            thumbColor={solenoidOpen ? '#F59E0B' : '#9E9E9E'}
          />
        </View>

        {/* ── Dispenser compartment view ── */}
        <DispenserView
          restockTimes={restockTimes}
          reminders={reminders}
          doseHistory={doseHistory}
          onDeleteReminder={handleDelete}
          onOpenSetSchedule={handleOpenSheet}
          onOpenRestock={openRestock}
        />

        {/* ── Divider ── */}
        {reminders.length > 0 && (
          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerLabel}>SCHEDULED TIMES</Text>
            <View style={styles.divider} />
          </View>
        )}

        {/* ── Reminder list ── */}
        {!loading && reminders.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color="#BDBDBD" />
            <Text style={styles.emptyText}>No reminders yet.</Text>
            <Text style={styles.emptySubtext}>
              Tap a drawer above to preview compartments,{'\n'}then add a time below.
            </Text>
          </View>
        ) : (
          reminders.map((r) => (
            <ReminderCard key={r.id} reminder={r} doseHistory={doseHistory} onDelete={handleDelete} />
          ))
        )}
      </ScrollView>

      {/* Bottom Action Footer with Single & Bulk Schedule options */}
      <View style={styles.footer}>
        <View style={styles.footerBtnRow}>
          <TouchableOpacity
            style={styles.bulkBtn}
            onPress={() => handleOpenSheet({ isBulk: true })}
            activeOpacity={0.85}
          >
            <Ionicons name="layers-outline" size={17} color="#2E9E4B" style={{ marginRight: 6 }} />
            <Text style={styles.bulkBtnText}>+ BULK SCHEDULE</Text>
          </TouchableOpacity>
          <PrimaryButton
            label="+ ADD TIME"
            onPress={() => handleOpenSheet(undefined)}
            color="#2E9E4B"
            style={styles.addBtn}
          />
        </View>
      </View>

      <Modal visible={restockDrawer !== null} transparent animationType="fade" onRequestClose={closeRestock}>
        <View style={styles.restockOverlay}>
          <View style={styles.restockCard}>
            <View style={styles.restockTitleRow}>
              <Text style={styles.restockTitle}>All of the medicine is taken. Add stock now.</Text>
              <TouchableOpacity onPress={closeRestock} accessibilityLabel="Close restock modal"><Ionicons name="close" size={22} color="#374151" /></TouchableOpacity>
            </View>
            <Text style={styles.restockBody}>{restockUnlocked ? `Drawer ${restockDrawer} is unlocked. Pull it open and refill the saved compartments, then confirm below.` : `Unlocking Drawer ${restockDrawer}. If it stays locked, check the dispenser connection before refilling.`}</Text>
            <View style={styles.restockGrid}>
              {[1, 2, 3].map(row => (
                <View key={row} style={styles.restockGridRow}>
                  {'ABCDEFG'.split('').map(col => (
                    <View key={`${col}${row}`} style={[styles.restockCell, restockItems.includes(`${col}${row}`) && styles.restockCellNeeded]}>
                      <Text style={styles.restockCellText}>{col}{row}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
            <Text style={styles.restockSummaryTitle}>Medicine to replenish ({restockItems.length} saved cells)</Text>
            <ScrollView style={styles.restockList}>
              {reminders.filter(reminder => (resolveBulkSchedule(reminder)?.slots ?? [])
                .some(slot => Math.floor(slot / 21) + 1 === restockDrawer)).map(reminder => {
                const slots = (resolveBulkSchedule(reminder)?.slots ?? []).filter(slot => Math.floor(slot / 21) + 1 === restockDrawer);
                const labels = slots.map(slot => `${String.fromCharCode(65 + slot % 7)}${Math.floor((slot % 21) / 7) + 1}`);
                return <View key={reminder.id} style={styles.restockMedicineRow}>
                  <Text style={styles.restockItem}>{labels.join(', ')} · {reminder.hour}:{String(reminder.minute).padStart(2, '0')} {reminder.amPm}</Text>
                  {editingRestockId === reminder.id ? (
                    <View style={styles.restockEditRow}>
                      <TextInput style={styles.restockTimeInput} value={editHour} onChangeText={setEditHour} keyboardType="number-pad" maxLength={2} accessibilityLabel="Hour" />
                      <Text>:</Text>
                      <TextInput style={styles.restockTimeInput} value={editMinute} onChangeText={setEditMinute} keyboardType="number-pad" maxLength={2} accessibilityLabel="Minute" />
                      <TouchableOpacity onPress={() => setEditAmPm(editAmPm === 'AM' ? 'PM' : 'AM')}><Text style={styles.restockEditButton}>{editAmPm}</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => { void saveRestockTime(reminder); }} disabled={restockSaving}><Text style={styles.restockEditButton}>Save</Text></TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={() => { setEditingRestockId(reminder.id); setEditHour(String(reminder.hour)); setEditMinute(String(reminder.minute).padStart(2, '0')); setEditAmPm(reminder.amPm); }}>
                      <Text style={styles.restockEditButton}>Edit time</Text>
                    </TouchableOpacity>
                  )}
                </View>;
              })}
            </ScrollView>
            <Text style={styles.restockCloseNote}>
              {drawers.every(drawer => drawer.state === 'closed')
                ? 'Drawer closed and detected. You can confirm the refill.'
                : 'Close both drawers fully to enable Okay.'}
            </Text>
            {restockError ? <Text style={styles.restockError}>{restockError}</Text> : null}
            <TouchableOpacity style={[styles.restockButton, (restockSaving || !!editingRestockId || !restockDrawer || !drawers.every(drawer => drawer.state === 'closed')) && styles.restockButtonDisabled]}
              onPress={() => { void confirmDrawerRestock(); }}
              disabled={restockSaving || !!editingRestockId || !restockDrawer || !drawers.every(drawer => drawer.state === 'closed')}>
              <Text style={styles.restockButtonText}>{restockSaving ? 'Refreshing…' : 'Okay — stock added'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Half-Screen Modal Bottom Sheet */}
      <SetScheduleBottomSheet
        visible={sheetVisible}
        initialParams={sheetParams}
        onClose={() => setSheetVisible(false)}
        onSave={handleSaveSchedule}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  restockOverlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.65)' },
  restockCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 24 },
  restockTitle: { fontSize: 22, fontWeight: '800', color: '#166534', marginBottom: 12 },
  restockBody: { fontSize: 16, color: '#374151', lineHeight: 24, marginBottom: 20 },
  restockTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  restockMedicineRow: { paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  restockEditRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6 },
  restockTimeInput: { borderWidth: 1, borderColor: '#9CA3AF', borderRadius: 6, width: 40, padding: 5, textAlign: 'center' },
  restockEditButton: { color: '#166534', fontWeight: '700', padding: 5 },
  restockGrid: { gap: 5, marginBottom: 14 },
  restockGridRow: { flexDirection: 'row', gap: 5 },
  restockCell: { flex: 1, height: 33, alignItems: 'center', justifyContent: 'center', backgroundColor: '#6B7280', borderRadius: 5 },
  restockCellNeeded: { backgroundColor: '#F59E0B', borderWidth: 2, borderColor: '#92400E' },
  restockCellText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  restockSummaryTitle: { fontSize: 14, fontWeight: '700', color: '#166534', marginBottom: 8 },
  restockList: { maxHeight: 190, marginBottom: 14 },
  restockItem: { color: '#374151', fontSize: 14, paddingVertical: 3 },
  restockCloseNote: { color: '#92400E', fontSize: 13, marginBottom: 12 },
  restockError: { color: '#B91C1C', fontSize: 13, marginBottom: 10 },
  restockButtonDisabled: { backgroundColor: '#9CA3AF' },
  restockButton: { backgroundColor: '#2E9E4B', padding: 14, borderRadius: 12, alignItems: 'center' },
  restockButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  missedReviewButton: {
    backgroundColor: '#FFF0EB', borderColor: '#F1B8AC', borderWidth: 1,
    borderRadius: 15, padding: 14, marginBottom: 16,
    flexDirection: 'row', alignItems: 'center', gap: 11,
  },
  missedReviewTitle: { color: '#8F2B22', fontSize: 14, fontWeight: '800' },
  missedReviewSubtitle: { color: '#A9685F', fontSize: 12, marginTop: 2 },
  safe: { flex: 1, backgroundColor: '#F5F0E8' },
  toastContainer: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    zIndex: 999,
    alignItems: 'center',
  },
  toastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  placeholder: { width: 32 },
  settingsBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#212121',
    letterSpacing: 0.2,
  },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    marginTop: 4,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#D7CFC4',
  },
  dividerLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9E9E9E',
    letterSpacing: 1,
    marginHorizontal: 10,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 20,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#424242',
    marginTop: 14,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#9E9E9E',
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
  solenoidQuickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E8E1D5',
  },
  solenoidQuickLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  solenoidQuickIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  solenoidQuickIconOpen: {
    backgroundColor: '#FEF3C7',
  },
  solenoidQuickIconLocked: {
    backgroundColor: '#DCFCE7',
  },
  solenoidQuickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  solenoidQuickTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#212121',
  },
  solenoidQuickBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeOpen: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  badgeLocked: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  solenoidQuickBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  badgeTextOpen: {
    color: '#92400E',
  },
  badgeTextLocked: {
    color: '#15803D',
  },
  solenoidQuickDesc: {
    fontSize: 11,
    color: '#757575',
    marginTop: 2,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 12,
    backgroundColor: '#F5F0E8',
  },
  footerBtnRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  bulkBtn: {
    flex: 1,
    minHeight: 48,
    minWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 7,
    borderRadius: 14,
    backgroundColor: '#EAF7EE',
    borderWidth: 1.5,
    borderColor: '#2E9E4B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkBtnText: {
    flexShrink: 1,
    textAlign: 'center',
    color: '#166534',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  addBtn: {
    flex: 1,
    minHeight: 48,
    height: undefined,
    borderRadius: 14,
  },
});
