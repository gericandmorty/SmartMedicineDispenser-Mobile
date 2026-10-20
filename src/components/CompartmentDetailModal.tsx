import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Reminder, ColumnStockStatus } from '../types/reminder';

interface Props {
  visible: boolean;
  drawerIndex: number; // 0 or 1
  col: string;         // 'A' - 'G'
  row: string;         // '1' - '3'
  reminder?: Reminder;
  stockStatus?: ColumnStockStatus;
  onClose: () => void;
  onDispense: (reminder: Reminder) => void;
  onChangeTime: (reminder: Reminder) => void;
  onDelete: (id: string) => void;
  onRefill?: (drawer: number, column: string) => void;
}

export default function CompartmentDetailModal({
  visible,
  drawerIndex,
  col,
  row,
  reminder,
  stockStatus,
  onClose,
  onDispense,
  onChangeTime,
  onDelete,
  onRefill,
}: Props) {
  const animFade = useRef(new Animated.Value(0)).current;
  const animScale = useRef(new Animated.Value(0.92)).current;
  const animTranslateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(animFade, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(animScale, {
          toValue: 1,
          tension: 80,
          friction: 9,
          useNativeDriver: true,
        }),
        Animated.spring(animTranslateY, {
          toValue: 0,
          tension: 80,
          friction: 9,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      animFade.setValue(0);
      animScale.setValue(0.92);
      animTranslateY.setValue(20);
    }
  }, [visible, animFade, animScale, animTranslateY]);

  if (!visible || !reminder) return null;

  const timeFormatted = `${String(reminder.hour).padStart(2, '0')}:${String(reminder.minute).padStart(2, '0')} ${reminder.amPm}`;
  const isDaily = !reminder.date || reminder.recurrence === 'every-day';
  const recurrenceText = isDaily ? 'Every day' : `One-time on ${reminder.date}`;

  // Stock calculations
  const remaining = stockStatus?.remainingDoses ?? 7;
  const total = stockStatus?.cycleDays ?? 7;
  const pct = Math.max(0, Math.min(100, Math.round((remaining / total) * 100)));
  const isOut = stockStatus?.isOutOfStock ?? false;
  const isLow = stockStatus?.isLowStock ?? false;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <Animated.View
          style={[
            styles.card,
            {
              opacity: animFade,
              transform: [{ scale: animScale }, { translateY: animTranslateY }],
            },
          ]}
        >
          {/* Header Bar */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.slotBadge}>
                <View style={styles.ledDot} />
                <Text style={styles.slotBadgeText}>
                  Drawer {drawerIndex + 1} • {col}{row}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {/* Time & Schedule Details Hero */}
          <View style={styles.timeHero}>
            <View style={styles.timeIconWrap}>
              <Ionicons name="alarm-outline" size={26} color="#166534" />
            </View>
            <View style={styles.timeTextCol}>
              <Text style={styles.timeBig}>{timeFormatted}</Text>
              <View style={styles.recurrenceRow}>
                <Ionicons
                  name={isDaily ? 'repeat-outline' : 'calendar-outline'}
                  size={13}
                  color="#15803D"
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.recurrenceLabel}>{recurrenceText}</Text>
              </View>
            </View>
          </View>

          {/* Stock & Inventory Card */}
          <View style={styles.stockCard}>
            <View style={styles.stockHeader}>
              <View style={styles.stockTitleWrap}>
                <Ionicons name="medkit-outline" size={15} color="#374151" style={{ marginRight: 5 }} />
                <Text style={styles.stockTitle}>Column {col} Medicine Stock</Text>
              </View>

              <View
                style={[
                  styles.stockBadge,
                  isOut ? styles.badgeOut : isLow ? styles.badgeLow : styles.badgeOk,
                ]}
              >
                <Text
                  style={[
                    styles.stockBadgeText,
                    isOut ? styles.textOut : isLow ? styles.textLow : styles.textOk,
                  ]}
                >
                  {isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock'}
                </Text>
              </View>
            </View>

            {/* Visual Pill Progress Bar */}
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressBar,
                  { width: `${pct}%` },
                  isOut ? styles.barOut : isLow ? styles.barLow : styles.barOk,
                ]}
              />
            </View>

            <View style={styles.stockSubRow}>
              <Text style={styles.stockCountText}>
                <Text style={styles.boldNum}>{remaining}</Text> of {total} doses remaining
              </Text>
              {stockStatus?.nextRestockDate ? (
                <Text style={styles.stockDateText}>
                  Refill by: {stockStatus.nextRestockDate}
                </Text>
              ) : null}
            </View>

            {/* Quick Refill Button if Low or Empty */}
            {(isLow || isOut) && onRefill && (
              <TouchableOpacity
                style={styles.refillBtn}
                onPress={() => onRefill(drawerIndex + 1, col)}
                activeOpacity={0.8}
              >
                <Ionicons name="refresh" size={13} color="#15803D" style={{ marginRight: 5 }} />
                <Text style={styles.refillBtnText}>Mark Column {col} as Refilled (7/7)</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Primary Action: Dispense Now */}
          <TouchableOpacity
            style={styles.dispensePrimaryBtn}
            onPress={() => {
              onClose();
              onDispense(reminder);
            }}
            activeOpacity={0.85}
          >
            <View style={styles.flashIconBg}>
              <Ionicons name="flash" size={16} color="#FFFFFF" />
            </View>
            <Text style={styles.dispenseBtnText}>DISPENSE NOW</Text>
          </TouchableOpacity>

          {/* Secondary Actions: Change Time & Delete */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => {
                onClose();
                onChangeTime(reminder);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="create-outline" size={16} color="#166534" style={{ marginRight: 6 }} />
              <Text style={styles.editBtnText}>Change Time</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => {
                onClose();
                onDelete(reminder.id);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={16} color="#DC2626" style={{ marginRight: 5 }} />
              <Text style={styles.deleteBtnText}>Remove</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  slotBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  ledDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
    marginRight: 6,
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 3,
    elevation: 2,
  },
  slotBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F2937',
    letterSpacing: 0.3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeHero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  timeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  timeTextCol: {
    flex: 1,
  },
  timeBig: {
    fontSize: 26,
    fontWeight: '800',
    color: '#14532D',
    letterSpacing: -0.5,
  },
  recurrenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  recurrenceLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#166534',
  },
  stockCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    marginBottom: 16,
  },
  stockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  stockTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stockTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  stockBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeOk: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  badgeLow: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  badgeOut: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  stockBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  textOk: { color: '#15803D' },
  textLow: { color: '#B45309' },
  textOut: { color: '#B91C1C' },
  progressTrack: {
    width: '100%',
    height: 7,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  barOk: { backgroundColor: '#22C55E' },
  barLow: { backgroundColor: '#F59E0B' },
  barOut: { backgroundColor: '#EF4444' },
  stockSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stockCountText: {
    fontSize: 12,
    color: '#4B5563',
  },
  boldNum: {
    fontWeight: '800',
    color: '#111827',
  },
  stockDateText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6B7280',
  },
  refillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 10,
    paddingVertical: 7,
    marginTop: 10,
  },
  refillBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  dispensePrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2E9E4B',
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 10,
    shadowColor: '#2E9E4B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  flashIconBg: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  dispenseBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    paddingVertical: 11,
  },
  editBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  deleteBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
});
