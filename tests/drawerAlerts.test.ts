import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDrawerState, updateDrawer, unknownDrawer, requiresCabinetClosure } from '../src/services/drawerLogic.ts';
import { enqueueDose, removeDose, selectDose } from '../src/services/alertQueue.ts';
import { calculateDoseOccurrence, completedDrawer, drawerNeedsRestock, calculateColumnStock, isDoseSuperseded, selectVisibleMissedDoses } from '../src/services/medicationLogic.ts';
import type { Reminder, DoseEvent } from '../src/types/reminder.ts';

const dose = (id: string, drawer: number): Reminder => ({ id, hour: 11, minute: 0, amPm: 'AM', recurrence: 'every-day', compartment: `Drawer ${drawer} (A1)`, createdAt: '2026-11-14T00:00:00Z' });
test('old firmware and offline/invalid readings never imply a closed drawer', () => {
  for (const payload of [null, {}, { is_alerting: false }, { drawer1_open: 'false' }, { drawer1_open: 0 }]) {
    assert.equal(readDrawerState(payload, 1), 'unknown');
  }
  assert.equal(readDrawerState({ drawer1_open: true, drawer2_open: false }, 1), 'open');
  assert.equal(readDrawerState({ drawer1_open: true, drawer2_open: false }, 2), 'closed');
});
test('left-open warning begins at 60 seconds and closing/reopening resets it', () => {
  const open = updateDrawer(unknownDrawer(), 'open', 1000);
  assert.equal(updateDrawer(open, 'open', 60999).overdue, false);
  assert.equal(updateDrawer(open, 'open', 61000).overdue, true);
  const closed = updateDrawer(open, 'closed', 62000);
  assert.equal(closed.overdue, false);
  assert.equal(updateDrawer(closed, 'open', 63000).openedAt, 63000);
});
test('unknown reading breaks continuous open timing without inventing a close', () => {
  const unknown = updateDrawer(updateDrawer(unknownDrawer(), 'open', 0), 'unknown', 59000);
  assert.equal(unknown.state, 'unknown');
  assert.equal(updateDrawer(unknown, 'open', 61000).overdue, false);
});
test('both drawers keep independent warning timers', () => {
  const first = updateDrawer(unknownDrawer(), 'open', 0);
  const second = updateDrawer(unknownDrawer(), 'open', 30000);
  assert.equal(updateDrawer(first, 'open', 60000).overdue, true);
  assert.equal(updateDrawer(second, 'open', 60000).overdue, false);
});
test('simultaneous doses remain queued exactly once and can be selected independently', () => {
  const first = dose('one', 1), second = dose('two', 2);
  const queue = enqueueDose(enqueueDose([], first), second);
  assert.deepEqual(enqueueDose(queue, first), [first, second]);
  assert.deepEqual(selectDose(queue, 'two'), [second, first]);
  assert.deepEqual(removeDose(queue, 'one'), [second]);
  assert.deepEqual(removeDose(queue, 'two'), [first]);
});
test('taken status is occurrence-specific and manual confirmation does not resolve the other drawer', () => {
  const first = dose('one', 1), second = dose('two', 2);
  const now = new Date(2026, 10, 14, 11, 1).getTime();
  const history: DoseEvent[] = [{ eventId: 'taken', scheduleId: first.id, triggerDate: '2026-11-14', scheduledTimeFormatted: '11:00 AM', targetTriggerEpoch: now / 1000 - 60, resolution: 'TAKEN_MANUAL' }];
  assert.equal(calculateDoseOccurrence(first, now, history).state, 'TAKEN_MANUAL');
  assert.equal(calculateDoseOccurrence(second, now, history).state, 'ALERTING');
  assert.equal(calculateDoseOccurrence(first, new Date(2026, 10, 15, 10).getTime(), history).state, 'UPCOMING');
});

test('staggered 12:05 and 12:07 doses each expire five minutes after their own time', () => {
  const a1: Reminder = { ...dose('a1', 1), hour: 12, minute: 5, amPm: 'PM', compartment: 'Drawer 1 (A1)', slotIndex: 0 };
  const a2: Reminder = { ...dose('a2', 1), hour: 12, minute: 7, amPm: 'PM', compartment: 'Drawer 1 (A2)', slotIndex: 7 };
  const at1207 = new Date(2026, 10, 14, 12, 7).getTime();
  assert.equal(calculateDoseOccurrence(a1, at1207).state, 'ALERTING');
  assert.equal(calculateDoseOccurrence(a2, at1207).state, 'ALERTING');
  assert.equal(isDoseSuperseded(a1, [a1, a2], at1207), true);
  assert.equal(isDoseSuperseded(a2, [a1, a2], at1207), false);
  const at1210 = new Date(2026, 10, 14, 12, 10).getTime();
  assert.equal(calculateDoseOccurrence(a1, at1210).state, 'MISSED');
  assert.equal(calculateDoseOccurrence(a2, at1210).state, 'ALERTING');
  assert.equal(calculateDoseOccurrence(a2, new Date(2026, 10, 14, 12, 12).getTime()).state, 'MISSED');
});

