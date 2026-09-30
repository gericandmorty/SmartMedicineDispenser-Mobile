import React, { useMemo, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Dimensions,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Reminder } from '../types/reminder';
import { triggerHardwareDispense } from '../services/hardware';

const { width: SCREEN_W } = Dimensions.get('window');
const CABINET_W   = SCREEN_W - 32;   // 16px page padding each side
const CELL_H      = 90;               // generous cell height
const ROW_LABEL_W = 22;
const COL_COUNT   = 4;
const ROW_COUNT   = 3;
const DIVIDER     = 6;                // gap between cells (acts as wall)
const SLOTS       = COL_COUNT * ROW_COUNT; // 12

const COLS = ['A', 'B', 'C', 'D'];
const ROWS = ['1', '2', '3'];

// ─── Pulsing LED ─────────────────────────────────────────────────────────────
function LED({ active }: { active: boolean }) {
  const ring  = useMemo(() => new Animated.Value(1), []);
  const ringO = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    if (!active) { ring.setValue(1); ringO.setValue(0); return; }
    ringO.setValue(0.5);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(ring,  { toValue: 2.4, duration: 850, useNativeDriver: true }),
        Animated.timing(ring,  { toValue: 1,   duration: 850, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [active, ring, ringO]);

  const DOT = 12;
  return (
    <View style={{ width: DOT, height: DOT, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{
        position: 'absolute',
        width: DOT, height: DOT, borderRadius: DOT / 2,
        backgroundColor: '#4CAF50',
        transform: [{ scale: ring }],
        opacity: ringO,
      }} />
      <View style={{
        width: DOT, height: DOT, borderRadius: DOT / 2,
        backgroundColor: active ? '#76FF03' : '#4A4A4A',
        position: 'absolute',
        shadowColor: active ? '#76FF03' : 'transparent',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: active ? 0.9 : 0,
        shadowRadius: 6,
        elevation: active ? 4 : 0,
      }} />
    </View>
  );
}

// ─── Single cell ──────────────────────────────────────────────────────────────
function Cell({
  col,
  row,
  active,
  reminder,
  onPress,
}: {
  col: string;
  row: string;
  active: boolean;
  reminder?: Reminder;
  onPress: () => void;
}) {
  const timeStr = reminder
    ? `${String(reminder.hour).padStart(2, '0')}:${String(reminder.minute).padStart(2, '0')}\n${reminder.amPm}`
    : '';
  return (
    <TouchableOpacity
      style={[s.cell, active && s.cellActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[s.cellLbl, active && s.cellLblActive]}>{col}{row}</Text>
      <LED active={active} />
      {active ? (
        <Text style={s.cellTime}>{timeStr}</Text>
      ) : (
        <View style={s.addIconWrap}>
          <Ionicons name="add" size={14} color="#888" />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────
const CLOSED_H = 0;
const OPEN_H = ROW_COUNT * CELL_H + DIVIDER * (ROW_COUNT + 1) + 36; // 36 for col headers

interface DrawerProps {
  index: number;
  allReminders: Reminder[];
  onDeleteReminder?: (id: string) => void;
}

function DrawerPanel({ index, allReminders, onDeleteReminder }: DrawerProps) {
  const [open, setOpen] = useState(index === 0); // Open Drawer 1 by default
  const anim   = useMemo(() => new Animated.Value(index === 0 ? OPEN_H : CLOSED_H), [index]);
  const rotate = useMemo(() => new Animated.Value(index === 0 ? 1 : 0), [index]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    Animated.parallel([
      Animated.spring(anim,   { toValue: next ? OPEN_H : CLOSED_H, tension: 50, friction: 10, useNativeDriver: false }),
      Animated.timing(rotate, { toValue: next ? 1 : 0, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  const chevron = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  // Map slots for this drawer (index 0: slots 0..11, index 1: slots 12..23)
  const drawerBaseIndex = index * SLOTS;

  // Find active count for this drawer
  const drawerActiveCount = useMemo(() => {
    return allReminders.filter((r) => {
      if (r.slotIndex !== undefined) {
        return r.slotIndex >= drawerBaseIndex && r.slotIndex < drawerBaseIndex + SLOTS;
      }
      if (r.compartment) {
        return r.compartment.startsWith(`Drawer ${index + 1}`);
      }
      return false;
    }).length;
  }, [allReminders, index, drawerBaseIndex]);

  const handleCellPress = (col: string, row: string, ri: number, ci: number) => {
    const slotInDrawer = ri * COL_COUNT + ci;
    const globalSlotIndex = drawerBaseIndex + slotInDrawer;
    const compartmentLabel = `Drawer ${index + 1} (${col}${row})`;

    // Check if slot has reminder
    const existing = allReminders.find((r) => {
      if (r.slotIndex !== undefined) return r.slotIndex === globalSlotIndex;
      if (r.compartment) return r.compartment === compartmentLabel;
      return false;
    });

    if (existing) {
      const timeFormatted = `${String(existing.hour).padStart(2, '0')}:${String(existing.minute).padStart(2, '0')} ${existing.amPm}`;
      Alert.alert(
        `Compartment ${col}${row}`,
        `Current schedule: ${timeFormatted}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Dispense Now 💊',
            onPress: () => {
              triggerHardwareDispense(existing);
            },
          },
          {
            text: 'Change Time',
            onPress: () => {
              router.push({
                pathname: '/set-time',
                params: {
                  compartment: compartmentLabel,
                  slotIndex: String(globalSlotIndex),
                  hour: String(existing.hour),
                  minute: String(existing.minute),
                  amPm: existing.amPm,
                  reminderId: existing.id,
                },
              });
            },
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              if (onDeleteReminder) onDeleteReminder(existing.id);
            },
          },
        ]
      );
    } else {
      router.push({
        pathname: '/set-time',
        params: {
          compartment: compartmentLabel,
          slotIndex: String(globalSlotIndex),
        },
      });
    }
  };

  return (
    <View style={s.cabinet}>
      {/* Header row */}
      <TouchableOpacity style={s.header} onPress={toggle} activeOpacity={0.85}>
        <View style={s.headerLeft}>
          <Ionicons name="layers-outline" size={17} color="#76FF03" style={{ marginRight: 8 }} />
          <Text style={s.headerTitle}>Drawer {index + 1}</Text>
          <Text style={s.headerCount}>{drawerActiveCount}/{SLOTS} active</Text>
        </View>
        <Animated.View style={{ transform: [{ rotate: chevron }] }}>
          <Ionicons name="chevron-down" size={20} color="#76FF03" />
        </Animated.View>
      </TouchableOpacity>

      {/* Expandable grid */}
      <Animated.View style={{ height: anim, overflow: 'hidden' }}>
        {/* Column letters */}
        <View style={s.colRow}>
          <View style={{ width: ROW_LABEL_W }} />
          {COLS.map(c => (
            <Text key={c} style={s.colLbl}>{c}</Text>
          ))}
        </View>

        {/* Rows */}
        {ROWS.map((row, ri) => (
          <View key={row} style={s.gridRow}>
            <Text style={s.rowLbl}>{row}</Text>
            {COLS.map((col, ci) => {
              const slotInDrawer = ri * COL_COUNT + ci;
              const globalSlotIndex = drawerBaseIndex + slotInDrawer;
              const compartmentLabel = `Drawer ${index + 1} (${col}${row})`;

              const reminder = allReminders.find((r) => {
                if (r.slotIndex !== undefined) return r.slotIndex === globalSlotIndex;
                if (r.compartment) return r.compartment === compartmentLabel;
                return false;
              });

              return (
                <Cell
                  key={col}
                  col={col}
                  row={row}
                  active={!!reminder}
                  reminder={reminder}
                  onPress={() => handleCellPress(col, row, ri, ci)}
                />
              );
            })}
          </View>
        ))}
      </Animated.View>

      {/* Handle */}
      <View style={s.handleWrap}>
        <View style={s.handle} />
      </View>
    </View>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────
export default function DispenserView({
  reminders,
  onDeleteReminder,
}: {
  reminders: Reminder[];
  onDeleteReminder?: (id: string) => void;
}) {
  return (
    <View style={{ marginBottom: 16, alignItems: 'center' }}>
      <Text style={s.sectionLbl}>DISPENSER COMPARTMENTS (TAP CELL TO ADD)</Text>
      <DrawerPanel index={0} allReminders={reminders} onDeleteReminder={onDeleteReminder} />
      <DrawerPanel index={1} allReminders={reminders} onDeleteReminder={onDeleteReminder} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  sectionLbl: {
    alignSelf: 'flex-start',
    fontSize: 11, fontWeight: '700', color: '#9E9E9E',
    letterSpacing: 1.2, marginBottom: 10,
  },

  // Cabinet body
  cabinet: {
    width: CABINET_W,
    backgroundColor: '#363636',
    borderRadius: 14,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },

  // Top header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#242424',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 15, fontWeight: '800', color: '#FFF', letterSpacing: 0.4 },
  headerCount: { fontSize: 12, color: '#76FF03', fontWeight: '700', marginLeft: 10 },

  // Column headers
  colRow: {
    flexDirection: 'row',
    paddingTop: 10,
    paddingBottom: 4,
    paddingHorizontal: DIVIDER,
  },
  colLbl: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13, fontWeight: '800', color: '#76FF03', letterSpacing: 0.8,
  },

  // Grid rows
  gridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: DIVIDER,
    marginBottom: DIVIDER,
  },
  rowLbl: {
    width: ROW_LABEL_W,
    textAlign: 'center',
    fontSize: 13, fontWeight: '800', color: '#76FF03',
  },

  // Cell
  cell: {
    flex: 1,
    height: CELL_H,
    marginHorizontal: DIVIDER / 2,
    backgroundColor: '#4C4C4C',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  cellActive: {
    backgroundColor: '#0D2B0D',
    borderWidth: 1.5,
    borderColor: '#4CAF50',
  },
  cellLbl: {
    position: 'absolute', top: 6, left: 8,
    fontSize: 10, fontWeight: '700', color: '#777',
  },
  cellLblActive: {
    color: '#76FF03',
  },
  cellTime: {
    fontSize: 9, fontWeight: '800', color: '#76FF03',
    textAlign: 'center', lineHeight: 12,
  },
  addIconWrap: {
    marginTop: 2,
    opacity: 0.6,
  },

  // Handle
  handleWrap: {
    alignItems: 'center', paddingVertical: 10,
    backgroundColor: '#242424',
  },
  handle: {
    width: 64, height: 10, borderRadius: 5,
    backgroundColor: '#111',
    borderWidth: 1, borderColor: '#555',
  },
});
