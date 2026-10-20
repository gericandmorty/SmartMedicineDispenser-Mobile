import { Platform } from 'react-native';
import { Reminder } from '../types/reminder';

// Import local notification modules directly to avoid the expo-notifications root index.
// In Expo SDK 53+, importing the root `expo-notifications` in Expo Go on Android triggers
// `warnOfExpoGoPushUsage` which throws an uncaught error because remote push notifications
// were removed from Expo Go. Importing local notification submodules directly avoids
// executing the push token auto-registration side-effects.
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
import {
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-notifications/build/NotificationPermissions';
import { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
import { cancelScheduledNotificationAsync } from 'expo-notifications/build/cancelScheduledNotificationAsync';
import { setNotificationChannelAsync } from 'expo-notifications/build/setNotificationChannelAsync';
import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
import { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';

export const DEFAULT_CHANNEL_ID = 'medicine-reminders';

// Safe initialization of notification handler
try {
  setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch (e) {
  console.warn('[notifications] Failed to set notification handler:', e);
}

// Ensure notification channel is configured for Android 8.0+
if (Platform.OS === 'android') {
  try {
    setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
      name: 'Medicine Reminders',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4CAF50',
      sound: 'default',
    }).catch((err) => {
      console.warn('[notifications] Failed to create Android notification channel:', err);
    });
  } catch (e) {
    console.warn('[notifications] setNotificationChannelAsync unavailable:', e);
  }
}

export async function requestPermissions(): Promise<boolean> {
  try {
    const existing = await getPermissionsAsync();
    if (existing.status === 'granted') return true;

    const requested = await requestPermissionsAsync();
    return requested.status === 'granted';
  } catch (e) {
    console.warn('[notifications] Notification permissions request failed:', e);
    return false;
  }
}

export async function scheduleReminderNotification(reminder: Reminder): Promise<string | undefined> {
  try {
    const granted = await requestPermissions();
    if (!granted) return undefined;

    // Convert 12h to 24h
    let hour24 = reminder.hour;
    if (reminder.amPm === 'AM') {
      if (reminder.hour === 12) hour24 = 0;
    } else {
      if (reminder.hour !== 12) hour24 = reminder.hour + 12;
    }

    const bodyText = reminder.compartment
      ? `It's time to take your medicine from ${reminder.compartment}.`
      : "It's time for your scheduled medicine reminder.";

    let triggerInput: any;

    if (reminder.date) {
      const [y, m, d] = reminder.date.split('-').map(Number);
      const targetDate = new Date(y, m - 1, d, hour24, reminder.minute, 0);

      // Only schedule if it's in the future
      if (targetDate.getTime() > Date.now()) {
        triggerInput = {
          type: SchedulableTriggerInputTypes.DATE,
          date: targetDate,
          channelId: Platform.OS === 'android' ? DEFAULT_CHANNEL_ID : undefined,
        };
      } else {
        return undefined;
      }
    } else {
      triggerInput = {
        type: SchedulableTriggerInputTypes.DAILY,
        hour: hour24,
        minute: reminder.minute,
        channelId: Platform.OS === 'android' ? DEFAULT_CHANNEL_ID : undefined,
      };
    }

    const id = await scheduleNotificationAsync({
      content: {
        title: '💊 Medicine Reminder',
        body: bodyText,
        sound: true,
      },
      trigger: triggerInput,
    });
    return id;
  } catch (e) {
    console.warn('[notifications] Failed to schedule notification:', e);
    return undefined;
  }
}

export async function cancelReminderNotification(notificationId: string): Promise<void> {
  try {
    await cancelScheduledNotificationAsync(notificationId);
  } catch (e) {
    console.warn('[notifications] Failed to cancel scheduled notification:', e);
  }
}

/**
 * Schedule a local notification to alert the user that a column needs restocking
 */
export async function scheduleRestockNotification(
  drawer: number,
  column: string,
  targetDate: Date
): Promise<string | undefined> {
  try {
    const granted = await requestPermissions();
    if (!granted) return undefined;

    // Schedule for 9:00 AM on the target restock date (or immediately if today)
    const alertTime = new Date(targetDate);
    alertTime.setHours(9, 0, 0, 0);

    const triggerDate = alertTime.getTime() > Date.now() ? alertTime : new Date(Date.now() + 5000);

    const id = await scheduleNotificationAsync({
      content: {
        title: '📦 Medicine Restock Required',
        body: `Drawer ${drawer} - Column ${column} is out of stock! It's time to refill your weekly medicine supply.`,
        sound: true,
      },
      trigger: {
        type: SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId: Platform.OS === 'android' ? DEFAULT_CHANNEL_ID : undefined,
      },
    });
    return id;
  } catch (e) {
    console.warn('[notifications] Failed to schedule restock notification:', e);
    return undefined;
  }
}


