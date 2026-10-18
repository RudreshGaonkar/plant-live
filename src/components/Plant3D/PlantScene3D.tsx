/**
 * PlantScene3D
 * Pure React Native 3D scene with touch-to-orbit gesture controls,
 * 3D perspective transforms, and health-state reactive plant geometry.
 *
 * Implements spec.md Section 7.3:
 * - Rotatable 3D pot + plant (touch to orbit within bounded range)
 * - Healthy: upright, vibrant green, subtle sway
 * - Thirsty: drooping pose, desaturated leaves
 * - Overwatered: yellowed/soggy tint
 * - Offline/unknown: grey-tinted
 * - Darkened soil transition when watering
 */
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PlantHealthState } from '@/store/useLiveDevice';

export interface PlantScene3DProps {
  health: PlantHealthState;
  isWatering: boolean;
}

// Health state visual palette
const leafColors: Record<PlantHealthState, { main: string; shade: string; stem: string; soil: string }> = {
  healthy: { main: '#AEE09A', shade: '#5A8A5C', stem: '#4A7A4C', soil: '#5D4037' },
  thirsty: { main: '#D7CCC8', shade: '#A1887F', stem: '#8D6E63', soil: '#795548' },
  overwatered: { main: '#E8F5E9', shade: '#A5D6A7', stem: '#66BB6A', soil: '#3E2723' },
  unknown: { main: '#CFD8DC', shade: '#90A4AE', stem: '#78909C', soil: '#616161' },
};