test('12:05 missed card stays visible after the 12:06 dose is taken until acknowledged', () => {
  const a1: Reminder = { ...dose('a1', 1), hour: 12, minute: 5, amPm: 'PM', compartment: 'Drawer 1 (A1)', slotIndex: 0 };
  const a2: Reminder = { ...dose('a2', 1), hour: 12, minute: 6, amPm: 'PM', compartment: 'Drawer 1 (A2)', slotIndex: 7 };
  const now = new Date(2026, 10, 14, 12, 6, 30).getTime();
  const takenA2: DoseEvent = {
    eventId: 'a2-taken', scheduleId: a2.id, compartment: a2.compartment,
    triggerDate: '2026-11-14', scheduledTimeFormatted: '12:06 PM',
    targetTriggerEpoch: new Date(2026, 10, 14, 12, 6).getTime() / 1000,
    resolution: 'TAKEN', elapsedSeconds: 30,
  };
  const missed = selectVisibleMissedDoses([a1, a2], [takenA2], [], now);
  assert.equal(missed.length, 1);
  assert.equal(missed[0].scheduleId, 'a1');
  assert.equal(missed[0].scheduledTimeFormatted, '12:05 PM');
  assert.equal(selectVisibleMissedDoses([a1, a2], [takenA2], ['a1:2026-11-14'], now).length, 0);
});

test('drawer completion waits for every due dose in that drawer, independently of the other drawer', () => {
  const now = new Date(2026, 10, 14, 11, 1).getTime();
  const first = dose('one', 1);
  const second = { ...dose('two', 1), compartment: 'Drawer 1 (B1)' };
  const other = dose('three', 2);
  const event = (reminder: Reminder): DoseEvent => ({ eventId: reminder.id, scheduleId: reminder.id, triggerDate: '2026-11-14', scheduledTimeFormatted: '11:00 AM', targetTriggerEpoch: now / 1000 - 60, resolution: 'TAKEN' });
  assert.equal(completedDrawer([first, second, other], [event(first)], 1, now), false);
  assert.equal(completedDrawer([first, second, other], [event(first), event(second)], 1, now), true);
  assert.equal(completedDrawer([first, second, other], [event(first), event(second)], 2, now), false);
  assert.equal(completedDrawer([first, second, other], [event(first), event(second), event(other)], 2, now), true);
  assert.equal(completedDrawer([first], [], 1, now), false);
});

test('cabinet popup latches through disconnect and requires both explicit closed reeds', () => {
  assert.equal(requiresCabinetClosure(false, { cabinet_close_required: true, drawer1_open: true, drawer2_open: false }), true);
  for (const payload of [null, {}, { drawer1_open: false }, { drawer1_open: false, drawer2_open: true }, { cabinet_close_required: false }]) {
    assert.equal(requiresCabinetClosure(true, payload), true);
  }
  assert.equal(requiresCabinetClosure(true, { cabinet_close_required: true, drawer1_open: false, drawer2_open: false }), true);
  assert.equal(requiresCabinetClosure(true, { drawer1_open: false, drawer2_open: false }), false);
  assert.equal(requiresCabinetClosure(false, null), false);
});

test('restock prompt requires every saved cell in a drawer and clears after refill', () => {
  const takenAt = new Date(2026, 10, 14, 11, 1).getTime();
  const reminders: Reminder[] = Array.from({ length: 21 }, (_, slot) => ({
    ...dose(`refill-${slot}`, 1), quantity: 1, slotIndex: slot,
    compartment: `Drawer 1 (${String.fromCharCode(65 + slot % 7)}${Math.floor(slot / 7) + 1})`,
    createdAt: '2026-11-14T08:00:00',
  }));
  const events: DoseEvent[] = reminders.map((reminder, index) => ({
    eventId: `refill-taken-${index}`, scheduleId: reminder.id,
    triggerDate: '2026-11-14', scheduledTimeFormatted: '11:00 AM',
    targetTriggerEpoch: Math.floor(takenAt / 1000) - 60,
    resolvedAtEpoch: Math.floor(takenAt / 1000), resolution: 'TAKEN',
  }));
  assert.equal(drawerNeedsRestock(reminders.slice(0, 20), events.slice(0, 20), 1, 0, takenAt), true);
  assert.equal(drawerNeedsRestock(reminders, events.slice(0, 20), 1, 0, takenAt), false);
  assert.equal(drawerNeedsRestock(reminders, events, 1, 0, takenAt), true);
  assert.equal(calculateColumnStock(reminders[0], events).remainingDoses, 0);
  assert.equal(drawerNeedsRestock(reminders, events, 1, 0, takenAt + 86400000), true);
  const restockedAt = takenAt + 1000;
  const partialPickup = [...events, { ...events[0], resolvedAtEpoch: takenAt / 1000 + 2 }];
  assert.equal(drawerNeedsRestock(reminders, partialPickup, 1, restockedAt, takenAt + 2000), false);
  assert.equal(drawerNeedsRestock(reminders, events, 1, restockedAt, takenAt + 2000), false);
  assert.equal(calculateColumnStock(reminders[0], events, 1, '2026-11-14', new Date(takenAt), restockedAt).remainingDoses, 1);
});
