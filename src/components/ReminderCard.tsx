import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Reminder } from '../types/reminder';

interface Props {
  reminder: Reminder;
  onDelete: (id: string) => void;
}

function formatTime(r: Reminder): string {
  const h = String(r.hour).padStart(2, '0');
  const m = String(r.minute).padStart(2, '0');
  return `${h}:${m} ${r.amPm}`;
}

export default function ReminderCard({ reminder, onDelete }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name="time" size={28} color="#4CAF50" />
      </View>
      <View style={styles.info}>
        <Text style={styles.time}>{formatTime(reminder)}</Text>
        <Text style={styles.recurrence}>Every day</Text>
      </View>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => onDelete(reminder.id)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="trash" size={22} color="#E53935" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  info: {
    flex: 1,
  },
  time: {
    fontSize: 22,
    fontWeight: '700',
    color: '#212121',
  },
  recurrence: {
    fontSize: 13,
    color: '#757575',
    marginTop: 2,
  },
  deleteBtn: {
    padding: 6,
  },
});
