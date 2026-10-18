/**
 * Home Screen – "The Stage"
 * The plant is the stage; everything else floats around it.
 *
 * Layer 0: Full-bleed 3D canvas background with health-state gradient
 * Layer 1: Top floating bar (greeting, plant switcher pill, online/alerts)
 * Layer 2: MoodBubble near the pot
 * Layer 3: Left-edge BottleRail fill gauge
 * Layer 4: Right-edge LiveChips stack
 * Layer 5: VitalsSheet draggable bottom sheet (Peek/Half/Full)
 *
 * uiLayout.md Section 3
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useAppTheme } from '@/theme';
import { useLiveDevice } from '@/store/useLiveDevice';
import { usePlantState } from '@/hooks/usePlantState';
import { Plant3DHero } from '@/components/Plant3D';
import { MoodBubble } from '@/components/MoodBubble';
import { BottleRail } from '@/components/BottleRail';
import { LiveChips } from '@/components/LiveChips';
import { VitalsSheet } from '@/components/VitalsSheet';
import { GardenStrip } from '@/components/GardenStrip';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Full-bleed gradient colors per health state
const STAGE_GRADIENTS: Record<string, [string, string, string]> = {
  healthy: ['#CEEA9F', '#AEE09A', '#F6FAF2'],
  thirsty: ['#F8D7DA', '#F0B8BC', '#F6FAF2'],
  overwatered: ['#AEE09A', '#80B07F', '#F6FAF2'],
  unknown: ['#CFD8DC', '#B0BEC5', '#F6FAF2'],
};

const SNAP_PEEK_Y = SCREEN_HEIGHT * (1 - 0.28);  // translateY at Peek
const SNAP_HALF_Y = SCREEN_HEIGHT * (1 - 0.55);  // translateY at Half

export default function HomeScreen() {
  const { colors, radii, spacing } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { device, health, isWatering, secondsLeft } = usePlantState();
  const devices = useLiveDevice((s) => s.devices);
  const activeDeviceId = useLiveDevice((s) => s.activeDeviceId);
  const setActiveDeviceId = useLiveDevice((s) => s.setActiveDeviceId);
  const toggleMode = useLiveDevice((s) => s.toggleMode);
  const refillBottle = useLiveDevice((s) => s.refillBottle);
  const waterLogs = useLiveDevice((s) => s.waterLogs);

  const [gardenStripOpen, setGardenStripOpen] = useState(false);

  // Shared value that tracks VitalsSheet's translateY to drive overlay fades
  const sheetTranslateY = useSharedValue(SNAP_PEEK_Y);

  // Overlay opacity: 1 at peek, fades to 0 as sheet approaches half
  const overlayAnimStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      sheetTranslateY.value,
      [SNAP_HALF_Y, SNAP_PEEK_Y],
      [0, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  // Empty state – no device paired
  if (!device) {
    return (
      <LinearGradient
        colors={['#CEEA9F', '#F6FAF2']}
        style={styles.emptyStage}
      >
        <StatusBar style="dark" />
        <View style={[styles.emptyContent, { paddingTop: insets.top + 20 }]}>
          <View
            style={[
              styles.emptyIconWrap,
              { backgroundColor: colors.palette.lime },
            ]}
          >
            <Ionicons name="leaf-outline" size={56} color={colors.palette.forest} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.palette.ink }]}>
            No Plant Connected
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.palette.sage }]}>
            Pair your ESP8266 plant companion to start monitoring
          </Text>
          <TouchableOpacity
            style={[
              styles.addBtn,
              {
                backgroundColor: colors.palette.forest,
                borderRadius: radii.full,
              },
            ]}
            onPress={() => router.push('/add-device')}
          >
            <Ionicons
              name="add"
              size={18}
              color={colors.palette.white}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.addBtnText}>Add First Plant Device</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  const { config, telemetry, status } = device;
  const gradientColors = STAGE_GRADIENTS[health] ?? STAGE_GRADIENTS.unknown;
  const isOffline = !status.online;
  const deviceList = Object.values(devices);
  // Snapshot time outside of render loop (purity rule)
  const lastSeenMinutes = React.useMemo(
    () => Math.round((Date.now() - status.lastSeen) / 60000),
    [status.lastSeen]
  );

  return (
    <View style={styles.stage}>
      <StatusBar style="dark" />

      {/* ── Layer 0: Full-bleed gradient background ────────────────── */}
      <LinearGradient
        colors={gradientColors}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      {/* Offline desaturation overlay */}
      {isOffline && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: 'rgba(180,190,185,0.45)' },
          ]}
        />
      )}

      {/* ── Layer 0b: 3D plant scene ───────────────────────────────── */}
      <View style={styles.plant3DContainer}>
        <Plant3DHero
          health={health}
          isWatering={isWatering}
          secondsLeft={secondsLeft}
          location={config.location}
          mode={config.mode}
          plantName={config.plantName}
          plantSpecies={config.plantSpecies}
          lastSeen={status.lastSeen}
        />
      </View>

      {/* ── Layer 1: Top floating bar ──────────────────────────────── */}
      <View
        style={[
          styles.topBar,
          { paddingTop: Math.max(insets.top, 24) + 8, paddingHorizontal: spacing.md },
        ]}
      >
        {/* Left: Avatar / greeting */}
        <TouchableOpacity
          style={[
            styles.avatarBtn,
            {
              backgroundColor: `${colors.palette.white}CC`,
              borderRadius: radii.full,
            },
          ]}
          accessibilityLabel="User menu"
        >
          <Ionicons
            name="person-outline"
            size={18}
            color={colors.palette.forest}
          />
        </TouchableOpacity>

        {/* Center: Plant switcher pill */}
        <TouchableOpacity
          style={[
            styles.switcherPill,
            {
              backgroundColor: `${colors.palette.white}D0`,
              borderRadius: radii.full,
              borderColor: `${colors.palette.forest}30`,
            },
          ]}
          onPress={() => setGardenStripOpen((v) => !v)}
          accessibilityLabel="Switch plant device"
        >
          <Ionicons name="leaf" size={14} color={colors.palette.forest} />
          <Text
            style={[styles.switcherText, { color: colors.palette.ink }]}
            numberOfLines={1}
          >
            {config.plantName}
          </Text>
          <Ionicons
            name={gardenStripOpen ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.palette.sage}
          />
        </TouchableOpacity>

        {/* Right: Alerts bell + online dot */}
        <View style={styles.topRightActions}>
          {/* Online indicator */}
          <View
            style={[
              styles.onlinePill,
              {
                backgroundColor: status.online
                  ? `${colors.palette.mint}CC`
                  : `${colors.palette.blush}CC`,
                borderRadius: radii.full,
              },
            ]}
          >
            <View
              style={[
                styles.onlineDot,
                {
                  backgroundColor: status.online
                    ? colors.palette.forest
                    : colors.palette.critical,
                },
              ]}
            />
          </View>

          {/* Alerts bell */}
          <TouchableOpacity
            style={[
              styles.iconPill,
              {
                backgroundColor: `${colors.palette.white}CC`,
                borderRadius: radii.full,
              },
            ]}
            accessibilityLabel="View alerts"
          >
            <Ionicons
              name="notifications-outline"
              size={18}
              color={colors.palette.ink}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* GardenStrip dropdown */}
      {gardenStripOpen && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={[
            styles.gardenStripContainer,
            {
              top: insets.top + 60,
              marginHorizontal: spacing.md,
            },
          ]}
        >
          <GardenStrip
            devices={deviceList}
            activeDeviceId={activeDeviceId}
            onSelect={setActiveDeviceId}
            onClose={() => setGardenStripOpen(false)}
          />
        </Animated.View>
      )}

      {/* Offline banner */}
      {isOffline && (
        <View
          style={[
            styles.offlineBanner,
            {
              top: insets.top + 60,
              backgroundColor: `${colors.palette.blush}EE`,
              marginHorizontal: spacing.md,
              borderRadius: radii.md,
            },
          ]}
        >
          <Ionicons
            name="cloud-offline-outline"
            size={14}
            color={colors.palette.critical}
          />
          <Text style={[styles.offlineText, { color: colors.palette.critical }]}>
            Offline · Showing last data ({lastSeenMinutes}m ago)
          </Text>
        </View>
      )}

      {/* ── Layer 2: Mood bubble (fades when sheet rises) ────────── */}
      <Animated.View style={[styles.moodBubbleContainer, overlayAnimStyle]}>
        <MoodBubble health={health} lastSeen={status.lastSeen} />
      </Animated.View>

      {/* ── Layer 3: Left-edge BottleRail (fades when sheet rises) ── */}
      <Animated.View
        style={[
          styles.bottleRailContainer,
          { top: SCREEN_HEIGHT * 0.22 },
          overlayAnimStyle,
        ]}
      >
        <BottleRail
          remainingMl={config.bottle.remainingMl}
          capacityMl={config.bottle.capacityMl}
          flowMlPerSec={config.bottle.flowMlPerSec}
          onRefill={refillBottle}
        />
      </Animated.View>

      {/* ── Layer 4: Right-edge LiveChips (fades when sheet rises) ── */}
      <Animated.View
        style={[
          styles.liveChipsContainer,
          { top: SCREEN_HEIGHT * 0.22, right: spacing.md },
          overlayAnimStyle,
        ]}
      >
        <LiveChips
          location={config.location}
          mode={config.mode}
          pumpOn={telemetry.pumpOn}
          onModeToggle={toggleMode}
        />
      </Animated.View>

      {/* ── Layer 5: VitalsSheet ─────────────────────────────────── */}
      <VitalsSheet
        device={device}
        health={health}
        waterLogs={waterLogs}
        forceSnap={isWatering ? 'peek' : undefined}
        animatedTranslateY={sheetTranslateY}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    backgroundColor: '#F6FAF2',
  },
  plant3DContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Plant fills the stage behind all layers
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 10,
  },
  avatarBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(90,138,92,0.2)',
  },
  switcherPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
    borderWidth: 1,
  },
  switcherText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  topRightActions: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  onlinePill: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  iconPill: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(90,138,92,0.2)',
  },
  gardenStripContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
  },
  offlineBanner: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    zIndex: 15,
    borderWidth: 1,
    borderColor: '#C0505E40',
  },
  offlineText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  moodBubbleContainer: {
    position: 'absolute',
    top: '34%',
    alignSelf: 'center',
    zIndex: 8,
  },
  bottleRailContainer: {
    position: 'absolute',
    left: 12,
    zIndex: 8,
    alignItems: 'center',
  },
  liveChipsContainer: {
    position: 'absolute',
    zIndex: 8,
  },
  // Empty state
  emptyStage: {
    flex: 1,
  },
  emptyContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyIconWrap: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 26,
    paddingVertical: 16,
    shadowColor: '#1F2A21',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  addBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 16,
  },
});
