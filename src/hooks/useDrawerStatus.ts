import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { fetchHardwareStatus } from '../services/hardware';
import { readDrawerState, updateDrawer, unknownDrawer, DrawerReading, requiresCabinetClosure } from '../services/drawerLogic';
import { triggerDrawerNotification } from '../services/notifications';

export function useDrawerStatus(foreground: boolean): DrawerReading[] {
  const [drawers, setDrawers] = useState<DrawerReading[]>([unknownDrawer(), unknownDrawer()]);
  const closureRequired = useRef(false);
  useEffect(() => {
    let cancelled = false;
    let busy = false;
    let previous = [unknownDrawer(), unknownDrawer()];
    if (!foreground) return;
    const poll = async () => {
      if (busy || cancelled || AppState.currentState !== 'active') return;
      busy = true;
      try {
        const status = await fetchHardwareStatus(); // Arduino owns the reed switches.
        if (cancelled || AppState.currentState !== 'active') return;
        closureRequired.current = requiresCabinetClosure(closureRequired.current, status);
        const next = previous.map((reading, index) => updateDrawer(reading, readDrawerState(status, (index + 1) as 1 | 2), Date.now())).map(reading => ({ ...reading, closureRequired: closureRequired.current }));
        next.forEach((reading, index) => {
          if (reading.state === 'open' && (previous[index].state !== 'open' || (reading.overdue && !previous[index].overdue))) {
            void triggerDrawerNotification(index + 1, reading.overdue).catch(() => {});
          }
        });
        previous = next;
        setDrawers(next);
      } finally { busy = false; }
    };
    const initial = setTimeout(() => { void poll(); }, 0);
    const timer = setInterval(() => { void poll(); }, 2000);
    return () => { cancelled = true; clearTimeout(initial); clearInterval(timer); };
  }, [foreground]);
  return foreground ? drawers : [unknownDrawer(), unknownDrawer()];
}
