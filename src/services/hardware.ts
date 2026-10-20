import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Reminder, HardwareStatus, DoseEvent } from '../types/reminder';

const ARDUINO_IP_KEY = '@arduino_wifi_ip';
export const DEFAULT_ARDUINO_IP = '192.168.1.23';

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
    const match = compartment.toUpperCase().match(/([A-G])([1-3])/);
    if (match) {
      const colIdx = match[1].charCodeAt(0) - 'A'.charCodeAt(0);
      const rowIdx = parseInt(match[2], 10) - 1;
      const slot = rowIdx * 7 + colIdx;
      return (slot % 4) + 1;
    }
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
 * Fetch detailed hardware status (active alerts, time, vibration state)
 */
export async function fetchHardwareStatus(targetIP?: string): Promise<HardwareStatus | null> {
  const ip = targetIP || (await getArduinoIP());
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(`http://${ip}/status`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      return data as HardwareStatus;
    }
    return null;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

/**
 * Fetch hardware event history buffer over Wi-Fi (for offline recovery)
 */
export async function fetchHardwareEvents(targetIP?: string, limit: number = 10): Promise<DoseEvent[]> {
  const ip = targetIP || (await getArduinoIP());
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  try {
    const res = await fetch(`http://${ip}/events?limit=${limit}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      return (data.events || []) as DoseEvent[];
    }
    return [];
  } catch {
    clearTimeout(timeoutId);
    return [];
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
  } catch {
    clearTimeout(timeoutId);
    Alert.alert(
      '📡 Wi-Fi Dispensing Signal',
      `Sent Wi-Fi command to http://${arduinoIP}/dispense?relay=${relayNum}\n\nFor ${compartmentName} (Relay ${relayNum}).\nMake sure your phone and Arduino are on the same Wi-Fi network.`,
      [{ text: 'OK' }]
    );
  }
}

/**
 * Sync schedule to ESP32 Mini over Wi-Fi with client epoch calibration
 */
export async function syncScheduleToESP32(reminder: Reminder): Promise<boolean> {
  const ip = await getArduinoIP();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  try {
    const clientEpoch = Math.floor(Date.now() / 1000);
    const params = new URLSearchParams({
      id: reminder.id,
      hour: String(reminder.hour),
      minute: String(reminder.minute),
      amPm: reminder.amPm,
      recurrence: reminder.recurrence,
      date: reminder.date || '',
      compartment: reminder.compartment || '',
      slotIndex: String(reminder.slotIndex ?? 0),
      client_epoch: String(clientEpoch),
    });

    const res = await fetch(`http://${ip}/set-schedule?${params.toString()}`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    clearTimeout(timeoutId);
    return false;
  }
}

/**
 * Delete schedule from ESP32 Mini over Wi-Fi
 */
export async function deleteScheduleFromESP32(reminderId: string): Promise<boolean> {
  const ip = await getArduinoIP();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(`http://${ip}/delete-schedule?id=${encodeURIComponent(reminderId)}`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    clearTimeout(timeoutId);
    return false;
  }
}

/**
 * Trigger immediate vibration on ESP32 Mini over Wi-Fi
 */
export async function triggerVibrateESP32(durationMs: number = 2500, pulses: number = 3): Promise<boolean> {
  const ip = await getArduinoIP();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(`http://${ip}/vibrate?duration=${durationMs}&pulses=${pulses}`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    clearTimeout(timeoutId);
    return false;
  }
}

/**
 * Silence vibration / manual dose confirmation over Wi-Fi
 */
export async function silenceAlertOrConfirm(scheduleId?: string): Promise<boolean> {
  const ip = await getArduinoIP();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const query = scheduleId ? `?schedule_id=${encodeURIComponent(scheduleId)}` : '';
    const res = await fetch(`http://${ip}/stop-vibrate${query}`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    clearTimeout(timeoutId);
    return false;
  }
}
