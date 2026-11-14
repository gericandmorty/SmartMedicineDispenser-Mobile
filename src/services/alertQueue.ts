import type { Reminder } from '../types/reminder.ts';

export function enqueueDose(queue: Reminder[], reminder: Reminder): Reminder[] {
  return queue.some((item) => item.id === reminder.id) ? queue : [...queue, reminder];
}
export function removeDose(queue: Reminder[], id: string): Reminder[] {
  return queue.filter((item) => item.id !== id);
}
export function selectDose(queue: Reminder[], id: string): Reminder[] {
  return [...queue.filter((item) => item.id === id), ...queue.filter((item) => item.id !== id)];
}
