import React from 'react';
import { View, Text } from 'react-native';
import { DrawerReading } from '../services/drawerLogic';

export default function DrawerStatusBanner({ drawers }: { drawers: DrawerReading[] }) {
  return <View accessibilityLiveRegion="polite" style={{ padding: 10, backgroundColor: '#FFF7ED' }}>
    {drawers.map((drawer, index) => <Text key={index} style={{ color: drawer.state === 'open' ? '#9A3412' : '#555', fontSize: 13, marginVertical: 2 }}>
      Drawer {index + 1}: {drawer.state === 'unknown' ? 'status unavailable' : drawer.state === 'closed' ? 'Closed' : drawer.overdue ? 'Still open — please close the drawer' : 'Open — close after collecting medicine'}
    </Text>)}
  </View>;
}
