import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Switch,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getArduinoIP,
  saveArduinoIP,
  pingArduino,
  triggerVibrateESP32,
  DEFAULT_ARDUINO_IP,
} from '../../services/hardware';
import {
  seedPhasedOutMedicineData,
  recordColumnRefill,
  clearAllMedicineData,
} from '../../services/storage';

export default function SettingsScreen() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [arduinoIp, setArduinoIp] = useState(DEFAULT_ARDUINO_IP);
  const [pinging, setPinging] = useState(false);
  const [vibrating, setVibrating] = useState(false);

  useEffect(() => {
    getArduinoIP().then(setArduinoIp);
  }, []);

  const handleSaveIp = async () => {
    await saveArduinoIP(arduinoIp);
    Alert.alert('IP Saved', `Device IP updated to: ${arduinoIp}`);
  };

  const handleTestConnection = async () => {
    setPinging(true);
    const success = await pingArduino(arduinoIp);
    setPinging(false);
    if (success) {
      Alert.alert('✅ Wi-Fi Connection Success', `Successfully connected to ESP32 / Arduino at ${arduinoIp}`);
    } else {
      Alert.alert(
        '⚠️ Wi-Fi Connection Failed',
        `Could not reach hardware at ${arduinoIp}.\n\nEnsure:\n1. Device and phone are on the same Wi-Fi.\n2. IP address is correct.`
      );
    }
  };

  const handleTestVibrate = async () => {
    setVibrating(true);
    const success = await triggerVibrateESP32(2500, 3);
    setVibrating(false);
    if (success) {
      Alert.alert('📳 Vibration Signal Sent', `ESP32 at ${arduinoIp} should now be vibrating!`);
    } else {
      Alert.alert(
        '⚠️ Could Not Trigger Vibration',
        `Could not send vibration command to ${arduinoIp}.\nMake sure the ESP32 is powered on and connected to the same Wi-Fi.`
      );
    }
  };

  const handleSeedPhasedOut = async () => {
    await seedPhasedOutMedicineData();
    Alert.alert(
      '📦 0/7 Doses Inserted & Push Notification Sent',
      'Drawer 1 Column A now has 0/7 doses remaining.\n\nA push notification was triggered to your phone\'s notification bar!'
    );
  };

  const handleResetStock = async () => {
    await recordColumnRefill(1, 'A');
    Alert.alert('🔄 Stock Reset', 'Drawer 1 Column A refilled to 7/7 doses.');
  };

  const handleClearDatabase = async () => {
    Alert.alert(
      'Clear SQLite Database',
      'Are you sure you want to clear all reminders and history from the SQLite database?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await clearAllMedicineData();
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Arduino Hardware (Wi-Fi)</Text>

          <View style={styles.ipCard}>
            <View style={styles.settingLeft}>
              <View style={styles.iconBox}>
                <Ionicons name="wifi-outline" size={20} color="#4CAF50" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>Arduino IP Address</Text>
                <Text style={styles.settingDesc}>Shown on 16x2 LCD screen at startup</Text>
              </View>
            </View>

            <View style={styles.ipInputRow}>
              <TextInput
                style={styles.ipInput}
                value={arduinoIp}
                onChangeText={setArduinoIp}
                placeholder="192.168.1.23"
                keyboardType="numeric"
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.saveIpBtn}
                onPress={handleSaveIp}
              >
                <Text style={styles.saveIpText}>Save</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.testBtn}
              onPress={handleTestConnection}
              disabled={pinging}
            >
              <Ionicons
                name={pinging ? 'refresh-circle' : 'pulse-outline'}
                size={18}
                color="#1B5E20"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.testBtnText}>
                {pinging ? 'Testing Connection...' : 'Test Wi-Fi Connection'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.testBtn, { backgroundColor: '#FFF3E0', borderColor: '#FFE0B2', marginTop: 8 }]}
              onPress={handleTestVibrate}
              disabled={vibrating}
            >
              <Ionicons
                name="phone-portrait-outline"
                size={18}
                color="#E65100"
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.testBtnText, { color: '#E65100' }]}>
                {vibrating ? 'Sending Vibration...' : '📳 Test ESP32 Vibration Motor'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── SQLite Database & Stock Simulation ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SQLite Database & Stock Simulation</Text>
          <View style={styles.ipCard}>
            <Text style={styles.settingLabel}>Medicine Stock Simulation</Text>
            <Text style={styles.settingDesc}>
              Insert mock history to test the 0/7 doses "Out of Stock" notification, red badges, and refilled flow directly in SQLite.
            </Text>

            <TouchableOpacity
              style={[styles.testBtn, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}
              onPress={handleSeedPhasedOut}
              activeOpacity={0.8}
            >
              <Ionicons name="flask-outline" size={17} color="#B91C1C" style={{ marginRight: 8 }} />
              <Text style={[styles.testBtnText, { color: '#B91C1C' }]}>
                Insert 0/7 Doses (Phased Out Demo)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.testBtn, { marginTop: 8 }]}
              onPress={handleResetStock}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={17} color="#1B5E20" style={{ marginRight: 8 }} />
              <Text style={styles.testBtnText}>
                Reset Column A to 7/7 Doses
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.testBtn, { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB', marginTop: 8 }]}
              onPress={handleClearDatabase}
              activeOpacity={0.8}
            >
              <Ionicons name="trash-outline" size={17} color="#4B5563" style={{ marginRight: 8 }} />
              <Text style={[styles.testBtnText, { color: '#4B5563' }]}>
                Clear All SQLite Records
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={styles.iconBox}>
                <Ionicons name="medical-outline" size={20} color="#4CAF50" />
              </View>
              <View>
                <Text style={styles.settingLabel}>Medicine Reminder</Text>
                <Text style={styles.settingDesc}>Version 1.0.0 (Wi-Fi Enabled)</Text>
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
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212121',
  },
  settingDesc: {
    fontSize: 12,
    color: '#9E9E9E',
    marginTop: 2,
  },
  ipCard: {
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
  ipInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    gap: 10,
  },
  ipInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '600',
    color: '#212121',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  saveIpBtn: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveIpText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  testBtn: {
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
  testBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1B5E20',
  },
});
