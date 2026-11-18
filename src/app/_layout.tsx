import { Buffer } from 'buffer';
import React, { useEffect, useRef } from 'react';
import { Stack, router, usePathname, useRootNavigationState } from 'expo-router';
import { parse, useLinkingURL } from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { getStartupDestination, normalizeStartupPath } from '@/utils/sessionRouting';
import { LeafThemeProvider } from '@/theme';
import { selectSessionRoutingState, useSession } from '@/store/useSession';

(globalThis as unknown as { Buffer: typeof Buffer }).Buffer =
  (globalThis as unknown as { Buffer: typeof Buffer }).Buffer || Buffer;

SplashScreen.preventAutoHideAsync().catch(() => {});

export const unstable_settings = { initialRouteName: 'index' };

let splashHidden = false;
function hideSplashAfterLayout() {
  if (splashHidden) return;
  splashHidden = true;
  SplashScreen.hideAsync().catch(() => {});
}

function RootNavigator() {
  const initializeAuthListener = useSession((state) => state.initializeAuthListener);
  const uid = useSession((state) => state.user?.uid);
  const routingState = useSession(selectSessionRoutingState);

  const pathname = usePathname();
  const navigationKey = useRootNavigationState()?.key;
  const initialUrl = useLinkingURL();
  const startupPath = useRef<string | null>(null);
  const startupLinkCaptured = useRef(false);

  useEffect(() => {
    if (startupLinkCaptured.current || !initialUrl) return;
    const { scheme, hostname, path } = parse(initialUrl);
    startupPath.current = scheme === 'plantlive' && hostname
      ? [hostname, path].filter(Boolean).join('/')
      : path;
    startupLinkCaptured.current = true;
  }, [initialUrl]);

  useEffect(() => {
    if (!navigationKey || routingState === 'resolving') return;
    if (pathname !== '/') {
      // A deep link the navigator could open directly has already been handled.
      if (normalizeStartupPath(startupPath.current) === pathname.slice(1)) {
        startupPath.current = null;
      }
      return;
    }
    const destination = getStartupDestination(routingState, startupPath.current);
    startupPath.current = null;
    startupLinkCaptured.current = true;
    if (destination) router.replace(destination);
  }, [navigationKey, pathname, routingState]);

  useEffect(() => {
    const unsubscribe = initializeAuthListener();
    return () => unsubscribe();
  }, [initializeAuthListener]);

  // Register push notifications when authenticated
  useEffect(() => {
    const targetUid = routingState === 'verified' ? uid : undefined;
    if (targetUid) {
      import('@/services/notifications')
        .then(({ registerForPushNotificationsAsync, savePushTokenToRTDB }) => {
          registerForPushNotificationsAsync()
            .then((token) => {
              const currentUid = useSession.getState().user?.uid;
              if (token && targetUid && currentUid === targetUid && selectSessionRoutingState(useSession.getState()) === 'verified') {
                savePushTokenToRTDB(targetUid, token);
              }
            })
            .catch((err) => {
              console.warn('[RootLayout] Push registration failed:', err);
            });
        })
        .catch((err) => {
          console.warn('[RootLayout] Failed to load notifications module:', err);
        });
    }
  }, [routingState, uid]);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={routingState === 'signed_out'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={routingState === 'verification_pending'}>
          <Stack.Screen name="verify-email" />
        </Stack.Protected>
        <Stack.Protected guard={routingState === 'verified'}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="add-device" options={{ presentation: 'modal' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#16221A' }} onLayout={hideSplashAfterLayout}>
      <LeafThemeProvider>
        <RootNavigator />
      </LeafThemeProvider>
    </GestureHandlerRootView>
  );
}
