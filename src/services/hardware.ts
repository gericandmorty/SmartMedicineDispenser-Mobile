import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Reminder } from '../types/reminder';

const ARDUINO_IP_KEY = '@arduino_wifi_ip';
export const DEFAULT_ARDUINO_IP = '192.168.1.17';

/**
 * Get stored Arduino IP address from AsyncStorage
 */
export async function getArduinoIP(): Promise<string> {
  try {
    const ip = await AsyncStorage.getItem(ARDUINO_IP_KEY);
    return ip || DEFAULT_ARDUINO_IP;
  } catch {
    return DEFAULT_ARDUINO_IP;
  }
}

/**
 * Save Arduino IP address to AsyncStorage
 */
export async function saveArduinoIP(ip: string): Promise<void> {
  try {
    await AsyncStorage.setItem(ARDUINO_IP_KEY, ip.trim());
  } catch {
    // Ignore error
  }
}

/**
 * Maps a given compartment label or slot index to an Arduino Relay number (1-4).
 * Relay 1 = Pin 7 (Drawer 1 - A1)
 * Relay 2 = Pin 8 (Drawer 1 - A2)
 * Relay 3 = Pin 9 (Drawer 1 - B1)
 * Relay 4 = Pin 10 (Drawer 1 - B2)
 */
export function getRelayNumber(compartment?: string, slotIndex?: number): number {
  if (slotIndex !== undefined) {
    return (slotIndex % 4) + 1;
  }

  if (compartment) {
    const upper = compartment.toUpperCase();
    if (upper.includes('A1')) return 1;
    if (upper.includes('A2')) return 2;
    if (upper.includes('B1')) return 3;
    if (upper.includes('B2')) return 4;
    if (upper.includes('C1')) return 1;
    if (upper.includes('C2')) return 2;
    if (upper.includes('D1')) return 3;
    if (upper.includes('D2')) return 4;
  }

  return 1;
}

/**
 * Ping Arduino over Wi-Fi
 */
export async function pingArduino(targetIP?: string): Promise<boolean> {
  const ip = targetIP || (await getArduinoIP());
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(`http://${ip}/ping`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      return data.status === 'online';
    }
    return false;
  } catch {
    clearTimeout(timeoutId);
    return false;
  }
}

/**
 * Send custom LCD message to Arduino over Wi-Fi
 */
export async function sendWiFiMessage(line1: string, line2: string): Promise<boolean> {
  const arduinoIP = await getArduinoIP();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const url = `http://${arduinoIP}/msg?line1=${encodeURIComponent(line1)}&line2=${encodeURIComponent(line2)}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    clearTimeout(timeoutId);
    return false;
  }
}

/**
 * Trigger hardware dispensing over Wi-Fi HTTP
 */
export async function triggerHardwareDispense(reminder: Reminder): Promise<void> {
  const relayNum = getRelayNumber(reminder.compartment, reminder.slotIndex);
  const compartmentName = reminder.compartment ?? `Slot ${(reminder.slotIndex ?? 0) + 1}`;
  const arduinoIP = await getArduinoIP();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(`http://${arduinoIP}/dispense?relay=${relayNum}`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      Alert.alert(
        '💊 Wi-Fi Dispense Success!',
        `Arduino on ${arduinoIP} triggered Relay ${relayNum} for ${compartmentName}.`,
        [{ text: 'OK' }]
      );
    } else {
      Alert.alert(
        '⚠️ Wi-Fi Warning',
        `Connected to http://${arduinoIP} but returned status ${res.status}.\nCheck Arduino LCD display.`,
        [{ text: 'OK' }]
      );
    }
  } catch (error) {
    clearTimeout(timeoutId);
    Alert.alert(
      '📡 Wi-Fi Dispensing Signal',
      `Sent Wi-Fi command to http://${arduinoIP}/dispense?relay=${relayNum}\n\nFor ${compartmentName} (Relay ${relayNum}).\nMake sure your phone and Arduino are on the same Wi-Fi network.`,
      [{ text: 'OK' }]
    );
  }
}
