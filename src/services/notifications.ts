import * as Notifications from 'expo-notifications';
import { Reminder } from '../types/reminder';

// setNotificationHandler must be guarded — on iOS Expo Go some notification
// APIs throw if the native module isn't fully initialized.
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch {
  // Notifications not fully available in this environment (e.g. iOS Expo Go)
}

export async function requestPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleReminderNotification(reminder: Reminder): Promise<string | undefined> {
  const granted = await requestPermissions();
  if (!granted) return undefined;

  // Convert 12h to 24h
  let hour24 = reminder.hour;
  if (reminder.amPm === 'AM') {
    if (reminder.hour === 12) hour24 = 0;
  } else {
    if (reminder.hour !== 12) hour24 = reminder.hour + 12;
  }

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '💊 Medicine Reminder',
        body: "It's time for your scheduled medicine reminder.",
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: hour24,
        minute: reminder.minute,
      },
    });
    return id;
  } catch {
    return undefined;
  }
}

export async function cancelReminderNotification(notificationId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // silently fail
  }
}
