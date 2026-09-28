import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import TimePicker from '../components/TimePicker';
import PrimaryButton from '../components/PrimaryButton';
import { AmPm } from '../types/reminder';

export default function SetTimeScreen() {
  const params = useLocalSearchParams<{ hour?: string; minute?: string; amPm?: string }>();

  const [hour, setHour] = useState<number>(
    params.hour ? parseInt(params.hour, 10) : 8
  );
  const [minute, setMinute] = useState<number>(
    params.minute ? parseInt(params.minute, 10) : 0
  );
  const [amPm, setAmPm] = useState<AmPm>(
    (params.amPm as AmPm) ?? 'AM'
  );

  const handleSave = () => {
    router.push({
      pathname: '/confirmation',
      params: { hour: String(hour), minute: String(minute), amPm },
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
        <Text style={styles.title}>Set Time</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        <TimePicker
          hour={hour}
          minute={minute}
          amPm={amPm}
          onHourChange={setHour}
          onMinuteChange={setMinute}
          onAmPmChange={setAmPm}
        />
      </View>

      <View style={styles.footer}>
        <PrimaryButton
          label="SAVE"
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
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
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
