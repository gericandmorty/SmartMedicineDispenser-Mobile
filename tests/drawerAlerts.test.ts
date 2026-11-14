import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDrawerState, updateDrawer, unknownDrawer } from '../src/services/drawerLogic.ts';
import { enqueueDose, removeDose, selectDose } from '../src/services/alertQueue.ts';
import { calculateDoseOccurrence } from '../src/services/medicationLogic.ts';
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
