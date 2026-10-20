import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Alert,
  TouchableOpacity,
  Animated,
} from 'react-native';
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

const toastFade = new Animated.Value(0);
const toastTranslate = new Animated.Value(-30);

export default function HomeScreen() {
  const { reminders, doseHistory, loading, refresh, add, remove } = useReminders();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetParams, setSheetParams] = useState<SetScheduleParams | undefined>(undefined);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

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
    const timeFormatted = `${String(reminder.hour).padStart(2, '0')}:${String(reminder.minute).padStart(2, '0')} ${reminder.amPm}`;
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
          </View>
        ) : (
          reminders.map((r) => {
            const stock = calculateColumnStock(r, doseHistory);
            return (
              <ReminderCard
                key={r.id}
                reminder={r}
                stockStatus={stock}
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
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    paddingTop: 12,
    backgroundColor: '#F5F0E8',
  },
  addBtn: { width: '100%', borderRadius: 16 },
});
