import React, { useMemo, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { Reminder, AmPm, DoseEvent } from '../types/reminder';
import { triggerHardwareDispense } from '../services/hardware';
import { calculateColumnStock } from '../services/medicationLogic';
import { Ionicons } from '@expo/vector-icons';
import CompartmentDetailModal from './CompartmentDetailModal';

const CELL_H      = 74;               // Cell height
const ROW_LABEL_W = 16;
const COL_COUNT   = 7;
const ROW_COUNT   = 3;
const DIVIDER     = 3;                // gap between cells
const SLOTS       = COL_COUNT * ROW_COUNT; // 21 slots per drawer

const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const ROWS = ['1', '2', '3'];

// ─── Pulsing LED ─────────────────────────────────────────────────────────────
function LED({ active, isOutOfStock }: { active: boolean; isOutOfStock?: boolean }) {
  const ring  = useMemo(() => new Animated.Value(1), []);
  const ringO = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    if (!active) { ring.setValue(1); ringO.setValue(0); return; }
    ringO.setValue(0.5);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(ring,  { toValue: 2.2, duration: 850, useNativeDriver: true }),
        Animated.timing(ring,  { toValue: 1,   duration: 850, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [active, ring, ringO]);

  const DOT = 8;
  const pulseColor = isOutOfStock ? '#EF4444' : '#4CAF50';
  const dotColor = isOutOfStock ? '#FF5252' : '#76FF03';

  return (
    <View style={{ width: DOT, height: DOT, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
      <Animated.View style={{
        position: 'absolute',
        width: DOT, height: DOT, borderRadius: DOT / 2,
        backgroundColor: pulseColor,
        transform: [{ scale: ring }],
        opacity: ringO,
      }} />
      <View style={{
        width: DOT, height: DOT, borderRadius: DOT / 2,
        backgroundColor: active ? dotColor : '#555555',
        shadowColor: active ? dotColor : 'transparent',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: active ? 0.9 : 0,
        shadowRadius: 4,
        elevation: active ? 3 : 0,
      }} />
    </View>
  );
}

// ─── Single cell ──────────────────────────────────────────────────────────────
function Cell({
  col,
  row,
  active,
  isOutOfStock,
  reminder,
  onPress,
}: {
  col: string;
  row: string;
  active: boolean;
  isOutOfStock?: boolean;
  reminder?: Reminder;
  onPress: () => void;
}) {
  const timeStr = reminder
    ? `${String(reminder.hour).padStart(2, '0')}:${String(reminder.minute).padStart(2, '0')}`
    : '';
  const amPm = reminder?.amPm ?? '';

  return (
    <TouchableOpacity
      style={[
        s.cell,
        active && (isOutOfStock ? s.cellOutOfStock : s.cellActive),
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      delayPressIn={0}
      hitSlop={{ top: 4, bottom: 4, left: 1, right: 1 }}
      accessibilityRole="button"
      accessibilityLabel={`Compartment ${col}${row}${isOutOfStock ? ' (Out of stock)' : ''}`}
    >
      <View style={s.cellHeader} pointerEvents="none">
        <Text
          style={[
            s.cellLbl,
            active && (isOutOfStock ? s.cellLblOutOfStock : s.cellLblActive),
          ]}
        >
          {col}{row}
        </Text>
        <LED active={active} isOutOfStock={isOutOfStock} />
      </View>

      {active ? (
        <View style={s.cellBody} pointerEvents="none">
          <Text
            style={[
              s.cellTime,
              isOutOfStock && s.cellTimeOutOfStock,
            ]}
            numberOfLines={1}
          >
            {timeStr}
          </Text>
          <Text
            style={[
              s.cellAmPm,
              isOutOfStock && s.cellAmPmOutOfStock,
            ]}
            numberOfLines={1}
          >
            {isOutOfStock ? 'EMPTY' : amPm}
          </Text>
        </View>
      ) : (
        <View style={s.addIconWrap} pointerEvents="none">
          <Ionicons name="add" size={12} color="#777" />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────
const CLOSED_H = 0;
// Generous height to prevent clipping on any Android screen density
const OPEN_H = ROW_COUNT * CELL_H + DIVIDER * (ROW_COUNT + 1) + 48;

export interface CompartmentScheduleParams {
  compartment: string;
  slotIndex: number;
  hour?: number;
  minute?: number;
  second?: number;
  amPm?: AmPm;
  date?: string;
  reminderId?: string;
}

interface DrawerProps {
  index: number;
  allReminders: Reminder[];
  doseHistory?: DoseEvent[];
  onOpenSetSchedule?: (params: CompartmentScheduleParams) => void;
  onSelectCell: (drawerIndex: number, col: string, row: string, reminder: Reminder) => void;
}

function DrawerPanel({ index, allReminders, doseHistory, onOpenSetSchedule, onSelectCell }: DrawerProps) {
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

  // Map slots for this drawer (index 0: slots 0..20, index 1: slots 21..41)
  const drawerBaseIndex = index * SLOTS;

  // Find active count for this drawer
  const drawerActiveCount = useMemo(() => {
    return allReminders.filter((r) => {
      if (r.compartment) {
        return r.compartment.startsWith(`Drawer ${index + 1}`);
      }
      if (r.slotIndex !== undefined) {
        return r.slotIndex >= drawerBaseIndex && r.slotIndex < drawerBaseIndex + SLOTS;
      }
      return false;
    }).length;
  }, [allReminders, index, drawerBaseIndex]);

  const handleCellPress = (col: string, row: string, ri: number, ci: number) => {
    const slotInDrawer = ri * COL_COUNT + ci;
    const globalSlotIndex = drawerBaseIndex + slotInDrawer;
    const compartmentLabel = `Drawer ${index + 1} (${col}${row})`;

    // Check if slot has reminder (match compartment label first)
    const existing = allReminders.find((r) => {
      if (r.compartment) return r.compartment === compartmentLabel;
      if (r.slotIndex !== undefined) return r.slotIndex === globalSlotIndex;
      return false;
    });

    if (existing) {
      onSelectCell(index, col, row, existing);
    } else {
      if (onOpenSetSchedule) {
        onOpenSetSchedule({
          compartment: compartmentLabel,
          slotIndex: globalSlotIndex,
        });
      } else {
        router.push({
          pathname: '/set-time',
          params: {
            compartment: compartmentLabel,
            slotIndex: String(globalSlotIndex),
          },
        });
      }
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

      {/* Expandable grid with visible overflow when open for flawless Android touch response */}
      <Animated.View style={{ height: anim, overflow: open ? 'visible' : 'hidden' }}>
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
                if (r.compartment) return r.compartment === compartmentLabel;
                if (r.slotIndex !== undefined) return r.slotIndex === globalSlotIndex;
                return false;
              });

              const isOutOfStock = reminder
                ? calculateColumnStock(reminder, doseHistory).isOutOfStock
                : false;

              return (
                <Cell
                  key={col}
                  col={col}
                  row={row}
                  active={!!reminder}
                  isOutOfStock={isOutOfStock}
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
  doseHistory,
  onDeleteReminder,
  onOpenSetSchedule,
  onRefillColumn,
}: {
  reminders: Reminder[];
  doseHistory?: DoseEvent[];
  onDeleteReminder?: (id: string) => void;
  onOpenSetSchedule?: (params: CompartmentScheduleParams) => void;
  onRefillColumn?: (drawer: number, column: string) => void;
}) {
  const [selectedCell, setSelectedCell] = useState<{
    drawerIndex: number;
    col: string;
    row: string;
    reminder: Reminder;
  } | null>(null);

  const selectedStock = useMemo(() => {
    if (!selectedCell?.reminder) return undefined;
    return calculateColumnStock(selectedCell.reminder, doseHistory);
  }, [selectedCell, doseHistory]);

  return (
    <View style={{ marginBottom: 16, width: '100%' }}>
      <Text style={s.sectionLbl}>DISPENSER COMPARTMENTS (TAP CELL TO ADD)</Text>
      <DrawerPanel
        index={0}
        allReminders={reminders}
        doseHistory={doseHistory}
        onOpenSetSchedule={onOpenSetSchedule}
        onSelectCell={(d, c, r, rem) => setSelectedCell({ drawerIndex: d, col: c, row: r, reminder: rem })}
      />
      <DrawerPanel
        index={1}
        allReminders={reminders}
        doseHistory={doseHistory}
        onOpenSetSchedule={onOpenSetSchedule}
        onSelectCell={(d, c, r, rem) => setSelectedCell({ drawerIndex: d, col: c, row: r, reminder: rem })}
      />

      <CompartmentDetailModal
        visible={selectedCell !== null}
        drawerIndex={selectedCell?.drawerIndex ?? 0}
        col={selectedCell?.col ?? 'A'}
        row={selectedCell?.row ?? '1'}
        reminder={selectedCell?.reminder}
        stockStatus={selectedStock}
        onClose={() => setSelectedCell(null)}
        onDispense={(rem) => triggerHardwareDispense(rem)}
        onChangeTime={(rem) => {
          const cell = selectedCell;
          setSelectedCell(null);
          if (onOpenSetSchedule && cell) {
            onOpenSetSchedule({
              compartment: rem.compartment || `Drawer ${cell.drawerIndex + 1} (${cell.col}${cell.row})`,
              slotIndex: rem.slotIndex ?? 0,
              hour: rem.hour,
              minute: rem.minute,
              second: rem.second,
              amPm: rem.amPm,
              date: rem.date ?? '',
              reminderId: rem.id,
            });
          }
        }}
        onDelete={(id) => {
          setSelectedCell(null);
          if (onDeleteReminder) onDeleteReminder(id);
        }}
        onRefill={(drawer, column) => {
          if (onRefillColumn) onRefillColumn(drawer, column);
        }}
      />
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
    width: '100%',
    backgroundColor: '#363636',
    borderRadius: 16,
    marginBottom: 14,
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
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: DIVIDER,
  },
  colLbl: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11, fontWeight: '800', color: '#76FF03', letterSpacing: 0.5,
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
    fontSize: 11, fontWeight: '800', color: '#76FF03',
  },

  // Cell
  cell: {
    flex: 1,
    height: CELL_H,
    marginHorizontal: DIVIDER / 2,
    backgroundColor: '#444444',
    borderRadius: 8,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cellHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 2,
  },
  cellActive: {
    backgroundColor: '#0A290C',
    borderWidth: 1.5,
    borderColor: '#4CAF50',
  },
  cellOutOfStock: {
    backgroundColor: '#2D0A0A',
    borderWidth: 1.5,
    borderColor: '#EF4444',
  },
  cellLbl: {
    fontSize: 8.5, fontWeight: '700', color: '#888',
  },
  cellLblActive: {
    color: '#76FF03',
  },
  cellLblOutOfStock: {
    color: '#FCA5A5',
  },
  cellBody: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  cellTime: {
    fontSize: 8.5, fontWeight: '800', color: '#76FF03',
    textAlign: 'center',
    lineHeight: 11,
  },
  cellTimeOutOfStock: {
    color: '#FF6B6B',
  },
  cellAmPm: {
    fontSize: 7.5, fontWeight: '700', color: '#4CAF50',
    textAlign: 'center',
    marginTop: 1,
  },
  cellAmPmOutOfStock: {
    color: '#EF4444',
    fontSize: 7,
    fontWeight: '800',
  },
  addIconWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
