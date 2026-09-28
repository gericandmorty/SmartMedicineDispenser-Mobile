import React, { useMemo, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Reminder } from '../types/reminder';

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
function Cell({ col, row, active, reminder }: {
  col: string; row: string; active: boolean; reminder?: Reminder;
}) {
  const timeStr = reminder
    ? `${String(reminder.hour).padStart(2, '0')}:${String(reminder.minute).padStart(2, '0')}\n${reminder.amPm}`
    : '';
  return (
    <View style={[s.cell, active && s.cellActive]}>
      <Text style={s.cellLbl}>{col}{row}</Text>
      <LED active={active} />
      {active && <Text style={s.cellTime}>{timeStr}</Text>}
    </View>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────
const CLOSED_H = 0;
// Grid height: rows * cell_h + dividers
const OPEN_H = ROW_COUNT * CELL_H + DIVIDER * (ROW_COUNT + 1) + 36; // 36 for col headers

function DrawerPanel({ index, reminders }: { index: number; reminders: Reminder[] }) {
  const [open, setOpen] = useState(false);
  const anim   = useMemo(() => new Animated.Value(CLOSED_H), []);
  const rotate = useMemo(() => new Animated.Value(0), []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    Animated.parallel([
      Animated.spring(anim,   { toValue: next ? OPEN_H : CLOSED_H, tension: 50, friction: 10, useNativeDriver: false }),
      Animated.timing(rotate, { toValue: next ? 1 : 0, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  const chevron = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  const slotMap = new Map<number, Reminder>();
  reminders.forEach((r, i) => { if (i < SLOTS) slotMap.set(i, r); });

  return (
    <View style={s.cabinet}>
      {/* Header row */}
      <TouchableOpacity style={s.header} onPress={toggle} activeOpacity={0.85}>
        <View style={s.headerLeft}>
          <Ionicons name="layers-outline" size={17} color="#76FF03" style={{ marginRight: 8 }} />
          <Text style={s.headerTitle}>Drawer {index + 1}</Text>
          <Text style={s.headerCount}>{Math.min(reminders.length, SLOTS)}/{SLOTS} active</Text>
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
              const idx = ri * COL_COUNT + ci;
              return (
                <Cell
                  key={col}
                  col={col}
                  row={row}
                  active={slotMap.has(idx)}
                  reminder={slotMap.get(idx)}
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
export default function DispenserView({ reminders }: { reminders: Reminder[] }) {
  return (
    <View style={{ marginBottom: 16, alignItems: 'center' }}>
      <Text style={s.sectionLbl}>DISPENSER COMPARTMENTS</Text>
      <DrawerPanel index={0} reminders={reminders.slice(0, SLOTS)} />
      <DrawerPanel index={1} reminders={reminders.slice(SLOTS, SLOTS * 2)} />
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
  cellTime: {
    fontSize: 9, fontWeight: '800', color: '#76FF03',
    textAlign: 'center', lineHeight: 12,
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
