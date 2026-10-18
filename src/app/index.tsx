import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/store/useSession';
import { useAppTheme } from '@/theme';

export default function Index() {
  const { user, isDemoMode, isLoading } = useSession();
  const { colors } = useAppTheme();

  useEffect(() => {
    if (!isLoading) {
      if (user || isDemoMode) {
        router.replace('/(tabs)/home');
      } else {
        router.replace('/(auth)/login');
      }
    }
  }, [user, isDemoMode, isLoading]);

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