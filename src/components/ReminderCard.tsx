import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Reminder } from '../types/reminder';

import { triggerHardwareDispense } from '../services/hardware';

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
        <View style={styles.badgeRow}>
          {reminder.compartment ? (
            <View style={styles.tag}>
              <Ionicons name="cube-outline" size={12} color="#1B5E20" style={{ marginRight: 3 }} />
              <Text style={styles.tagText}>{reminder.compartment}</Text>
            </View>
          ) : null}
          <Text style={styles.recurrence}>Every day</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.dispenseBtn}
          onPress={() => triggerHardwareDispense(reminder)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="flash-outline" size={18} color="#2E7D32" />
          <Text style={styles.dispenseText}>DISPENSE</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => onDelete(reminder.id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="trash" size={20} color="#E53935" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
    marginRight: 6,
  },
  time: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  recurrence: {
    fontSize: 12,
    color: '#757575',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 6,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#C8E6C9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1B5E20',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dispenseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 3,
    borderWidth: 1,
    borderColor: '#A5D6A7',
  },
  dispenseText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2E7D32',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFEBEE',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
