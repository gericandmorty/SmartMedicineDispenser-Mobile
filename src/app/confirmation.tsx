import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Animated,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import PrimaryButton from '../components/PrimaryButton';
import { useReminders } from '../hooks/useReminders';
import { AmPm, Reminder } from '../types/reminder';

// Create animated values outside component to avoid .current access during render
const scaleAnim = new Animated.Value(0.8);
const opacityAnim = new Animated.Value(0);

function formatDateFull(dateStr?: string): string {
  if (!dateStr || dateStr.trim() === '') return 'Every day (Repeating)';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ConfirmationScreen() {
  const params = useLocalSearchParams<{
    hour: string;
    minute: string;
    amPm: string;
    date?: string;
    compartment?: string;
    slotIndex?: string;
    reminderId?: string;
  }>();
  const hour = parseInt(params.hour ?? '8', 10);
  const minute = parseInt(params.minute ?? '0', 10);
  const amPm = (params.amPm ?? 'AM') as AmPm;

  const { add } = useReminders();
  const [saving, setSaving] = useState(false);
  const savedRef = useRef(false);

  // Run entrance animation on mount
  React.useEffect(() => {
    scaleAnim.setValue(0.8);
    opacityAnim.setValue(0);
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 80,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const formattedTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${amPm}`;
  const hasDate = params.date && params.date.trim() !== '';

  const saveReminderToStorage = useCallback(async () => {
    const reminder: Reminder = {
      id: params.reminderId && params.reminderId.trim() !== ''
        ? params.reminderId
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      hour,
      minute,
      amPm,
      recurrence: hasDate ? 'once' : 'every-day',
      date: hasDate ? params.date : undefined,
      createdAt: new Date().toISOString(),
      compartment: params.compartment || undefined,
      slotIndex: params.slotIndex !== undefined && params.slotIndex !== ''
        ? parseInt(params.slotIndex, 10)
        : undefined,
    };
    await add(reminder);
  }, [hour, minute, amPm, hasDate, params.date, params.reminderId, params.compartment, params.slotIndex, add]);

  const handleDone = useCallback(async () => {
    if (savedRef.current || saving) return;
    savedRef.current = true;
    setSaving(true);
    await saveReminderToStorage();
    router.replace('/(tabs)');
  }, [saving, saveReminderToStorage]);

  const handleAddAnother = useCallback(async () => {
    if (savedRef.current || saving) return;
    savedRef.current = true;
    setSaving(true);
    await saveReminderToStorage();
    router.replace('/set-time');
  }, [saving, saveReminderToStorage]);

  return (
    <SafeAreaView style={styles.safe}>
      <Animated.View
        style={[styles.content, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}
      >
        <View style={styles.checkCircle}>
          <Ionicons name="checkmark" size={64} color="#fff" />
        </View>

        <Text style={styles.heading}>Schedule Saved!</Text>
        <Text style={styles.subtitle}>
          {params.compartment ? `Dispenser ${params.compartment} set for:` : 'The dispenser will remind you at:'}
        </Text>

        <View style={styles.timeBox}>
          <Text style={styles.timeText}>{formattedTime}</Text>
          <View style={styles.dateBadge}>
            <Ionicons
              name={hasDate ? 'calendar' : 'repeat'}
              size={15}
              color="#1B5E20"
              style={{ marginRight: 6 }}
            />
            <Text style={styles.dateText}>{formatDateFull(params.date)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
            <Ionicons name="wifi" size={13} color="#2E7D32" style={{ marginRight: 4 }} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#2E7D32' }}>
              Wi-Fi Vibration Alarm Synced
            </Text>
          </View>
        </View>
      </Animated.View>

      <View style={styles.footer}>
        <PrimaryButton
          label="+ ADD ANOTHER MEDICINE"
          onPress={handleAddAnother}
          color="#4CAF50"
          icon="add-circle-outline"
          loading={saving}
          style={styles.addAnotherBtn}
        />
        <View style={{ height: 10 }} />
        <PrimaryButton
          label="DONE"
          onPress={handleDone}
          color="#1976D2"
          icon="home"
          loading={saving}
          style={styles.doneBtn}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F5F0E8',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  checkCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  heading: {
    fontSize: 30,
    fontWeight: '800',
    color: '#212121',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: '#616161',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
  },
  timeBox: {
    backgroundColor: '#C8E6C9',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 36,
    alignItems: 'center',
  },
  timeText: {
    fontSize: 36,
    fontWeight: '800',
    color: '#212121',
    letterSpacing: 1,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#A5D6A7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 10,
  },
  dateText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1B5E20',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 12,
  },
  addAnotherBtn: {
    width: '100%',
    borderRadius: 16,
  },
  doneBtn: {
    width: '100%',
    borderRadius: 16,
  },
});
