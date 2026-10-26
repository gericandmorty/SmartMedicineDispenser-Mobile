import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  setSolenoidLock,
  pulseUnlockSolenoid,
} from '../../services/hardware';
import {
  seedPhasedOutMedicineData,
  recordColumnRefill,
  clearAllMedicineData,
} from '../../services/storage';
import { useReminders } from '../../hooks/useReminders';

export default function SettingsScreen() {
  const { triggerManualTestAlert, clearAll, refresh } = useReminders();

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Solenoid control states
  const [solenoidOpen, setSolenoidOpen] = useState(false);
  const [targetDrawer, setTargetDrawer] = useState<0 | 1 | 2>(0); // 0 = Both, 1 = Drawer 1, 2 = Drawer 2
  const [solenoidLoading, setSolenoidLoading] = useState(false);
  const [pulsing, setPulsing] = useState(false);

  // Toggle Solenoid Lock ON / OFF
  const handleToggleSolenoid = async (unlock: boolean) => {
    setSolenoidLoading(true);
    setSolenoidOpen(unlock);

    const drawerLabel =
      targetDrawer === 1 ? 'Drawer 1' : targetDrawer === 2 ? 'Drawer 2' : 'Both Drawers';

    try {
      const success = await setSolenoidLock(targetDrawer, unlock);
      if (success) {
        Alert.alert(
          unlock ? '🔓 Solenoid Unlocked' : '🔒 Solenoid Locked',
          `${drawerLabel} solenoid is now ${unlock ? 'UNLOCKED / OPEN' : 'LOCKED'}.`
        );
      } else {
        Alert.alert(
          '⚠️ Notice',
          `Solenoid command sent for ${drawerLabel} (${unlock ? 'Unlock' : 'Lock'}). Ensure hardware is powered on and connected to Wi-Fi.`
        );
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to toggle solenoid.');
    } finally {
      setSolenoidLoading(false);
    }
  };

  // 5-second pulse unlock
  const handlePulseUnlock = async () => {
    setPulsing(true);
    const drawerLabel =
      targetDrawer === 1 ? 'Drawer 1' : targetDrawer === 2 ? 'Drawer 2' : 'Both Drawers';

    try {
      await pulseUnlockSolenoid(targetDrawer);
      Alert.alert(
        '⚡ Solenoid Quick Unlock (5s)',
        `${drawerLabel} solenoid unlocked for 5 seconds. It will automatically relock.`
      );
    } catch {
      Alert.alert('Notice', `Sent 5-second unlock pulse to ${drawerLabel}.`);
    } finally {
      setPulsing(false);
    }
  };

  const handleSeedPhasedOut = async () => {
    await seedPhasedOutMedicineData();
    await refresh();
    Alert.alert(
      '📦 0/7 Doses Inserted & Push Notification Sent',
      'Drawer 1 Column A now has 0/7 doses remaining.\n\nA push notification was triggered to your phone\'s notification bar!'
    );
  };

  const handleResetStock = async () => {
    await recordColumnRefill(1, 'A');
    await refresh();
    Alert.alert('🔄 Stock Reset', 'Drawer 1 Column A refilled to 7/7 doses.');
  };

  const handleClearDatabase = async () => {
    Alert.alert(
      'Clear SQLite Database',
      'Are you sure you want to clear all reminders and history from the SQLite database? This will completely wipe stale and active schedules.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await clearAll();
            Alert.alert('Database Cleared', 'All reminders and dose history have been cleared.');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* ── Solenoid Lock Control Section ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dispenser Hardware Controls</Text>

          <View style={styles.card}>
            {/* Master Solenoid Switch Row */}
            <View style={styles.solenoidHeaderRow}>
              <View style={styles.settingLeft}>
                <View
                  style={[
                    styles.iconBox,
                    solenoidOpen ? styles.iconBoxOpen : styles.iconBoxLocked,
                  ]}
                >
                  <Ionicons
                    name={solenoidOpen ? 'lock-open' : 'lock-closed'}
                    size={22}
                    color={solenoidOpen ? '#D97706' : '#2E7D32'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.labelRow}>
                    <Text style={styles.settingLabel}>Solenoid Lock Switch</Text>
                    <View
                      style={[
                        styles.statusBadge,
                        solenoidOpen ? styles.badgeOpen : styles.badgeLocked,
                      ]}
                    >
                      <View
                        style={[
                          styles.statusDot,
                          solenoidOpen ? styles.dotOpen : styles.dotLocked,
                        ]}
                      />
                      <Text
                        style={[
                          styles.statusBadgeText,
                          solenoidOpen ? styles.badgeTextOpen : styles.badgeTextLocked,
                        ]}
                      >
                        {solenoidOpen ? 'UNLOCKED / OPEN' : 'LOCKED'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.settingDesc}>
                    {solenoidOpen
                      ? 'Solenoid is energized and drawer is open for medicine retrieval.'
                      : 'Switch ON to energize and unlock the dispenser solenoid.'}
                  </Text>
                </View>
              </View>

              <Switch
                value={solenoidOpen}
                onValueChange={handleToggleSolenoid}
                disabled={solenoidLoading}
                trackColor={{ false: '#E0E0E0', true: '#FDE68A' }}
                thumbColor={solenoidOpen ? '#F59E0B' : '#757575'}
              />
            </View>

            {solenoidLoading && (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#F59E0B" />
                <Text style={styles.loadingText}>Updating solenoid relay state...</Text>
              </View>
            )}

            {/* Drawer Selection Chips */}
            <View style={styles.drawerSelectorContainer}>
              <Text style={styles.selectorLabel}>Target Drawer:</Text>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, targetDrawer === 0 && styles.chipActive]}
                  onPress={() => setTargetDrawer(0)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, targetDrawer === 0 && styles.chipTextActive]}>
                    Both Drawers
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.chip, targetDrawer === 1 && styles.chipActive]}
                  onPress={() => setTargetDrawer(1)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, targetDrawer === 1 && styles.chipTextActive]}>
                    Drawer 1 (Pin 8)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.chip, targetDrawer === 2 && styles.chipActive]}
                  onPress={() => setTargetDrawer(2)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, targetDrawer === 2 && styles.chipTextActive]}>
                    Drawer 2 (Pin 9)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Quick 5-Second Pulse Button */}
            <TouchableOpacity
              style={styles.pulseBtn}
              onPress={handlePulseUnlock}
              disabled={pulsing}
              activeOpacity={0.8}
            >
              <Ionicons name="flash-outline" size={17} color="#B45309" style={{ marginRight: 6 }} />
              <Text style={styles.pulseBtnText}>
                {pulsing ? 'Unlocking for 5s...' : '⚡ Quick Unlock (5 Seconds Pulse)'}
              </Text>
            </TouchableOpacity>

            {/* Test Flashing Medication Alert Modal Button */}
            <TouchableOpacity
              style={styles.testModalBtn}
              onPress={() => triggerManualTestAlert()}
              activeOpacity={0.8}
            >
              <Ionicons name="alarm" size={17} color="#15803D" style={{ marginRight: 6 }} />
              <Text style={styles.testModalBtnText}>
                🚨 Test Medicine Alarm (Flashing Modal)
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Notifications ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={styles.iconBox}>
                <Ionicons name="notifications-outline" size={20} color="#4CAF50" />
              </View>
              <View>
                <Text style={styles.settingLabel}>Enable Notifications</Text>
                <Text style={styles.settingDesc}>Receive daily medicine reminders</Text>
              </View>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: '#E0E0E0', true: '#A5D6A7' }}
              thumbColor={notificationsEnabled ? '#4CAF50' : '#BDBDBD'}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={styles.iconBox}>
                <Ionicons name="volume-high-outline" size={20} color="#4CAF50" />
              </View>
              <View>
                <Text style={styles.settingLabel}>Sound</Text>
                <Text style={styles.settingDesc}>Play sound with notifications</Text>
              </View>
            </View>
            <Switch
              value={soundEnabled}
              onValueChange={setSoundEnabled}
              trackColor={{ false: '#E0E0E0', true: '#A5D6A7' }}
              thumbColor={soundEnabled ? '#4CAF50' : '#BDBDBD'}
            />
          </View>
        </View>

        {/* ── SQLite Database & Stock Simulation ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SQLite Database & Stock Simulation</Text>
          <View style={styles.card}>
            <Text style={styles.settingLabel}>Medicine Stock Simulation</Text>
            <Text style={styles.settingDesc}>
              Insert mock history to test the 0/7 doses &quot;Out of Stock&quot; notification, red badges, and refilled flow directly in SQLite.
            </Text>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}
              onPress={handleSeedPhasedOut}
              activeOpacity={0.8}
            >
              <Ionicons name="flask-outline" size={17} color="#B91C1C" style={{ marginRight: 8 }} />
              <Text style={[styles.actionBtnText, { color: '#B91C1C' }]}>
                Insert 0/7 Doses (Phased Out Demo)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { marginTop: 8 }]}
              onPress={handleResetStock}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={17} color="#1B5E20" style={{ marginRight: 8 }} />
              <Text style={styles.actionBtnText}>
                Reset Column A to 7/7 Doses
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB', marginTop: 8 }]}
              onPress={handleClearDatabase}
              activeOpacity={0.8}
            >
              <Ionicons name="trash-outline" size={17} color="#4B5563" style={{ marginRight: 8 }} />
              <Text style={[styles.actionBtnText, { color: '#4B5563' }]}>
                Clear All SQLite Records
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── About ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={styles.iconBox}>
                <Ionicons name="medical-outline" size={20} color="#4CAF50" />
              </View>
              <View>
                <Text style={styles.settingLabel}>Medicine Reminder</Text>
                <Text style={styles.settingDesc}>Version 1.0.0 (Smart Dispenser)</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F0E8' },
  header: {
    alignItems: 'center',
    paddingTop: 20,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#212121',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
  },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9E9E9E',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
    paddingLeft: 4,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxOpen: {
    backgroundColor: '#FEF3C7',
  },
  iconBoxLocked: {
    backgroundColor: '#E8F5E9',
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#212121',
  },
  settingDesc: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
    lineHeight: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  solenoidHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgeOpen: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  badgeLocked: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 5,
  },
  dotOpen: {
    backgroundColor: '#D97706',
  },
  dotLocked: {
    backgroundColor: '#2E7D32',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  badgeTextOpen: {
    color: '#92400E',
  },
  badgeTextLocked: {
    color: '#1B5E20',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
  },
  drawerSelectorContainer: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0EBE1',
  },
  selectorLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#616161',
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#757575',
  },
  chipTextActive: {
    color: '#1B5E20',
    fontWeight: '700',
  },
  pulseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  pulseBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B45309',
  },
  testModalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  testModalBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#15803D',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#A5D6A7',
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1B5E20',
  },
});
