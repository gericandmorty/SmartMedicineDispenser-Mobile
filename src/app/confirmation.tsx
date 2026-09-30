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

export default function ConfirmationScreen() {
  const params = useLocalSearchParams<{
    hour: string;
    minute: string;
    amPm: string;
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

  const handleDone = useCallback(async () => {
    if (savedRef.current || saving) return;
    savedRef.current = true;
    setSaving(true);

    const reminder: Reminder = {
      id: params.reminderId && params.reminderId.trim() !== ''
        ? params.reminderId
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      hour,
      minute,
      amPm,
      recurrence: 'every-day',
      createdAt: new Date().toISOString(),
      compartment: params.compartment || undefined,
      slotIndex: params.slotIndex !== undefined && params.slotIndex !== ''
        ? parseInt(params.slotIndex, 10)
        : undefined,
    };

    await add(reminder);
    router.replace('/(tabs)/schedule');
  }, [saving, hour, minute, amPm, params.reminderId, params.compartment, params.slotIndex, add]);

  return (
    <SafeAreaView style={styles.safe}>
      <Animated.View
        style={[styles.content, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}
      >
        <View style={styles.checkCircle}>
          <Ionicons name="checkmark" size={64} color="#fff" />
        </View>

        <Text style={styles.heading}>Time Saved!</Text>
        <Text style={styles.subtitle}>
          {params.compartment ? `Dispenser ${params.compartment} set for:` : 'The dispenser will remind you at:'}
        </Text>

        <View style={styles.timeBox}>
          <Text style={styles.timeText}>{formattedTime}</Text>
        </View>
      </Animated.View>

      <View style={styles.footer}>
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
    paddingHorizontal: 48,
  },
  timeText: {
    fontSize: 36,
    fontWeight: '800',
    color: '#212121',
    letterSpacing: 1,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 12,
  },
  doneBtn: {
    width: '100%',
    borderRadius: 16,
  },
});
