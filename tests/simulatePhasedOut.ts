import {
  calculateColumnStock,
  generateRestockNotificationMessage,
} from '../src/services/medicationLogic.ts';
import type { Reminder, DoseEvent } from '../src/types/reminder.ts';

// 1. Define a daily recurring reminder for Column A
const dailyReminder: Reminder = {
  id: 'reminder_daily_01',
  hour: 8,
  minute: 30,
  amPm: 'AM',
  recurrence: 'every-day',
  compartment: 'Drawer 1 (A1)',
  slotIndex: 0,
  createdAt: '2026-10-14T08:30:00.000Z',
};

console.log('================================================================');
console.log('       MEDICINE LIFECYCLE & "PHASED OUT" (OUT OF STOCK) SIMULATION');
console.log('================================================================\n');

console.log('📌 Medication Setup:');
console.log(`   - Compartment: ${dailyReminder.compartment}`);
console.log(`   - Schedule: ${dailyReminder.hour}:${String(dailyReminder.minute).padStart(2, '0')} ${dailyReminder.amPm} (Daily)`);
console.log(`   - Cycle: 7-day pill stock (1 dose / day)\n`);

const history: DoseEvent[] = [];

// Simulate Days 1 to 7
for (let day = 1; day <= 7; day++) {
  const dateStr = `2026-10-${String(13 + day).padStart(2, '0')}`;
  history.push({
    eventId: `evt_day_${day}`,
    scheduleId: dailyReminder.id,
    triggerDate: dateStr,
    scheduledTimeFormatted: '8:30 AM',
    targetTriggerEpoch: new Date(`${dateStr}T08:30:00`).getTime(),
    resolvedAtEpoch: new Date(`${dateStr}T08:35:00`).getTime(),
    resolution: 'TAKEN',
    elapsedSeconds: 300,
  });

  const currentStock = calculateColumnStock(
    dailyReminder,
    history,
    7,
    '2026-10-14',
    new Date(`${dateStr}T09:00:00`)
  );

  console.log(`--- [DAY ${day} - ${dateStr}] ---`);
  console.log(`Dose Status: TAKEN at 8:35 AM`);
  console.log(`Stock Remaining: ${currentStock.remainingDoses} / ${currentStock.cycleDays} doses`);
  console.log(`Status Flags: isLowStock = ${currentStock.isLowStock}, isOutOfStock = ${currentStock.isOutOfStock}`);

  if (currentStock.isOutOfStock) {
    const notif = generateRestockNotificationMessage(currentStock);
    console.log('\n🚨 >>> [TRIGGERED OUT-OF-STOCK NOTIFICATION] <<< 🚨');
    console.log(`Title : "${notif.title}"`);
    console.log(`Body  : "${notif.body}"`);
    console.log(`Sound : Enabled (Default alert chime)`);
    console.log(`Channel: "Medicine Reminders" (Android High Importance + Vibration)`);
    console.log(`Action: User prompted to refill Column A and reset cycle.\n`);
  } else if (currentStock.isLowStock) {
    const lowNotif = generateRestockNotificationMessage(currentStock);
    console.log(`⚠️  Warning: "${lowNotif.title}" -> ${lowNotif.body}`);
  }
  console.log('');
}
