import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Switch,
  Platform,
  Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Reminder } from '../types/reminder';
import { setSolenoidLock } from '../services/hardware';
import { computeTargetTriggerEpoch } from '../services/medicationLogic';

interface Props {
  visible: boolean;
  reminder: Reminder | null;
  onConfirmDose: (reminder: Reminder) => void;
  onMissedDose?: (reminder: Reminder) => void;
  onDismiss: () => void;
}

const TOTAL_GRACE_PERIOD_SEC = 1200; // 20 minutes grace period per spec

export default function MedicationAlertModal({
  visible,
  reminder,
  onConfirmDose,
  onMissedDose,
  onDismiss,
}: Props) {
  // Animation values
  const flashAnim = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const beaconScale = useRef(new Animated.Value(1)).current;
  const beaconOpacity = useRef(new Animated.Value(0.8)).current;
  const modalScale = useRef(new Animated.Value(0.9)).current;
  const modalFade = useRef(new Animated.Value(0)).current;

  // Solenoid switch state
  const [solenoidOpen, setSolenoidOpen] = useState(true);
  const [solenoidLoading, setSolenoidLoading] = useState(false);

  // Missed dose state & Countdown timer (20 minutes)
  const [isMissed, setIsMissed] = useState(false);
  const [remainingSec, setRemainingSec] = useState(TOTAL_GRACE_PERIOD_SEC);

  // Determine drawer from compartment label
  const compLabel = reminder?.compartment || 'Drawer 1 (A1)';
  const drawerNum: 1 | 2 = compLabel.includes('Drawer 2') ? 2 : 1;

  // Format time
  const timeFormatted = reminder
    ? reminder.second !== undefined && reminder.second > 0
      ? `${String(reminder.hour).padStart(2, '0')}:${String(reminder.minute).padStart(2, '0')}:${String(reminder.second).padStart(2, '0')} ${reminder.amPm}`
      : `${String(reminder.hour).padStart(2, '0')}:${String(reminder.minute).padStart(2, '0')} ${reminder.amPm}`
    : '--:--';

  // Flashing & Pulsing Loop + Countdown
  useEffect(() => {
    let flashLoop: Animated.CompositeAnimation | null = null;
    let beaconLoop: Animated.CompositeAnimation | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    if (visible && reminder) {
      // Calculate remaining grace period
      const triggerEpochMs = computeTargetTriggerEpoch(reminder, new Date());
      const diffMs = Date.now() - triggerEpochMs;
      const initialRemaining = Math.max(0, Math.floor((TOTAL_GRACE_PERIOD_SEC * 1000 - diffMs) / 1000));
      const alreadyMissed = diffMs > TOTAL_GRACE_PERIOD_SEC * 1000;

      if (alreadyMissed || initialRemaining <= 0) {
        setIsMissed(true);
        setRemainingSec(0);
        setSolenoidOpen(false);
        setSolenoidLock(drawerNum, false).catch(() => {});
        onMissedDose?.(reminder);
      } else {
        setIsMissed(false);
        setRemainingSec(initialRemaining);
        // Auto-unlock solenoid when medication alert fires within grace period
        setSolenoidOpen(true);
        setSolenoidLock(drawerNum, true).catch(() => {});
      }

      // Haptic/vibration feedback
      if (Platform.OS !== 'web') {
        try {
          Vibration.vibrate([0, 500, 250, 500, 250, 500]);
        } catch {}
      }

      // Entrance animation
      Animated.parallel([
        Animated.timing(modalFade, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(modalScale, {
          toValue: 1,
          tension: 70,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();

      // Flashing alert color cycle
      flashLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(flashAnim, {
            toValue: 1,
            duration: 450,
            useNativeDriver: false,
          }),
          Animated.timing(flashAnim, {
            toValue: 0,
            duration: 450,
            useNativeDriver: false,
          }),
        ])
      );
      flashLoop.start();

      // Pulsing Icon Beacon
      beaconLoop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseScale, {
              toValue: 1.15,
              duration: 450,
              useNativeDriver: true,
            }),
            Animated.timing(pulseScale, {
              toValue: 1,
              duration: 450,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(beaconScale, {
              toValue: 1.6,
              duration: 900,
              useNativeDriver: true,
            }),
            Animated.timing(beaconScale, {
              toValue: 1,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(beaconOpacity, {
              toValue: 0,
              duration: 900,
              useNativeDriver: true,
            }),
            Animated.timing(beaconOpacity, {
              toValue: 0.8,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      beaconLoop.start();

      // Grace period 20-min countdown timer
      if (!alreadyMissed && initialRemaining > 0) {
        timer = setInterval(() => {
          setRemainingSec((prev) => {
            if (prev <= 1) {
              if (timer) clearInterval(timer);
              setIsMissed(true);
              setSolenoidOpen(false);
              setSolenoidLock(drawerNum, false).catch(() => {});
              onMissedDose?.(reminder);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    } else {
      modalFade.setValue(0);
      modalScale.setValue(0.9);
      flashAnim.setValue(0);
      setIsMissed(false);
    }

    return () => {
      if (flashLoop) flashLoop.stop();
      if (beaconLoop) beaconLoop.stop();
      if (timer) clearInterval(timer);
    };
  }, [visible, reminder, drawerNum, onMissedDose]);

  // Handle Solenoid toggle switch
  const handleToggleSolenoid = async (val: boolean) => {
    setSolenoidLoading(true);
    setSolenoidOpen(val);
    try {
      await setSolenoidLock(drawerNum, val);
    } catch {}
    setSolenoidLoading(false);
  };

  if (!visible || !reminder) return null;

  // Interpolated flashing border and banner colors
  const borderFlashColor = flashAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['#10B981', '#F59E0B', '#EF4444'],
  });

  const bannerFlashBg = flashAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['#DCFCE7', '#FEF3C7', '#FEE2E2'],
  });

  const bannerFlashText = flashAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['#15803D', '#B45309', '#B91C1C'],
  });

  // Countdown calculations
  const minsLeft = Math.floor(remainingSec / 60);
  const secsLeft = remainingSec % 60;
  const progressPct = Math.max(0, Math.min(100, (remainingSec / TOTAL_GRACE_PERIOD_SEC) * 100));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View style={styles.scrim}>
        <Animated.View
          style={[
            styles.modalWrapper,
            {
              opacity: modalFade,
              transform: [{ scale: modalScale }],
            },
          ]}
        >
          <Animated.View
            style={[
              styles.modalCard,
              {
                borderColor: borderFlashColor,
              },
            ]}
          >
            {/* Top Banner (Flashing when alerting, Solid red when missed) */}
            <Animated.View
              style={[
                styles.flashBanner,
                isMissed
                  ? { backgroundColor: '#FEE2E2' }
                  : { backgroundColor: bannerFlashBg },
              ]}
            >
              <View
                style={[
                  styles.flashDot,
                  isMissed && { backgroundColor: '#DC2626' },
                ]}
              />
              <Animated.Text
                style={[
                  styles.flashBannerText,
                  isMissed
                    ? { color: '#B91C1C' }
                    : { color: bannerFlashText },
                ]}
              >
                {isMissed
                  ? '⚠️ 20 MINS PASSED — DOSAGE IS MISSED'
                  : '⏰ TIME TO TAKE YOUR MEDICINE!'}
              </Animated.Text>
              <View
                style={[
                  styles.flashDot,
                  isMissed && { backgroundColor: '#DC2626' },
                ]}
              />
            </Animated.View>

          {/* Animated Pulsing Beacon Icon */}
          <View style={styles.iconContainer}>
            <Animated.View
              style={[
                styles.beaconRing,
                isMissed && { backgroundColor: '#FECACA' },
                {
                  transform: [{ scale: beaconScale }],
                  opacity: beaconOpacity,
                },
              ]}
            />
            <Animated.View
              style={[
                styles.iconCircle,
                isMissed && { backgroundColor: '#DC2626', shadowColor: '#DC2626' },
                {
                  transform: [{ scale: pulseScale }],
                },
              ]}
            >
              <Ionicons
                name={isMissed ? 'close-circle' : 'medical'}
                size={42}
                color="#FFFFFF"
              />
            </Animated.View>
          </View>

          {/* Main Titles */}
          <Text style={[styles.headline, isMissed && { color: '#991B1B' }]}>
            {isMissed ? 'Dosage is Missed' : 'Medication Scheduled Now'}
          </Text>
          <Text style={styles.subheadline}>
            {isMissed
              ? '20 minutes have passed without intake. This scheduled dosage has been marked as missed.'
              : 'Please take your dose from the unlocked dispenser compartment.'}
          </Text>

          {/* Compartment & Schedule Highlight Card */}
          <View style={styles.detailsCard}>
            <View style={styles.detailRow}>
              <View style={styles.badgeLeft}>
                <Ionicons name="cube" size={20} color="#166534" />
                <Text style={styles.detailTitle}>Compartment</Text>
              </View>
              <View
                style={[
                  styles.compartmentChip,
                  isMissed && { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' },
                ]}
              >
                <View
                  style={[
                    styles.ledDotLive,
                    isMissed && { backgroundColor: '#DC2626' },
                  ]}
                />
                <Text
                  style={[
                    styles.compartmentText,
                    isMissed && { color: '#B91C1C' },
                  ]}
                >
                  {compLabel}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.detailRow}>
              <View style={styles.badgeLeft}>
                <Ionicons name="time" size={20} color="#166534" />
                <Text style={styles.detailTitle}>Scheduled Time</Text>
              </View>
              <Text style={styles.timeValueText}>{timeFormatted}</Text>
            </View>
          </View>

          {/* ── Solenoid Lock Control Switch ── */}
          <View style={styles.solenoidSwitchCard}>
            <View style={styles.solenoidLeft}>
              <View
                style={[
                  styles.solenoidIconBox,
                  solenoidOpen ? styles.solenoidOpenBg : styles.solenoidLockedBg,
                ]}
              >
                <Ionicons
                  name={solenoidOpen ? 'lock-open' : 'lock-closed'}
                  size={20}
                  color={solenoidOpen ? '#D97706' : '#4B5563'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.solenoidStatusRow}>
                  <Text style={styles.solenoidTitle}>Drawer Solenoid Lock</Text>
                  <View
                    style={[
                      styles.solenoidPill,
                      solenoidOpen ? styles.pillUnlocked : styles.pillLocked,
                    ]}
                  >
                    <Text
                      style={[
                        styles.solenoidPillText,
                        solenoidOpen ? styles.textUnlocked : styles.textLocked,
                      ]}
                    >
                      {solenoidOpen ? 'UNLOCKED / OPEN' : 'LOCKED'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.solenoidSubtitle}>
                  {solenoidOpen
                    ? `Drawer ${drawerNum} solenoid is energized & open.`
                    : `Drawer ${drawerNum} is locked.`}
                </Text>
              </View>
            </View>

            <Switch
              value={solenoidOpen}
              onValueChange={handleToggleSolenoid}
              disabled={solenoidLoading}
              trackColor={{ false: '#D1D5DB', true: '#FDE68A' }}
              thumbColor={solenoidOpen ? '#F59E0B' : '#9CA3AF'}
            />
          </View>

          {/* 20-Minute Countdown Bar */}
          <View style={styles.countdownSection}>
            <View style={styles.countdownRow}>
              <Text style={styles.countdownLabel}>Dispenser Grace Period:</Text>
              <Text
                style={[
                  styles.countdownDigits,
                  isMissed && { color: '#DC2626' },
                ]}
              >
                {isMissed
                  ? '00:00 (EXPIRED)'
                  : `${String(minsLeft).padStart(2, '0')}:${String(secsLeft).padStart(2, '0')}`}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressBar,
                  {
                    width: isMissed ? '100%' : `${progressPct}%`,
                    backgroundColor: isMissed
                      ? '#DC2626'
                      : remainingSec < 300
                      ? '#EF4444'
                      : '#10B981',
                  },
                ]}
              />
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionSection}>
            {isMissed ? (
              <>
                {/* Acknowledge Missed Dose */}
                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: '#DC2626', shadowColor: '#DC2626' }]}
                  onPress={onDismiss}
                  activeOpacity={0.85}
                >
                  <Ionicons name="checkmark-done" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.confirmBtnText}>ACKNOWLEDGE MISSED DOSE</Text>
                </TouchableOpacity>

                {/* Optional Late Intake */}
                <TouchableOpacity
                  style={styles.dismissBtn}
                  onPress={() => onConfirmDose(reminder)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="medkit-outline" size={17} color="#475569" style={{ marginRight: 6 }} />
                  <Text style={styles.dismissBtnText}>Take Anyway (Late Intake)</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* Primary: Confirm Taken */}
                <TouchableOpacity
                  style={styles.confirmBtn}
                  onPress={() => onConfirmDose(reminder)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="checkmark-circle" size={22} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.confirmBtnText}>I HAVE TAKEN THIS MEDICINE</Text>
                </TouchableOpacity>

                {/* Secondary: Dismiss / Snooze */}
                <TouchableOpacity
                  style={styles.dismissBtn}
                  onPress={onDismiss}
                  activeOpacity={0.7}
                >
                  <Ionicons name="alarm-outline" size={17} color="#6B7280" style={{ marginRight: 6 }} />
                  <Text style={styles.dismissBtnText}>Snooze / Remind Later</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalWrapper: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    borderWidth: 3.5,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
    elevation: 20,
  },
  flashBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginBottom: 16,
    gap: 8,
  },
  flashDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  flashBannerText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  iconContainer: {
    width: 90,
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  beaconRing: {
    position: 'absolute',
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: '#86EFAC',
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  headline: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subheadline: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 18,
    paddingHorizontal: 10,
  },
  detailsCard: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  badgeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  compartmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  ledDotLive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
    marginRight: 6,
  },
  compartmentText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#15803D',
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 8,
  },
  timeValueText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  solenoidSwitchCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
  },
  solenoidLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  solenoidIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  solenoidOpenBg: {
    backgroundColor: '#FEF3C7',
  },
  solenoidLockedBg: {
    backgroundColor: '#E5E7EB',
  },
  solenoidStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  solenoidTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#78350F',
  },
  solenoidPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  pillUnlocked: {
    backgroundColor: '#FDE68A',
  },
  pillLocked: {
    backgroundColor: '#E5E7EB',
  },
  solenoidPillText: {
    fontSize: 9,
    fontWeight: '900',
  },
  textUnlocked: {
    color: '#92400E',
  },
  textLocked: {
    color: '#4B5563',
  },
  solenoidSubtitle: {
    fontSize: 11,
    color: '#92400E',
    marginTop: 2,
  },
  countdownSection: {
    width: '100%',
    marginBottom: 18,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  countdownLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  countdownDigits: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  actionSection: {
    width: '100%',
    gap: 8,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16A34A',
    borderRadius: 16,
    paddingVertical: 14,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  dismissBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    paddingVertical: 10,
  },
  dismissBtnText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
  },
});
