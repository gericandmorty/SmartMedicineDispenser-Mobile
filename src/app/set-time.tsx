import React from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import SetScheduleBottomSheet, { SetScheduleParams } from '../components/SetScheduleBottomSheet';
import { AmPm, Reminder } from '../types/reminder';

export default function SetTimeScreen() {
  const params = useLocalSearchParams<{
    hour?: string;
    minute?: string;
    amPm?: string;
    date?: string;
    compartment?: string;
    slotIndex?: string;
    reminderId?: string;
  }>();

  const initialParams: SetScheduleParams = {
    hour: params.hour ? parseInt(params.hour, 10) : 8,
    minute: params.minute ? parseInt(params.minute, 10) : 0,
    amPm: (params.amPm as AmPm) ?? 'AM',
    date: params.date,
    compartment: params.compartment,
    slotIndex: params.slotIndex ? parseInt(params.slotIndex, 10) : undefined,
    reminderId: params.reminderId,
  };

  const handleSave = (reminder: Reminder) => {
    router.push({
      pathname: '/confirmation',
      params: {
        hour: String(reminder.hour),
        minute: String(reminder.minute),
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
