import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  cancelAnimation,
  useReducedMotion,
  Easing,
} from 'react-native-reanimated';
import { useSession } from '@/store/useSession';
import { useAppTheme } from '@/theme';

export default function Index() {
  const { pairingStatus, retryBoot } = useSession();
  const { colors, radii } = useAppTheme();
  const [hasTimedOut, setHasTimedOut] = useState<boolean>(false);
  const [isImageReady, setIsImageReady] = useState<boolean>(false);

  const reducedMotion = useReducedMotion();
  const markOpacity = useSharedValue(reducedMotion ? 1 : 0.85);
  const markScale = useSharedValue(reducedMotion ? 1 : 0.94);
  const markTranslateY = useSharedValue(reducedMotion ? 0 : 6);

  const showRecovery = hasTimedOut || pairingStatus === 'unavailable';

  // Mark animation: 0.9/0.98 -> 1/1 over 200ms, then reversing breathing pulse (1 <-> 1.025)
  useEffect(() => {
    if (reducedMotion) {
      markOpacity.value = 1;
      markScale.value = 1;
      markTranslateY.value = 0;
      return;
    }

    if (showRecovery) {
      cancelAnimation(markOpacity);
      cancelAnimation(markScale);
      cancelAnimation(markTranslateY);
      markOpacity.value = 1;
      markScale.value = 1;
      markTranslateY.value = 0;
      return;
    }

    if (isImageReady) {
      markOpacity.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.quad) });
      markTranslateY.value = withTiming(0, { duration: 280, easing: Easing.out(Easing.quad) });
      markScale.value = withTiming(
        1,
        { duration: 280, easing: Easing.out(Easing.quad) },
        (finished) => {
          'worklet';
          if (finished) {
            markScale.value = withRepeat(
              withTiming(1.035, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
              -1,
              true
            );
            markOpacity.value = withRepeat(
              withTiming(0.88, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
              -1,
              true
            );
          }
        }
      );
    }

    return () => {
      cancelAnimation(markOpacity);
      cancelAnimation(markScale);
      cancelAnimation(markTranslateY);
    };
  }, [isImageReady, showRecovery, reducedMotion, markOpacity, markScale, markTranslateY]);

  const markAnimatedStyle = useAnimatedStyle(() => ({
    opacity: markOpacity.value,
    transform: [{ scale: markScale.value }, { translateY: markTranslateY.value }],
  }));

  // 7-second end-to-end boot deadline
  useEffect(() => {
    if (hasTimedOut) return;
    const timer = setTimeout(() => {
      setHasTimedOut(true);
    }, 7000);
    return () => clearTimeout(timer);
  }, [hasTimedOut]);

  const handleRetry = () => {
    setHasTimedOut(false);
    retryBoot();
  };

  return (
    <View
      style={styles.container}
    >
      <View style={styles.centerContent}>
        <Animated.Image
          source={require('@/assets/images/splash-icon.png')}
          style={[styles.logo, markAnimatedStyle]}
          resizeMode="contain"
          onLoad={() => setIsImageReady(true)}
          onError={() => setIsImageReady(true)}
        />

        {!showRecovery ? (
          <ActivityIndicator
            size="large"
            color={colors.palette.lime}
            style={styles.spinner}
          />
        ) : (
          <View style={styles.timeoutCard}>
            <Text style={styles.timeoutTitle}>Connecting took longer than expected</Text>
            <Text style={styles.timeoutSubtitle}>
              Check your connection and try again.
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
});
