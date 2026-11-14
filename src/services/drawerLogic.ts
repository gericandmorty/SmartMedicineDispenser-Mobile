export const DRAWER_LEFT_OPEN_MS = 60_000;
export type DoorState = 'open' | 'closed' | 'unknown';
export interface DrawerReading { state: DoorState; openedAt: number | null; overdue: boolean }
export const unknownDrawer = (): DrawerReading => ({ state: 'unknown', openedAt: null, overdue: false });

// Sensor contract for Arduino /status. Missing/invalid values are never closed.
export function readDrawerState(payload: unknown, drawer: 1 | 2): DoorState {
  if (!payload || typeof payload !== 'object') return 'unknown';
  const value = (payload as Record<string, unknown>)[`drawer${drawer}_open`];
  return value === true ? 'open' : value === false ? 'closed' : 'unknown';
}
export function updateDrawer(previous: DrawerReading, state: DoorState, now: number): DrawerReading {
  if (state !== 'open') return { state, openedAt: null, overdue: false };
  const openedAt = previous.state === 'open' ? previous.openedAt ?? now : now;
  return { state, openedAt, overdue: now - openedAt >= DRAWER_LEFT_OPEN_MS };
}
