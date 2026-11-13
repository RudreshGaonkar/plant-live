import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/store/useSession';
import { useAppTheme } from '@/theme';

export default function Index() {
  const { user, isAuthReady } = useSession();
  const { colors } = useAppTheme();

  useEffect(() => {
    if (isAuthReady) {
      if (user) {
        router.replace('/(tabs)/home');
      } else {
        router.replace('/(auth)/login');
      }
    }
  }, [user, isAuthReady]);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
      }}
    >
      <ActivityIndicator size="large" color={colors.palette.forest} />
    </View>
  );
}