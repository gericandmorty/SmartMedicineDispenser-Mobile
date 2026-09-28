import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';

try {
  SplashScreen.preventAutoHideAsync();
} catch {
  // Already prevented or not available
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch {
        // ignore
      } finally {
        setReady(true);
        try {
          await SplashScreen.hideAsync();
        } catch {
          // Already hidden or not supported
        }
      }
    }
    prepare();
  }, []);

  if (!ready) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#F5F0E8' },
          animation: 'slide_from_right',
        }}
      >
        {/* Tab group — renders the bottom navbar */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

        {/* Flow screens that appear on top of tabs (no navbar) */}
        <Stack.Screen name="set-time" />
        <Stack.Screen name="confirmation" />
      </Stack>
    </>
  );
}