export function PlantScene3D({ health, isWatering }: PlantScene3DProps) {
  const colors = leafColors[health];

  // Orbit rotation shared values (degrees)
  const rotY = useSharedValue(0);
  const rotX = useSharedValue(0);

  // Idle sway animation
  const swayAngle = useSharedValue(0);

  useEffect(() => {
    const amplitude = health === 'healthy' ? 3.5 : health === 'thirsty' ? 7 : 2;
    const duration = isWatering ? 800 : 2200;

    swayAngle.value = withRepeat(
      withSequence(
        withTiming(amplitude, { duration, easing: Easing.inOut(Easing.ease) }),
        withTiming(-amplitude, { duration, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [health, isWatering, swayAngle]);

  // Touch-to-orbit gesture handler (bounded range: -28deg to +28deg Y, -12deg to +12deg X)
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      'worklet';
      rotY.value = Math.max(-28, Math.min(28, e.translationX * 0.25));
      rotX.value = Math.max(-12, Math.min(12, -e.translationY * 0.2));
    })
    .onEnd(() => {
      'worklet';
      rotY.value = withSpring(0, { damping: 14, stiffness: 120 });
      rotX.value = withSpring(0, { damping: 14, stiffness: 120 });
    });

  // 3D Scene Root Transform
  const scene3DStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 900 },
      { rotateX: `${rotX.value}deg` },
      { rotateY: `${rotY.value}deg` },
    ],
  }));

  // Plant Foliage Sway Transform
  const foliageStyle = useAnimatedStyle(() => {
    const droopOffset = health === 'thirsty' ? 14 : 0;
    return {
      transform: [
        { rotateZ: `${swayAngle.value + droopOffset}deg` },
        { translateY: health === 'thirsty' ? 6 : 0 },
      ],
    };
  });

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.container}>
        <Animated.View style={[styles.stage3D, scene3DStyle]}>
          {/* Ambient Ground Shadow */}
          <View style={styles.groundShadow} />

        {/* 3D Foliage Cluster */}
        <Animated.View style={[styles.foliageGroup, foliageStyle]}>
          {/* Main Central Stem */}
          <View style={[styles.stem, { backgroundColor: colors.stem }]} />

          {/* Top Leaf */}
          <View
            style={[
              styles.leafTop,
              {
                backgroundColor: colors.main,
                borderColor: colors.shade,
                transform: [
                  { rotateZ: health === 'thirsty' ? '22deg' : '0deg' },
                  { scaleY: health === 'thirsty' ? 0.85 : 1 },
                ],
              },
            ]}
          >
            <View style={[styles.leafVein, { backgroundColor: colors.shade }]} />
          </View>

          {/* Left Leaf Blade */}
          <View
            style={[
              styles.leafLeft,
              {
                backgroundColor: colors.main,
                borderColor: colors.shade,
                transform: [
                  { rotateZ: health === 'thirsty' ? '-58deg' : '-34deg' },
                  { scale: health === 'thirsty' ? 0.9 : 1 },
                ],
              },
            ]}
          >
            <View style={[styles.leafVein, { backgroundColor: colors.shade }]} />
          </View>

          {/* Right Leaf Blade */}
          <View
            style={[
              styles.leafRight,
              {
                backgroundColor: colors.main,
                borderColor: colors.shade,
                transform: [
                  { rotateZ: health === 'thirsty' ? '56deg' : '32deg' },
                  { scale: health === 'thirsty' ? 0.9 : 1 },
                ],
              },
            ]}
          >
            <View style={[styles.leafVein, { backgroundColor: colors.shade }]} />
          </View>

          {/* Secondary Left Leaf */}
          <View
            style={[
              styles.leafSubLeft,
              {
                backgroundColor: colors.shade,
                opacity: 0.85,
                transform: [
                  { rotateZ: health === 'thirsty' ? '-72deg' : '-50deg' },
                ],
              },
            ]}
          />

          {/* Secondary Right Leaf */}
          <View
            style={[
              styles.leafSubRight,
              {
                backgroundColor: colors.shade,
                opacity: 0.85,
                transform: [
                  { rotateZ: health === 'thirsty' ? '70deg' : '48deg' },
                ],
              },
            ]}
          />
        </Animated.View>

        {/* 3D Ceramic Pot */}
        <View style={styles.potContainer}>
          {/* Soil Surface (darkens dynamically when watering) */}
          <View
            style={[
              styles.potSoil,
              {
                backgroundColor: isWatering ? '#3E2723' : colors.soil,
              },
            ]}
          >
            {isWatering && (
              <View style={styles.soilMoistGlow} />
            )}
          </View>

          {/* Ceramic Pot Body */}
          <View style={styles.potBody}>
            {/* 3D Shading highlights */}
            <View style={styles.potHighlight} />
            <View style={styles.potRim} />
            <Ionicons
              name="leaf"
              size={14}
              color="rgba(255,255,255,0.4)"
              style={styles.potEmblem}
            />
          </View>
        </View>
      </Animated.View>
    </View>
  </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage3D: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groundShadow: {
    position: 'absolute',
    bottom: 12,
    width: 140,
    height: 22,
    borderRadius: 70,
    backgroundColor: 'rgba(31, 42, 33, 0.16)',
    transform: [{ scaleY: 0.5 }],
  },
  foliageGroup: {
    position: 'absolute',
    bottom: 84,
    alignItems: 'center',
    zIndex: 2,
  },
  stem: {
    width: 8,
    height: 72,
    borderRadius: 4,
  },
  leafVein: {
    width: 2,
    height: '65%',
    opacity: 0.45,
    borderRadius: 1,
  },
  leafTop: {
    position: 'absolute',
    top: -54,
    width: 48,
    height: 64,
    borderRadius: 24,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    shadowColor: '#1F2A21',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  leafLeft: {
    position: 'absolute',
    top: -30,
    left: -52,
    width: 44,
    height: 56,
    borderRadius: 22,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    shadowColor: '#1F2A21',
    shadowOffset: { width: -1, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  leafRight: {
    position: 'absolute',
    top: -30,
    right: -52,
    width: 44,
    height: 56,
    borderRadius: 22,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    shadowColor: '#1F2A21',
    shadowOffset: { width: 1, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  leafSubLeft: {
    position: 'absolute',
    top: -6,
    left: -42,
    width: 32,
    height: 42,
    borderRadius: 16,
    borderTopLeftRadius: 28,
  },
  leafSubRight: {
    position: 'absolute',
    top: -6,
    right: -42,
    width: 32,
    height: 42,
    borderRadius: 16,
    borderTopRightRadius: 28,
  },
  potContainer: {
    position: 'absolute',
    bottom: 22,
    alignItems: 'center',
    zIndex: 1,
  },
  potSoil: {
    width: 96,
    height: 20,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soilMoistGlow: {
    width: 70,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(174, 224, 154, 0.35)',
  },
  potBody: {
    width: 92,
    height: 68,
    marginTop: -8,
    backgroundColor: '#8D6E63',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderWidth: 1,
    borderColor: '#795548',
    overflow: 'hidden',
    alignItems: 'center',
    shadowColor: '#1F2A21',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  potRim: {
    position: 'absolute',
    top: 0,
    width: '100%',
    height: 6,
    backgroundColor: '#A1887F',
  },
  potHighlight: {
    position: 'absolute',
    top: 0,
    left: 8,
    width: 14,
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 7,
  },
  potEmblem: {
    position: 'absolute',
    bottom: 16,
  },
});
