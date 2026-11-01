import { Buffer } from 'buffer';
import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LeafThemeProvider } from '@/theme';
import { useSession } from '@/store/useSession';

(globalThis as unknown as { Buffer: typeof Buffer }).Buffer =
  (globalThis as unknown as { Buffer: typeof Buffer }).Buffer || Buffer;

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { user, initializeAuthListener } = useSession();

  useEffect(() => {
    const unsubscribe = initializeAuthListener();
    SplashScreen.hideAsync().catch(() => {});
    return () => unsubscribe();
  }, [initializeAuthListener]);

  // Register push notifications when authenticated
  useEffect(() => {
    if (user?.uid) {
      import('@/services/notifications').then(({ registerForPushNotificationsAsync, savePushTokenToRTDB }) => {
        registerForPushNotificationsAsync().then((token) => {
          if (token && user.uid) {
            savePushTokenToRTDB(user.uid, token);
          }
        });
      });
    }
  }, [user]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="add-device"
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LeafThemeProvider>
        <RootNavigator />
      </LeafThemeProvider>
    </GestureHandlerRootView>
  );
}
