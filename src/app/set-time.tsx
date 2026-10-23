import React, { useRef, useMemo } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import SetScheduleBottomSheet, { SetScheduleParams } from '../components/SetScheduleBottomSheet';
import { AmPm, Reminder } from '../types/reminder';
import { getCurrentTime12 } from '../services/medicationLogic';

export default function SetTimeScreen() {
  const params = useLocalSearchParams<{
    hour?: string;
    minute?: string;
    second?: string;
    amPm?: string;
    date?: string;
    compartment?: string;
    slotIndex?: string;
    reminderId?: string;
  }>();

  // Capture current time snapshot ONCE upon screen mount so re-renders don't roll the clock
  const initialTimeSnapshot = useRef(getCurrentTime12()).current;

  const initialParams: SetScheduleParams = useMemo(() => ({
    hour: params.hour ? parseInt(params.hour, 10) : initialTimeSnapshot.hour,
    minute: params.minute ? parseInt(params.minute, 10) : initialTimeSnapshot.minute,
    second: params.second ? parseInt(params.second, 10) : 0,
    amPm: (params.amPm as AmPm) || initialTimeSnapshot.amPm,
    date: params.date,
    compartment: params.compartment,
    slotIndex: params.slotIndex ? parseInt(params.slotIndex, 10) : undefined,
    reminderId: params.reminderId,
  }), [
    params.hour,
    params.minute,
    params.second,
    params.amPm,
    params.date,
    params.compartment,
    params.slotIndex,
    params.reminderId,
    initialTimeSnapshot,
  ]);

  const handleSave = (reminder: Reminder) => {
    router.push({
      pathname: '/confirmation',
      params: {
        hour: String(reminder.hour),
        minute: String(reminder.minute),
        second: reminder.second !== undefined ? String(reminder.second) : '',
        amPm: reminder.amPm,
        date: reminder.date ?? '',
        compartment: reminder.compartment ?? '',
        slotIndex: reminder.slotIndex !== undefined ? String(reminder.slotIndex) : '',
        reminderId: reminder.id ?? '',
      },
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F0E8' }}>
      <SetScheduleBottomSheet
        visible={true}
        initialParams={initialParams}
        onClose={() => router.back()}
        onSave={handleSave}
      />
    </View>
  );
}
