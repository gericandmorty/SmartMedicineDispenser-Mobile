import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import TimePicker from '../components/TimePicker';
import DatePicker from '../components/DatePicker';
import PrimaryButton from '../components/PrimaryButton';
import { AmPm } from '../types/reminder';

function getTodayString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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

  const [hour, setHour] = useState<number>(
    params.hour ? parseInt(params.hour, 10) : 8
  );
  const [minute, setMinute] = useState<number>(
    params.minute ? parseInt(params.minute, 10) : 0
  );
  const [amPm, setAmPm] = useState<AmPm>(
    (params.amPm as AmPm) ?? 'AM'
  );
  const [date, setDate] = useState<string | undefined>(
    params.date !== undefined && params.date !== '' ? params.date : getTodayString()
  );

  const handleSave = () => {
    router.push({
      pathname: '/confirmation',
      params: {
        hour: String(hour),
        minute: String(minute),
        amPm,
        date: date ?? '',
        compartment: params.compartment ?? '',
        slotIndex: params.slotIndex ?? '',
        reminderId: params.reminderId ?? '',
      },
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#212121" />
        </TouchableOpacity>
        <Text style={styles.title}>Set Schedule</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {params.compartment ? (
          <View style={styles.compartmentBadge}>
            <Ionicons name="cube" size={16} color="#1B5E20" />
            <Text style={styles.compartmentText}>
              Compartment: {params.compartment}
            </Text>
          </View>
        ) : null}

        <TimePicker
          hour={hour}
          minute={minute}
          amPm={amPm}
          onHourChange={setHour}
          onMinuteChange={setMinute}
          onAmPmChange={setAmPm}
        />

        <DatePicker
          selectedDate={date}
          onDateChange={setDate}
        />
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label="SAVE SCHEDULE"
          onPress={handleSave}
          color="#1976D2"
          icon="save-outline"
          style={styles.saveBtn}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#212121',
  },
  placeholder: {
    width: 40,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  compartmentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#C8E6C9',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 20,
    gap: 6,
  },
  compartmentText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1B5E20',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 12,
  },
  saveBtn: {
    width: '100%',
    borderRadius: 16,
  },
});
