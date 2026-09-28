import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AmPm } from '../types/reminder';

interface Props {
  hour: number;
  minute: number;
  amPm: AmPm;
  onHourChange: (h: number) => void;
  onMinuteChange: (m: number) => void;
  onAmPmChange: (v: AmPm) => void;
}

export default function TimePicker({
  hour,
  minute,
  amPm,
  onHourChange,
  onMinuteChange,
  onAmPmChange,
}: Props) {
  const incrementHour = () => onHourChange(hour === 12 ? 1 : hour + 1);
  const decrementHour = () => onHourChange(hour === 1 ? 12 : hour - 1);
  const incrementMinute = () => onMinuteChange(minute === 59 ? 0 : minute + 1);
  const decrementMinute = () => onMinuteChange(minute === 0 ? 59 : minute - 1);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Choose Time</Text>
      <View style={styles.pickerRow}>
        {/* Hour */}
        <View style={styles.spinnerCol}>
          <TouchableOpacity onPress={incrementHour} style={styles.arrowBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-up" size={28} color="#4CAF50" />
          </TouchableOpacity>
          <View style={styles.valueBox}>
            <Text style={styles.valueText}>{String(hour).padStart(2, '0')}</Text>
            <Text style={styles.unitText}>HOUR</Text>
          </View>
          <TouchableOpacity onPress={decrementHour} style={styles.arrowBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-down" size={28} color="#4CAF50" />
          </TouchableOpacity>
        </View>

        <Text style={styles.colon}>:</Text>

        {/* Minute */}
        <View style={styles.spinnerCol}>
          <TouchableOpacity onPress={incrementMinute} style={styles.arrowBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-up" size={28} color="#4CAF50" />
          </TouchableOpacity>
          <View style={styles.valueBox}>
            <Text style={styles.valueText}>{String(minute).padStart(2, '0')}</Text>
            <Text style={styles.unitText}>MINUTE</Text>
          </View>
          <TouchableOpacity onPress={decrementMinute} style={styles.arrowBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-down" size={28} color="#4CAF50" />
          </TouchableOpacity>
        </View>
      </View>

      {/* AM/PM Toggle */}
      <View style={styles.ampmRow}>
        <TouchableOpacity
          style={[styles.ampmBtn, amPm === 'AM' && styles.ampmActive]}
          onPress={() => onAmPmChange('AM')}
          activeOpacity={0.8}
        >
          <Text style={[styles.ampmText, amPm === 'AM' && styles.ampmTextActive]}>AM</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.ampmBtn, amPm === 'PM' && styles.ampmActive]}
          onPress={() => onAmPmChange('PM')}
          activeOpacity={0.8}
        >
          <Text style={[styles.ampmText, amPm === 'PM' && styles.ampmTextActive]}>PM</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 24,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerCol: {
    alignItems: 'center',
  },
  arrowBtn: {
    padding: 8,
  },
  valueBox: {
    width: 110,
    height: 90,
    backgroundColor: '#C8E6C9',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: {
    fontSize: 44,
    fontWeight: '800',
    color: '#212121',
    letterSpacing: 2,
  },
  unitText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4CAF50',
    letterSpacing: 1,
    marginTop: 2,
  },
  colon: {
    fontSize: 48,
    fontWeight: '800',
    color: '#424242',
    marginHorizontal: 12,
    marginBottom: 16,
  },
  ampmRow: {
    flexDirection: 'row',
    marginTop: 28,
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 4,
  },
  ampmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  ampmActive: {
    backgroundColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  ampmText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#757575',
  },
  ampmTextActive: {
    color: '#fff',
  },
});
