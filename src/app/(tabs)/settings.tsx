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
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getArduinoIP,
  saveArduinoIP,
  getESP32IP,
  saveESP32IP,
  pingArduino,
  pingESP32,
  triggerVibrateESP32,
  triggerBuzzerRelayTest,
  DEFAULT_ARDUINO_IP,
  DEFAULT_ESP32_IP,
  sanitizeIP,
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
  const [esp32Ip, setEsp32Ip] = useState(DEFAULT_ESP32_IP);
  const [pingingArduino, setPingingArduino] = useState(false);
  const [pingingEsp32, setPingingEsp32] = useState(false);
  const [vibrating, setVibrating] = useState(false);
  const [buzzing, setBuzzing] = useState(false);
  const [arduinoStatus, setArduinoStatus] = useState<string | null>(null);
  const [esp32Status, setEsp32Status] = useState<string | null>(null);

  useEffect(() => {
    getArduinoIP().then(setArduinoIp);
    getESP32IP().then(setEsp32Ip);
  }, []);

  const handleSaveArduinoIp = async () => {
    const cleaned = sanitizeIP(arduinoIp, DEFAULT_ARDUINO_IP);
    setArduinoIp(cleaned);
    await saveArduinoIP(cleaned);
    setArduinoStatus(`Saved: ${cleaned}`);
    Alert.alert('Arduino IP Saved', `Arduino IP updated to: ${cleaned}`);
  };

  const handleSaveEsp32Ip = async () => {
    const cleaned = sanitizeIP(esp32Ip, DEFAULT_ESP32_IP);
    setEsp32Ip(cleaned);
    await saveESP32IP(cleaned);
    setEsp32Status(`Saved: ${cleaned}`);
    Alert.alert('ESP32-Mini IP Saved', `ESP32-Mini IP updated to: ${cleaned}`);
  };

  const handleTestArduinoConnection = async () => {
    const cleaned = sanitizeIP(arduinoIp, DEFAULT_ARDUINO_IP);
    setArduinoIp(cleaned);
    setPingingArduino(true);
    setArduinoStatus(`Testing http://${cleaned}/ping ...`);
    const result = await pingArduino(cleaned);
    setPingingArduino(false);
    if (result.ok) {
      setArduinoStatus(`✅ Connected to http://${cleaned}`);
      Alert.alert('✅ Arduino Connected', `Successfully connected to Arduino at ${cleaned}`);
    } else {
      setArduinoStatus(`❌ Failed: ${result.error || 'Network error'}`);
      Alert.alert(
        '⚠️ Arduino Connection Failed',
        `Could not reach Arduino at ${cleaned}.\n\nReason: ${result.error || 'Network error'}\n\nMake sure your phone is connected to the 'Hi' Wi-Fi (not cellular data).`
      );
    }
  };

  const handleTestEsp32Connection = async () => {
    const cleaned = sanitizeIP(esp32Ip, DEFAULT_ESP32_IP);
    setEsp32Ip(cleaned);
    setPingingEsp32(true);
    setEsp32Status(`Testing http://${cleaned}/ping ...`);
    const result = await pingESP32(cleaned);
    setPingingEsp32(false);
    if (result.ok) {
      setEsp32Status(`✅ Connected to http://${cleaned}`);
      Alert.alert('✅ ESP32-Mini Connected', `Successfully connected to ESP32-Mini at ${cleaned}`);
    } else {
      setEsp32Status(`❌ Failed: ${result.error || 'Network error'}`);
      Alert.alert(
        '⚠️ ESP32-Mini Connection Failed',
        `Could not reach ESP32-Mini at ${cleaned}.\n\nReason: ${result.error || 'Network error'}\n\nMake sure your phone is connected to the 'Hi' Wi-Fi (not cellular data).`
      );
    }
  };

  const handleTestBuzzer = async () => {
    const cleaned = sanitizeIP(arduinoIp, DEFAULT_ARDUINO_IP);
    setArduinoIp(cleaned);
    setBuzzing(true);
    const success = await triggerBuzzerRelayTest();
    setBuzzing(false);
    if (success) {
      Alert.alert('🔔 Buzzer Relay Active', `Arduino at ${cleaned} is now sounding the buzzer for 5 seconds!`);
    } else {
      Alert.alert(
        '⚠️ Wi-Fi Buzzer Test Failed',
        `Could not reach Arduino at ${cleaned}.\n\nEnsure:\n1. Arduino and phone are on the same Wi-Fi.\n2. IP address (${cleaned}) is correct.`
      );
    }
  };

  const handleTestVibrate = async () => {
    const cleaned = sanitizeIP(esp32Ip, DEFAULT_ESP32_IP);
    setEsp32Ip(cleaned);
    setVibrating(true);
    const success = await triggerVibrateESP32(2500, 3);
    setVibrating(false);
    if (success) {
      Alert.alert('📳 Vibration Signal Sent', `ESP32 at ${cleaned} should now be vibrating!`);
    } else {
      Alert.alert(
        '⚠️ Could Not Trigger Vibration',
        `Could not send vibration command to ${cleaned}.\nMake sure the ESP32 is powered on and connected to the same Wi-Fi.`
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
          <Text style={styles.sectionTitle}>Arduino Controller (Wi-Fi)</Text>

          <View style={styles.ipCard}>
            <View style={styles.settingLeft}>
              <View style={styles.iconBox}>
                <Ionicons name="hardware-chip-outline" size={20} color="#4CAF50" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>Arduino IP Address</Text>
                <Text style={styles.settingDesc}>Controls Buzzer Relay (Pin 7), Solenoid Lock, & 16x2 LCD</Text>
              </View>
            </View>

            <View style={styles.ipInputRow}>
              <TextInput
                style={styles.ipInput}
                value={arduinoIp}
                onChangeText={setArduinoIp}
                placeholder="10.146.105.91"
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.saveIpBtn}
                onPress={handleSaveArduinoIp}
              >
                <Text style={styles.saveIpText}>Save</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.testBtn}
              onPress={handleTestArduinoConnection}
              disabled={pingingArduino}
            >
              <Ionicons
                name={pingingArduino ? 'refresh-circle' : 'pulse-outline'}
                size={18}
                color="#1B5E20"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.testBtnText}>
                {pingingArduino ? 'Testing Arduino...' : 'Test Arduino Connection'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.testBtn, { backgroundColor: '#EDE7F6', borderColor: '#D1C4E9', marginTop: 8 }]}
              onPress={handleTestBuzzer}
              disabled={buzzing}
            >
              <Ionicons
                name="notifications-outline"
                size={18}
                color="#6A1B9A"
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.testBtnText, { color: '#6A1B9A' }]}>
                {buzzing ? 'Sounding Buzzer (5s)...' : '🔔 Test Arduino Buzzer Relay (5s)'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ESP32-Mini Controller (Wi-Fi)</Text>

          <View style={styles.ipCard}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#FFF3E0' }]}>
                <Ionicons name="wifi-outline" size={20} color="#E65100" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>ESP32-Mini IP Address</Text>
                <Text style={styles.settingDesc}>Direct Wi-Fi connection. Controls Vibration Motor (GPIO 4)</Text>
              </View>
            </View>

            <View style={styles.ipInputRow}>
              <TextInput
                style={styles.ipInput}
                value={esp32Ip}
                onChangeText={setEsp32Ip}
                placeholder="192.168.1.13"
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.saveIpBtn, { backgroundColor: '#E65100' }]}
                onPress={handleSaveEsp32Ip}
              >
                <Text style={styles.saveIpText}>Save</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.testBtn, { backgroundColor: '#FFF3E0', borderColor: '#FFE0B2' }]}
              onPress={handleTestEsp32Connection}
              disabled={pingingEsp32}
            >
              <Ionicons
                name={pingingEsp32 ? 'refresh-circle' : 'pulse-outline'}
                size={18}
                color="#E65100"
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.testBtnText, { color: '#E65100' }]}>
                {pingingEsp32 ? 'Testing ESP32...' : 'Test ESP32-Mini Connection'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.testBtn, { backgroundColor: '#FFF8E1', borderColor: '#FFE082', marginTop: 8 }]}
              onPress={handleTestVibrate}
              disabled={vibrating}
            >
              <Ionicons
                name="phone-portrait-outline"
                size={18}
                color="#F57F17"
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.testBtnText, { color: '#F57F17' }]}>
                {vibrating ? 'Vibrating...' : '📳 Test ESP32 Vibration Motor'}
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
