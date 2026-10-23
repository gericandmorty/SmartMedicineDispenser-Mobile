import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Modal,
  Pressable,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AmPm, Reminder } from '../types/reminder';
import { getCurrentTime12 } from '../services/medicationLogic';

const ITEM_HEIGHT = 46;
const VISIBLE_COUNT = 3;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_COUNT; // 138px
const CENTER_OFFSET = ITEM_HEIGHT; // 46px

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const SECONDS = Array.from({ length: 60 }, (_, i) => i);
const PERIODS: AmPm[] = ['AM', 'PM'];

function toIsoString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface WheelColumnProps<T> {
  items: T[];
  selectedIndex: number;
  formatItem: (item: T) => string;
  onSelectIndex: (idx: number) => void;
  width: number;
}

function WheelColumn<T>({
  items,
  selectedIndex,
  formatItem,
  onSelectIndex,
  width,
}: WheelColumnProps<T>) {
  const scrollRef = useRef<ScrollView>(null);
  const isInteracting = useRef(false);
  const isMountedRef = useRef(false);
  const [visualIndex, setVisualIndex] = useState(selectedIndex);

  // Initial scroll to selectedIndex on mount without animated jump
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: selectedIndex * ITEM_HEIGHT,
        animated: false,
      });
      setVisualIndex(selectedIndex);
      isMountedRef.current = true;
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  // Sync when selectedIndex changes externally while user is not dragging
  useEffect(() => {
    if (isMountedRef.current && !isInteracting.current && selectedIndex !== visualIndex) {
      setVisualIndex(selectedIndex);
      scrollRef.current?.scrollTo({
        y: selectedIndex * ITEM_HEIGHT,
        animated: true,
      });
    }
  }, [selectedIndex]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    if (clamped !== visualIndex) {
      setVisualIndex(clamped);
    }
  };

  const handleScrollEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const velocity = e.nativeEvent.velocity;
    // If drag ended without momentum (slow drag release), commit selection now
    if (!velocity || Math.abs(velocity.y || 0) < 0.1) {
      const y = e.nativeEvent.contentOffset.y;
      const idx = Math.round(y / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(items.length - 1, idx));
      setVisualIndex(clamped);
      onSelectIndex(clamped);
      isInteracting.current = false;
    }
  };

  const handleMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    setVisualIndex(clamped);
    onSelectIndex(clamped);
    isInteracting.current = false;
  };

  return (
    <View style={[styles.columnWrap, { width }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.wheelScroll}
        contentContainerStyle={styles.wheelContent}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        nestedScrollEnabled={true}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          isInteracting.current = true;
        }}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleMomentumScrollEnd}
      >
        {items.map((item, idx) => {
          const isSelected = idx === visualIndex;
          return (
            <TouchableOpacity
              key={idx}
              style={[styles.itemRow, { width }]}
              onPress={() => {
                isInteracting.current = false;
                setVisualIndex(idx);
                scrollRef.current?.scrollTo({
                  y: idx * ITEM_HEIGHT,
                  animated: true,
                });
                onSelectIndex(idx);
              }}
              activeOpacity={0.75}
            >
              <Text
                style={[
                  styles.digitText,
                  isSelected ? styles.digitSelected : styles.digitUnfocused,
                ]}
                numberOfLines={1}
              >
                {formatItem(item)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export interface SetScheduleParams {
  hour?: number;
  minute?: number;
  second?: number;
  amPm?: AmPm;
  date?: string;
  compartment?: string;
  slotIndex?: number;
  reminderId?: string;
}

interface Props {
  visible: boolean;
  initialParams?: SetScheduleParams;
  onClose: () => void;
  onSave: (reminder: Reminder) => Promise<void> | void;
}

const slideAnim = new Animated.Value(500);
const fadeAnim = new Animated.Value(0);

function getInitialDateMode(
  date?: string,
  todayStr?: string,
  tomorrowStr?: string
): 'today' | 'tomorrow' | 'daily' | 'custom' {
  if (!date || date.trim() === '') return 'daily';
  if (date === todayStr) return 'today';
  if (date === tomorrowStr) return 'tomorrow';
  return 'custom';
}

function SetScheduleContent({
  initialParams,
  onClose,
  onSave,
}: {
  initialParams?: SetScheduleParams;
  onClose: () => void;
  onSave: (reminder: Reminder) => Promise<void> | void;
}) {
  const todayStr = useMemo(() => toIsoString(new Date()), []);
  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toIsoString(d);
  }, []);

  const defaultTime = useMemo(() => getCurrentTime12(), []);

  const [hour, setHour] = useState<number>(() => initialParams?.hour ?? defaultTime.hour);
  const [minute, setMinute] = useState<number>(() => initialParams?.minute ?? defaultTime.minute);
  const [second, setSecond] = useState<number>(() => initialParams?.second ?? 0);
  const [amPm, setAmPm] = useState<AmPm>(() => initialParams?.amPm ?? defaultTime.amPm);
  const [dateMode, setDateMode] = useState<'today' | 'tomorrow' | 'daily' | 'custom'>(() =>
    getInitialDateMode(initialParams?.date, todayStr, tomorrowStr)
  );
  const [customDate, setCustomDate] = useState<string>(() => initialParams?.date || todayStr);
  const [showCalendar, setShowCalendar] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    slideAnim.setValue(500);
    fadeAnim.setValue(0);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 65,
        friction: 11,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleDismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 500,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  }, [onClose]);

  const handleCommit = async () => {
    if (saving) return;
    setSaving(true);

    let finalDate: string | undefined = undefined;
    let recurrence: 'every-day' | 'once' = 'every-day';

    if (dateMode === 'today') {
      finalDate = todayStr;
      recurrence = 'once';
    } else if (dateMode === 'tomorrow') {
      finalDate = tomorrowStr;
      recurrence = 'once';
    } else if (dateMode === 'custom') {
      finalDate = customDate;
      recurrence = 'once';
    } else {
      // 'daily'
      finalDate = undefined;
      recurrence = 'every-day';
    }

    const reminder: Reminder = {
      id: initialParams?.reminderId && initialParams.reminderId.trim() !== ''
        ? initialParams.reminderId
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      hour,
      minute,
      second,
      amPm,
      recurrence,
      date: finalDate,
      createdAt: new Date().toISOString(),
      compartment: initialParams?.compartment,
      slotIndex: initialParams?.slotIndex,
    };

    try {
      await onSave(reminder);
    } finally {
      handleDismiss();
    }
  };

  const selectedHourIndex = Math.max(0, HOURS.indexOf(hour));
  const selectedMinuteIndex = Math.max(0, MINUTES.indexOf(minute));
  const selectedSecondIndex = Math.max(0, SECONDS.indexOf(second));
  const selectedPeriodIndex = Math.max(0, PERIODS.indexOf(amPm));

  // Custom date display string
  const customDateLabel = useMemo(() => {
    if (!customDate) return 'Custom ▾';
    const [y, m, d] = customDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    return `${dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ▾`;
  }, [customDate]);

  return (
    <View style={styles.modalOverlay}>
        {/* Scrim Backdrop */}
        <Animated.View style={[styles.scrim, { opacity: fadeAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
        </Animated.View>

        {/* Modal Bottom Sheet */}
        <Animated.View
          style={[
            styles.sheetContainer,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Top Sheet Header & Drag Handle */}
          <View style={styles.handleWrap}>
            <View style={styles.dragHandle} />
          </View>

          <View style={styles.headerRow}>
            <Text style={styles.sheetTitle}>Set Schedule</Text>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={handleDismiss}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={18} color="#4B5563" />
            </TouchableOpacity>
          </View>

          {/* Compartment Pill (if selected from a dispenser slot) */}
          {initialParams?.compartment ? (
            <View style={styles.compartmentPill}>
              <Ionicons name="cube-outline" size={13} color="#166534" style={{ marginRight: 5 }} />
              <Text style={styles.compartmentText}>
                {initialParams.compartment}
              </Text>
            </View>
          ) : null}

          {/* Section: TIME */}
          <Text style={styles.sectionHeader}>TIME</Text>
          <View style={styles.drumPickerCard}>
            {/* Center Focus Highlight Bar */}
            <View style={styles.focusBar} pointerEvents="none" />

            <View style={styles.wheelRow}>
              {/* Hours */}
              <WheelColumn<number>
                items={HOURS}
                selectedIndex={selectedHourIndex}
                formatItem={(h) => String(h).padStart(2, '0')}
                onSelectIndex={(idx) => setHour(HOURS[idx])}
                width={54}
              />

              {/* Colon */}
              <View style={styles.colonWrap}>
                <Text style={styles.colonText}>:</Text>
              </View>

              {/* Minutes */}
              <WheelColumn<number>
                items={MINUTES}
                selectedIndex={selectedMinuteIndex}
                formatItem={(m) => String(m).padStart(2, '0')}
                onSelectIndex={(idx) => setMinute(MINUTES[idx])}
                width={54}
              />

              {/* Colon */}
              <View style={styles.colonWrap}>
                <Text style={styles.colonText}>:</Text>
              </View>

              {/* Seconds */}
              <WheelColumn<number>
                items={SECONDS}
                selectedIndex={selectedSecondIndex}
                formatItem={(s) => String(s).padStart(2, '0')}
                onSelectIndex={(idx) => setSecond(SECONDS[idx])}
                width={54}
              />

              {/* Space */}
              <View style={{ width: 6 }} />

              {/* Period */}
              <WheelColumn<AmPm>
                items={PERIODS}
                selectedIndex={selectedPeriodIndex}
                formatItem={(p) => p}
                onSelectIndex={(idx) => setAmPm(PERIODS[idx])}
                width={52}
              />
            </View>

            {/* Gradient Fades */}
            <View style={styles.topFade} pointerEvents="none" />
            <View style={styles.bottomFade} pointerEvents="none" />
          </View>

          {/* Section: DAYS */}
          <Text style={styles.sectionHeader}>DAYS</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {/* Daily Chip */}
            <TouchableOpacity
              style={[styles.chip, dateMode === 'daily' && styles.chipSelected]}
              onPress={() => {
                setDateMode('daily');
                setShowCalendar(false);
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, dateMode === 'daily' && styles.chipTextSelected]}>
                Daily
              </Text>
            </TouchableOpacity>

            {/* Today Chip */}
            <TouchableOpacity
              style={[styles.chip, dateMode === 'today' && styles.chipSelected]}
              onPress={() => {
                setDateMode('today');
                setShowCalendar(false);
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, dateMode === 'today' && styles.chipTextSelected]}>
                Today
              </Text>
            </TouchableOpacity>

            {/* Tomorrow Chip */}
            <TouchableOpacity
              style={[styles.chip, dateMode === 'tomorrow' && styles.chipSelected]}
              onPress={() => {
                setDateMode('tomorrow');
                setShowCalendar(false);
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, dateMode === 'tomorrow' && styles.chipTextSelected]}>
                Tomorrow
              </Text>
            </TouchableOpacity>

            {/* Custom Chip */}
            <TouchableOpacity
              style={[styles.chip, (dateMode === 'custom' || showCalendar) && styles.chipSelected]}
              onPress={() => {
                setDateMode('custom');
                setShowCalendar(!showCalendar);
              }}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.chipText,
                  (dateMode === 'custom' || showCalendar) && styles.chipTextSelected,
                ]}
              >
                {dateMode === 'custom' ? customDateLabel : 'Custom ▾'}
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Quick Custom Date Stepper (if calendar/custom mode active) */}
          {showCalendar && (
            <View style={styles.customDateBar}>
              <TouchableOpacity
                onPress={() => {
                  const [y, m, d] = customDate.split('-').map(Number);
                  const prev = new Date(y, m - 1, d - 1);
                  setCustomDate(toIsoString(prev));
                }}
                style={styles.dateStepBtn}
              >
                <Ionicons name="chevron-back" size={16} color="#111827" />
              </TouchableOpacity>
              <Text style={styles.customDateText}>
                {new Date(customDate).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  const [y, m, d] = customDate.split('-').map(Number);
                  const next = new Date(y, m - 1, d + 1);
                  setCustomDate(toIsoString(next));
                }}
                style={styles.dateStepBtn}
              >
                <Ionicons name="chevron-forward" size={16} color="#111827" />
              </TouchableOpacity>
            </View>
          )}

          {/* Primary Action Button: SAVE SCHEDULE */}
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleCommit}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.saveBtnText}>SAVE SCHEDULE</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
  );
}

