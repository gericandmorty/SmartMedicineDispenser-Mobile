import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Reminder, ColumnStockStatus, DoseEvent } from '../types/reminder';
import { calculateDoseOccurrence } from '../services/medicationLogic';
import { triggerHardwareDispense } from '../services/hardware';

interface Props {
  reminder: Reminder;
  onDelete: (id: string) => void;
  stockStatus?: ColumnStockStatus;
  doseHistory?: DoseEvent[];
}

function formatTime(r: Reminder): string {
  const h = String(r.hour).padStart(2, '0');
  const m = String(r.minute).padStart(2, '0');
  if (r.second !== undefined) {
    const s = String(r.second).padStart(2, '0');
    return `${h}:${m}:${s} ${r.amPm}`;
  }
  return `${h}:${m} ${r.amPm}`;
}

function formatDateLabel(dateStr?: string): string {
  if (!dateStr) return 'Every day';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

  if (dateStr === todayStr) return 'Today';
  if (dateStr === tomorrowStr) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ReminderCard({ reminder, onDelete, stockStatus, doseHistory = [] }: Props) {
  const occurrence = calculateDoseOccurrence(reminder, Date.now(), doseHistory);
  const isMissed = occurrence.state === 'MISSED';
  const isAlerting = occurrence.state === 'ALERTING';
  const isTaken = occurrence.state === 'TAKEN' || occurrence.state === 'TAKEN_MANUAL';

  return (
    <View style={[styles.card, isMissed && styles.cardMissed]}>
      <View style={[styles.iconWrap, isMissed && styles.iconWrapMissed, isAlerting && styles.iconWrapAlerting]}>
        <Ionicons
          name={isMissed ? 'alert-circle' : isAlerting ? 'alarm' : 'time'}
          size={28}
          color={isMissed ? '#DC2626' : isAlerting ? '#D97706' : '#4CAF50'}
        />
      </View>
      <View style={styles.info}>
        <View style={styles.timeRow}>
          <Text style={[styles.time, isMissed && styles.timeMissed]}>{formatTime(reminder)}</Text>
          {isMissed && (
            <View style={styles.missedTag}>
              <Ionicons name="alert-circle" size={11} color="#DC2626" style={{ marginRight: 3 }} />
              <Text style={styles.missedTagText}>MISSED (20m passed)</Text>
            </View>
          )}
          {isAlerting && (
            <View style={styles.alertingTag}>
              <Ionicons name="alarm" size={11} color="#B45309" style={{ marginRight: 3 }} />
              <Text style={styles.alertingTagText}>Time to Take ({Math.ceil(occurrence.remainingSeconds / 60)}m left)</Text>
            </View>
          )}
          {isTaken && (
            <View style={styles.takenTag}>
              <Ionicons name="checkmark-circle" size={11} color="#15803D" style={{ marginRight: 3 }} />
              <Text style={styles.takenTagText}>Taken Today</Text>
            </View>
          )}
        </View>

        <View style={styles.badgeRow}>
          {reminder.compartment ? (
            <View style={styles.tag}>
              <Ionicons name="cube-outline" size={12} color="#1B5E20" style={{ marginRight: 3 }} />
              <Text style={styles.tagText}>{reminder.compartment}</Text>
            </View>
          ) : null}

          {reminder.date ? (
            <View style={styles.dateTag}>
              <Ionicons name="calendar-outline" size={12} color="#1565C0" style={{ marginRight: 3 }} />
              <Text style={styles.dateTagText}>{formatDateLabel(reminder.date)}</Text>
            </View>
          ) : (
            <Text style={styles.recurrence}>Every day</Text>
          )}

          {stockStatus ? (
            <View
              style={[
                styles.stockTag,
                stockStatus.isOutOfStock
                  ? styles.stockTagEmpty
                  : stockStatus.isLowStock
                  ? styles.stockTagLow
                  : styles.stockTagOk,
              ]}
            >
              <Ionicons
                name={
                  stockStatus.isOutOfStock
                    ? 'alert-circle'
                    : stockStatus.isLowStock
                    ? 'warning-outline'
                    : 'medkit-outline'
                }
                size={11}
                color={
                  stockStatus.isOutOfStock
                    ? '#D32F2F'
                    : stockStatus.isLowStock
                    ? '#E65100'
                    : '#1B5E20'
                }
                style={{ marginRight: 3 }}
              />
              <Text
                style={[
                  styles.stockTagText,
                  stockStatus.isOutOfStock
                    ? styles.stockTextEmpty
                    : stockStatus.isLowStock
                    ? styles.stockTextLow
                    : styles.stockTextOk,
                ]}
              >
                {stockStatus.isOutOfStock
                  ? `Col ${stockStatus.column}: 0 left`
                  : `Col ${stockStatus.column}: ${stockStatus.remainingDoses}/${stockStatus.cycleDays} left`}
              </Text>
            </View>
          ) : null}
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
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cardMissed: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FFF8F8',
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
  iconWrapMissed: {
    backgroundColor: '#FEE2E2',
  },
  iconWrapAlerting: {
    backgroundColor: '#FEF3C7',
  },
  info: {
    flex: 1,
    marginRight: 6,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  time: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  timeMissed: {
    color: '#991B1B',
  },
  missedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  missedTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: 0.3,
  },
  alertingTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  alertingTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
  },
  takenTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  takenTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D',
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
  dateTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#90CAF9',
  },
  dateTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1565C0',
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
  stockTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.5,
  },
  stockTagOk: {
    backgroundColor: '#E8F5E9',
    borderColor: '#A5D6A7',
  },
  stockTagLow: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FFCC80',
  },
  stockTagEmpty: {
    backgroundColor: '#FFEBEE',
    borderColor: '#EF9A9A',
  },
  stockTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  stockTextOk: {
    color: '#2E7D32',
  },
  stockTextLow: {
    color: '#E65100',
  },
  stockTextEmpty: {
    color: '#C62828',
  },
});
