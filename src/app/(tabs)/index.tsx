import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Animated,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useReminders } from '../../hooks/useReminders';
import ReminderCard from '../../components/ReminderCard';
import PrimaryButton from '../../components/PrimaryButton';
import DispenserView, { CompartmentScheduleParams } from '../../components/DispenserView';
import SetScheduleBottomSheet, { SetScheduleParams } from '../../components/SetScheduleBottomSheet';
import { Reminder } from '../../types/reminder';
import { calculateColumnStock } from '../../services/medicationLogic';
import { recordColumnRefill } from '../../services/storage';
import { setSolenoidLock } from '../../services/hardware';

const toastFade = new Animated.Value(0);
const toastTranslate = new Animated.Value(-30);

export default function HomeScreen() {
  const { reminders, doseHistory, loading, refresh, add, remove, seedPhasedOut } = useReminders();
  const [sheetVisible, setSheetVisible] = useState(false);
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
  }, [showToast]);

  const [tick, setTick] = useState(0);

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
    showToast(`Schedule set for ${timeFormatted}`);
  };

  const handleRefillColumn = useCallback(
    async (drawer: number, column: string) => {
      await recordColumnRefill(drawer, column);
      await refresh();
      showToast(`Drawer ${drawer} - Column ${column} refilled (7/7 doses)!`);
    },
    [refresh, showToast]
  );

  return (
    <SafeAreaView style={styles.safe}>
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
          reminders={reminders}
          doseHistory={doseHistory}
          onDeleteReminder={handleDelete}
          onOpenSetSchedule={handleOpenSheet}
          onRefillColumn={handleRefillColumn}
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
            <TouchableOpacity
              style={styles.demoSeedBtn}
              onPress={async () => {
                await seedPhasedOut();
                showToast('Inserted 0/7 doses demo into SQLite!');
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="flask-outline" size={15} color="#166534" style={{ marginRight: 6 }} />
              <Text style={styles.demoSeedText}>Insert 0/7 Doses Demo (SQLite)</Text>
            </TouchableOpacity>
          </View>
        ) : (
          reminders.map((r) => {
            const stock = calculateColumnStock(r, doseHistory);
            return (
              <ReminderCard
                key={r.id}
                reminder={r}
                stockStatus={stock}
                doseHistory={doseHistory}
                onDelete={handleDelete}
              />
            );
          })
        )}
      </ScrollView>

      {/* Bottom Action Footer */}
      <View style={styles.footer}>
        <PrimaryButton
          label="+ ADD ANOTHER TIME"
          onPress={() => handleOpenSheet(undefined)}
          color="#2E9E4B"
          style={styles.addBtn}
        />
      </View>

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
  demoSeedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 18,
  },
  demoSeedText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
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
    paddingHorizontal: 24,
    paddingBottom: 16,
    paddingTop: 12,
    backgroundColor: '#F5F0E8',
  },
  addBtn: { width: '100%', borderRadius: 16 },
});
