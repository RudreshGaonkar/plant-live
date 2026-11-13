import React, { useEffect, useState } from 'react';
import { View, Text, Image, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useSession } from '@/store/useSession';
import { useAppTheme } from '@/theme';

export default function Index() {
  const { user, isAuthReady, initializeAuthListener } = useSession();
  const { colors, radii } = useAppTheme();
  const [hasTimedOut, setHasTimedOut] = useState<boolean>(false);

  useEffect(() => {
    // Hide native splash once this component renders
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (isAuthReady) {
      if (user) {
        router.replace('/(tabs)/home');
      } else {
        router.replace('/(auth)/login');
      }
    }
  }, [user, isAuthReady]);

  // Fallback recovery timer if initial Firebase/device resolution stalls
  useEffect(() => {
    if (!isAuthReady) {
      const timer = setTimeout(() => {
        setHasTimedOut(true);
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [isAuthReady]);

  const handleRetry = () => {
    setHasTimedOut(false);
    initializeAuthListener();
  };

  const handleContinueToLogin = () => {
    router.replace('/(auth)/login');
  };

  return (
    <View style={styles.container}>
      <View style={styles.centerContent}>
        <Image
          source={require('@/assets/images/splash-icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        {!hasTimedOut ? (
          <ActivityIndicator
            size="large"
            color={colors.palette.lime}
            style={styles.spinner}
          />
        ) : (
          <View style={styles.timeoutCard}>
            <Text style={styles.timeoutTitle}>Connecting took longer than expected</Text>
            <Text style={styles.timeoutSubtitle}>
              Check your connection or proceed directly to sign in.
            </Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity
                onPress={handleRetry}
                style={[
                  styles.retryButton,
                  { backgroundColor: colors.palette.lime, borderRadius: radii.full },
                ]}
              >
                <Text style={[styles.retryButtonText, { color: colors.palette.forest }]}>
                  Retry
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleContinueToLogin}
                style={[
                  styles.loginButton,
                  { borderColor: colors.palette.sage, borderRadius: radii.full },
                ]}
              >
                <Text style={[styles.loginButtonText, { color: colors.palette.mist }]}>
                  Sign In
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#16221A', // Matches deep green native launch screen
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContent: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  logo: {
    width: 140,
    height: 140,
  },
  spinner: {
    marginTop: 24,
  },
  timeoutCard: {
    marginTop: 24,
    alignItems: 'center',
    maxWidth: 320,
  },
  timeoutTitle: {
    color: '#F6FAF2',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  timeoutSubtitle: {
    color: '#80B07F',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  loginButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: 1,
  },
  loginButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
