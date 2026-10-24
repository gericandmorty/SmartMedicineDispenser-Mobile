import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  selectedDate?: string; // "YYYY-MM-DD" or undefined for every day
  onDateChange: (date?: string) => void;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateDisplay(dateStr?: string): string {
  if (!dateStr) return 'Every day (Repeating)';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);

  const todayStr = toDateString(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = toDateString(tomorrow);

  if (dateStr === todayStr) {
    return `Today (${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`;
  }
  if (dateStr === tomorrowStr) {
    return `Tomorrow (${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`;
  }
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DatePicker({ selectedDate, onDateChange }: Props) {
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => toDateString(today), [today]);
  const tomorrowStr = useMemo(() => {
    const t = new Date(today);
    t.setDate(t.getDate() + 1);
    return toDateString(t);
  }, [today]);

  // Calendar view state (which month/year is being viewed)
  const initialCalendarDate = useMemo(() => {
    if (selectedDate) {
      const [y, m] = selectedDate.split('-').map(Number);
      return new Date(y, m - 1, 1);
    }
    return new Date();
  }, [selectedDate]);

  const [viewDate, setViewDate] = useState<Date>(initialCalendarDate);
  const [showCalendar, setShowCalendar] = useState(false);

  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();

  const prevMonth = () => {
    setViewDate(new Date(viewYear, viewMonth - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(viewYear, viewMonth + 1, 1));
  };

  // Generate days matrix for calendar
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const days: (number | null)[] = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(d);
    }
    return days;
  }, [viewYear, viewMonth]);

  const handleSelectDay = (day: number) => {
    const date = new Date(viewYear, viewMonth, day);
    onDateChange(toDateString(date));
  };

  const isSelected = (day: number) => {
    if (!selectedDate) return false;
    const target = toDateString(new Date(viewYear, viewMonth, day));
    return target === selectedDate;
  };

  const isToday = (day: number) => {
    const target = toDateString(new Date(viewYear, viewMonth, day));
    return target === todayStr;
  };

  const isEveryDay = !selectedDate;
  const isTodaySelected = selectedDate === todayStr;
  const isTomorrowSelected = selectedDate === tomorrowStr;
  const isCustomSelected = !!selectedDate && !isTodaySelected && !isTomorrowSelected;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Choose Date</Text>

      {/* Selected Date Summary Badge */}
      <View style={styles.summaryBadge}>
        <Ionicons
          name={isEveryDay ? 'repeat' : 'calendar'}
          size={16}
          color="#1B5E20"
        />
        <Text style={styles.summaryText}>{formatDateDisplay(selectedDate)}</Text>
      </View>

      {/* Quick Option Buttons */}
      <View style={styles.pillRow}>
        <TouchableOpacity
          style={[styles.pill, isTodaySelected && styles.pillActive]}
          onPress={() => {
            onDateChange(todayStr);
            setShowCalendar(false);
          }}
          activeOpacity={0.75}
        >
          <Text style={[styles.pillText, isTodaySelected && styles.pillTextActive]}>
            Today
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.pill, isTomorrowSelected && styles.pillActive]}
          onPress={() => {
            onDateChange(tomorrowStr);
            setShowCalendar(false);
          }}
          activeOpacity={0.75}
        >
          <Text style={[styles.pillText, isTomorrowSelected && styles.pillTextActive]}>
            Tomorrow
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.pill, (showCalendar || isCustomSelected) && styles.pillActive]}
          onPress={() => setShowCalendar(!showCalendar)}
          activeOpacity={0.75}
        >
          <Ionicons
            name="calendar-outline"
            size={13}
            color={showCalendar || isCustomSelected ? '#fff' : '#555'}
            style={{ marginRight: 4 }}
          />
          <Text style={[styles.pillText, (showCalendar || isCustomSelected) && styles.pillTextActive]}>
            Pick Date
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.pill, isEveryDay && styles.pillActive]}
          onPress={() => {
            onDateChange(undefined);
            setShowCalendar(false);
          }}
          activeOpacity={0.75}
        >
          <Text style={[styles.pillText, isEveryDay && styles.pillTextActive]}>
            Every Day
          </Text>
        </TouchableOpacity>
      </View>

      {/* Inline Calendar (collapsible / toggleable) */}
      {showCalendar && (
        <View style={styles.calendarCard}>
          {/* Calendar Header */}
          <View style={styles.calHeader}>
            <TouchableOpacity onPress={prevMonth} style={styles.calNavBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-back" size={20} color="#212121" />
            </TouchableOpacity>

            <Text style={styles.calMonthTitle}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </Text>

            <TouchableOpacity onPress={nextMonth} style={styles.calNavBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-forward" size={20} color="#212121" />
            </TouchableOpacity>
          </View>

          {/* Weekday Labels */}
          <View style={styles.weekRow}>
            {WEEKDAYS.map((wd) => (
              <Text key={wd} style={styles.weekDayLbl}>
                {wd}
              </Text>
            ))}
          </View>

          {/* Days Grid */}
          <View style={styles.daysGrid}>
            {calendarDays.map((d, index) => {
              if (d === null) {
                return <View key={`empty-${index}`} style={styles.dayCell} />;
              }
              const selected = isSelected(d);
              const currentDay = isToday(d);

              return (
                <TouchableOpacity
                  key={`day-${d}`}
                  style={[
                    styles.dayCell,
                    currentDay && !selected && styles.todayCell,
                    selected && styles.selectedCell,
                  ]}
                  onPress={() => handleSelectDay(d)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.dayText,
                      currentDay && !selected && styles.todayText,
                      selected && styles.selectedDayText,
                    ]}
                  >
                    {d}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 12,
  },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  summaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1B5E20',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  pillActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
  },
  pillTextActive: {
    color: '#fff',
  },
  calendarCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calMonthTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#212121',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    paddingBottom: 6,
  },
  weekDayLbl: {
    width: 36,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#9E9E9E',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
    borderRadius: 18,
  },
  todayCell: {
    borderWidth: 1.5,
    borderColor: '#4CAF50',
  },
  selectedCell: {
    backgroundColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 2,
  },
  dayText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  todayText: {
    color: '#4CAF50',
    fontWeight: '800',
  },
  selectedDayText: {
    color: '#fff',
    fontWeight: '800',
  },
});
