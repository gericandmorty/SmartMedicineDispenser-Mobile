import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Reminder, HardwareStatus, DoseEvent } from '../types/reminder';

const ARDUINO_IP_KEY = '@arduino_wifi_ip';
export const DEFAULT_ARDUINO_IP = '10.146.105.91';

const ESP32_IP_KEY = '@esp32_wifi_ip';
export const DEFAULT_ESP32_IP = '192.168.1.13';

/**
 * Sanitize IP addresses (strips http://, trailing slashes, auto-corrects 3-octet typos like 192.168.28 -> 192.168.1.28)
 */
export function sanitizeIP(input?: string | null, fallback: string = DEFAULT_ARDUINO_IP): string {
  if (!input) return fallback;
  let cleaned = input.trim();
  // Strip protocol if user typed http:// or https://
  cleaned = cleaned.replace(/^https?:\/\//i, '');
  // Strip trailing slashes or paths
  cleaned = cleaned.replace(/\/.*$/, '');
  // Strip port if user typed e.g. :80
  cleaned = cleaned.replace(/:[0-9]+$/, '');
  cleaned = cleaned.trim();
  if (!cleaned) return fallback;

  // Auto-repair 3-octet IPs like 192.168.28 -> 192.168.1.28
  const parts = cleaned.split('.');
  if (parts.length === 3 && parts[0] === '192' && parts[1] === '168') {
    return `192.168.1.${parts[2]}`;
  }
  return cleaned;
}

/**
 * Get stored Arduino IP address from AsyncStorage (Controls Buzzer Relay & Solenoid Lock)
 */
export async function getArduinoIP(): Promise<string> {
  try {
    const ip = await AsyncStorage.getItem(ARDUINO_IP_KEY);
    // Auto-migrate from old 192.168.1.28 default to current 10.146.105.91
    if (!ip || ip.startsWith('192.168.1.28') || ip === '192.168.28') {
      return DEFAULT_ARDUINO_IP;
    }
    return sanitizeIP(ip, DEFAULT_ARDUINO_IP);
  } catch {
    return DEFAULT_ARDUINO_IP;
  }
}

/**
 * Save Arduino IP address to AsyncStorage
 */
export async function saveArduinoIP(ip: string): Promise<void> {
  try {
    const cleaned = sanitizeIP(ip, DEFAULT_ARDUINO_IP);
    await AsyncStorage.setItem(ARDUINO_IP_KEY, cleaned);
  } catch {
    // Ignore error
  }
}

/**
 * Get stored ESP32-Mini IP address from AsyncStorage (Controls Vibration Motor)
 */
export async function getESP32IP(): Promise<string> {
  try {
    const ip = await AsyncStorage.getItem(ESP32_IP_KEY);
    return sanitizeIP(ip, DEFAULT_ESP32_IP);
  } catch {
    return DEFAULT_ESP32_IP;
  }
}

/**
 * Save ESP32-Mini IP address to AsyncStorage
 */
export async function saveESP32IP(ip: string): Promise<void> {
  try {
    const cleaned = sanitizeIP(ip, DEFAULT_ESP32_IP);
    await AsyncStorage.setItem(ESP32_IP_KEY, cleaned);
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
 * Low-level HTTP Ping using native XMLHttpRequest for reliable Expo Go local network connection
 */
async function nativeHttpPing(url: string, timeoutMs: number = 4000): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    let resolved = false;
    const xhr = new XMLHttpRequest();
    xhr.timeout = timeoutMs;

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4 && !resolved) {
        resolved = true;
        if (xhr.status >= 200 && xhr.status < 400) {
          resolve({ ok: true });
        } else if (xhr.status > 0) {
          resolve({ ok: false, error: `HTTP ${xhr.status}` });
        } else {
          resolve({ ok: false, error: 'Network request failed (No response from IP)' });
        }
      }
    };

    xhr.ontimeout = () => {
      if (!resolved) {
        resolved = true;
        resolve({ ok: false, error: 'Connection timed out (4s)' });
      }
    };

    xhr.onerror = () => {
      if (!resolved) {
        resolved = true;
        resolve({ ok: false, error: 'Network request failed' });
      }
    };

    try {
      xhr.open('GET', url, true);
      xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
      xhr.send();
    } catch (err: any) {
      if (!resolved) {
        resolved = true;
        resolve({ ok: false, error: err?.message || 'Request error' });
      }
    }
  });
}

/**
 * Ping Arduino over Wi-Fi
 */
export async function pingArduino(targetIP?: string): Promise<{ ok: boolean; error?: string }> {
  const ip = sanitizeIP(targetIP || (await getArduinoIP()), DEFAULT_ARDUINO_IP);
  return nativeHttpPing(`http://${ip}/ping`);
}

/**
 * Ping ESP32-Mini over Wi-Fi
 */
export async function pingESP32(targetIP?: string): Promise<{ ok: boolean; error?: string }> {
  const ip = sanitizeIP(targetIP || (await getESP32IP()), DEFAULT_ESP32_IP);
  return nativeHttpPing(`http://${ip}/ping`);
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
 * Low-level HTTP GET using native XMLHttpRequest for reliable mobile local network connection
 */
export async function nativeHttpGet(url: string, timeoutMs: number = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;
    const xhr = new XMLHttpRequest();
    xhr.timeout = timeoutMs;

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4 && !resolved) {
        resolved = true;
        resolve(xhr.status >= 200 && xhr.status < 400);
      }
    };

    xhr.ontimeout = () => {
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    };

    xhr.onerror = () => {
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    };

    try {
      xhr.open('GET', url, true);
      xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
      xhr.send();
    } catch {
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    }
  });
}