export default function SetScheduleBottomSheet({
  visible,
  initialParams,
  onClose,
  onSave,
}: Props) {
  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SetScheduleContent
        key={`${initialParams?.compartment || ''}-${initialParams?.reminderId || ''}`}
        initialParams={initialParams}
        onClose={onClose}
        onSave={onSave}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 24,
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
  },
  headerRow: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compartmentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#EAF7EE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BDE8C7',
    marginBottom: 8,
  },
  compartmentText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 8,
  },
  drumPickerCard: {
    height: WHEEL_HEIGHT,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    marginBottom: 10,
  },
  focusBar: {
    position: 'absolute',
    top: CENTER_OFFSET,
    left: 8,
    right: 8,
    height: ITEM_HEIGHT,
    backgroundColor: '#EAF7EE',
    borderWidth: 1,
    borderColor: '#BDE8C7',
    borderRadius: 10,
    zIndex: 0,
  },
  wheelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: WHEEL_HEIGHT,
    zIndex: 1,
  },
  columnWrap: {
    height: WHEEL_HEIGHT,
    overflow: 'hidden',
  },
  wheelScroll: {
    height: WHEEL_HEIGHT,
  },
  wheelContent: {
    paddingTop: CENTER_OFFSET,
    paddingBottom: CENTER_OFFSET,
  },
  itemRow: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  digitText: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  digitSelected: {
    color: '#166534',
    opacity: 1,
  },
  digitUnfocused: {
    color: '#9CA3AF',
    opacity: 0.4,
  },
  colonWrap: {
    height: WHEEL_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  colonText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#166534',
    lineHeight: 28,
  },
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 30,
    zIndex: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
  },
  bottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 30,
    zIndex: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 6,
  },
  chip: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipSelected: {
    backgroundColor: '#2E9E4B',
    borderColor: '#2E9E4B',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  customDateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 6,
  },
  customDateText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  dateStepBtn: {
    padding: 6,
  },
  saveBtn: {
    height: 50,
    backgroundColor: '#2E9E4B',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    shadowColor: '#2E9E4B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
