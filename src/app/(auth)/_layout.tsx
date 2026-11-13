import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { useSession } from '@/store/useSession';

export default function AuthLayout() {
  const user = useSession((s) => s.user);
  const isAuthReady = useSession((s) => s.isAuthReady);

  useEffect(() => {
    if (isAuthReady && user) {
      router.replace('/(tabs)/home');
    }
  }, [user, isAuthReady]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  );
}