/**
 * Trigger hardware dispensing over Wi-Fi HTTP
 */
export async function triggerHardwareDispense(reminder: Reminder): Promise<void> {
  const relayNum = getRelayNumber(reminder.compartment, reminder.slotIndex);
  const compartmentName = reminder.compartment ?? `Slot ${(reminder.slotIndex ?? 0) + 1}`;
  const arduinoIP = await getArduinoIP();

  const success = await nativeHttpGet(`http://${arduinoIP}/dispense?relay=${relayNum}`, 4000);
  if (success) {
    Alert.alert(
      '💊 Wi-Fi Dispense Success!',
      `Arduino on ${arduinoIP} triggered Relay ${relayNum} for ${compartmentName}.`,
      [{ text: 'OK' }]
    );
  } else {
    Alert.alert(
      '⚠️ Wi-Fi Warning',
      `Could not send dispense command to http://${arduinoIP}/dispense?relay=${relayNum}.\nCheck Arduino connection.`,
      [{ text: 'OK' }]
    );
  }
}

/**
 * Sync schedule to both Arduino and ESP32 Mini over Wi-Fi with client epoch calibration
 */
export async function syncScheduleToESP32(reminder: Reminder): Promise<boolean> {
  const arduinoIP = await getArduinoIP();
  const esp32IP = await getESP32IP();

  const clientEpoch = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams({
    id: reminder.id,
    hour: String(reminder.hour),
    minute: String(reminder.minute),
    second: String(reminder.second ?? 0),
    amPm: reminder.amPm,
    recurrence: reminder.recurrence,
    date: reminder.date || '',
    compartment: reminder.compartment || '',
    slotIndex: String(reminder.slotIndex ?? 0),
    client_epoch: String(clientEpoch),
  });

  const sendTo = async (ip: string) => {
    if (!ip) return false;
    return nativeHttpGet(`http://${ip}/set-schedule?${params.toString()}`, 3500);
  };

  const [ardOk, espOk] = await Promise.all([sendTo(arduinoIP), sendTo(esp32IP)]);
  return ardOk || espOk;
}

/**
 * Delete schedule from Arduino and ESP32 Mini over Wi-Fi
 */
export async function deleteScheduleFromESP32(reminderId: string): Promise<boolean> {
  const arduinoIP = await getArduinoIP();
  const esp32IP = await getESP32IP();

  const sendDelete = async (ip: string) => {
    if (!ip) return false;
    return nativeHttpGet(`http://${ip}/delete-schedule?id=${encodeURIComponent(reminderId)}`, 3000);
  };

  const [ardOk, espOk] = await Promise.all([sendDelete(arduinoIP), sendDelete(esp32IP)]);
  return ardOk || espOk;
}

/**
 * Trigger immediate vibration on ESP32 Mini over Wi-Fi
 */
export async function triggerVibrateESP32(durationMs: number = 2500, pulses: number = 3): Promise<boolean> {
  const ip = await getESP32IP();
  return nativeHttpGet(`http://${ip}/vibrate?duration=${durationMs}&pulses=${pulses}`, 3000);
}

/**
 * Silence vibration / manual dose confirmation over Wi-Fi
 */
export async function silenceAlertOrConfirm(scheduleId?: string): Promise<boolean> {
  const arduinoIP = await getArduinoIP();
  const esp32IP = await getESP32IP();

  const sendStop = async (ip: string) => {
    if (!ip) return false;
    const query = scheduleId ? `?schedule_id=${encodeURIComponent(scheduleId)}` : '';
    return nativeHttpGet(`http://${ip}/stop-vibrate${query}`, 3000);
  };

  const [ardOk, espOk] = await Promise.all([sendStop(arduinoIP), sendStop(esp32IP)]);
  return ardOk || espOk;
}

/**
 * Trigger immediate alert: Rings Arduino Buzzer (Pin 7) + Unlocks Solenoid (Pin 8) + Vibrates ESP32 (GPIO 4)
 */
export async function triggerHardwareAlert(compartment: string = 'Drawer 1 (A1)', drawer: number = 1): Promise<boolean> {
  const arduinoIP = await getArduinoIP();
  const esp32IP = await getESP32IP();

  const sendArduinoAlert = () =>
    nativeHttpGet(`http://${arduinoIP}/alert?compartment=${encodeURIComponent(compartment)}&drawer=${drawer}`, 3500);

  const sendESP32Vibrate = () =>
    nativeHttpGet(`http://${esp32IP}/vibrate?duration=3000&pulses=3`, 3500);

  const [ardOk, espOk] = await Promise.all([sendArduinoAlert(), sendESP32Vibrate()]);
  return ardOk || espOk;
}

/**
 * Trigger 5-second buzzer relay test directly on Arduino over Wi-Fi
 */
export async function triggerBuzzerRelayTest(): Promise<boolean> {
  const ip = await getArduinoIP();
  return nativeHttpGet(`http://${ip}/buzzer`, 6000);
}
