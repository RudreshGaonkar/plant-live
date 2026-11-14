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
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
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
import { useLiveDevice } from '@/hooks/useLiveDevice';
import { useSession } from '@/store/useSession';
import { usePlantState } from '@/hooks/usePlantState';
import { useCommand } from '@/hooks/useCommand';
import { Plant3DHero } from '@/components/Plant3D';
import { MoodBubble } from '@/components/MoodBubble';
import { BottleRail } from '@/components/BottleRail';
import { LiveChips } from '@/components/LiveChips';
import { VitalsSheet } from '@/components/VitalsSheet';
import { GardenStrip } from '@/components/GardenStrip';
import { WeatherWidget } from '@/components/WeatherWidget';
import { useWeather } from '@/hooks/useWeather';
import { useAutoSoakCooldown } from '@/hooks/useAutoSoakCooldown';
import { removeDeviceWithAudit } from '@/services/devices';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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
  const user = useSession((s) => s.user);
  const pairingStatus = useSession((s) => s.pairingStatus);
  const retryBoot = useSession((s) => s.retryBoot);
  const devices = useLiveDevice((s) => s.devices);
  const activeDeviceId = useLiveDevice((s) => s.activeDeviceId);
  const setActiveDeviceId = useLiveDevice((s) => s.setActiveDeviceId);
  const toggleMode = useLiveDevice((s) => s.toggleMode);
  const refillBottle = useLiveDevice((s) => s.refillBottle);
  const waterLogs = useLiveDevice((s) => s.waterLogs);
  const { triggerWaterNow, stage } = useCommand();

  const [gardenStripOpen, setGardenStripOpen] = useState(false);

  // Dynamic device location weather & smart terrace rain delay
  const currentPlantLocation = device?.config?.location || 'indoor';
  const { weather, loading: weatherLoading, isRainDelayActive } = useWeather(
    device ? currentPlantLocation : undefined,
    health !== 'unknown' ? device?.telemetry?.soilMoisture : undefined
  );

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

  // lastSeenMinutes — computed before early return to satisfy Rules of Hooks
  const [lastSeenMinutes, setLastSeenMinutes] = useState(0);
  useEffect(() => {
    if (!device) return;
    const compute = () =>
      setLastSeenMinutes(Math.round((Date.now() - device.status.lastSeen) / 60000));
    compute();
    const timer = setInterval(compute, 60000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device?.status.lastSeen]);

  // Auto soak cooldown (30 min) derived from live telemetry sample
  const autoSoak = useAutoSoakCooldown(device?.id);

  // Hide splash screen once usable content has committed
  useEffect(() => {
    if (device || pairingStatus === 'unpaired' || pairingStatus === 'unavailable') {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [device, pairingStatus]);

  // Empty state – handling pending, unavailable, or confirmed unpaired
  if (!device) {
    if (pairingStatus === 'unavailable') {
      return (
        <LinearGradient
          colors={['#16221A', '#203A2B']}
          style={styles.emptyStage}
        >
          <StatusBar style="light" />
          <View style={[styles.emptyContent, { paddingTop: insets.top + 40 }]}>
            <View
              style={[
                styles.emptyIconWrap,
                { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
              ]}
            >
              <Ionicons name="cloud-offline-outline" size={56} color="#F6FAF2" />
            </View>
            <Text style={[styles.emptyTitle, { color: '#F6FAF2' }]}>
              Device Unavailable
            </Text>
            <Text style={[styles.emptySubtitle, { color: '#80B07F' }]}>
              Unable to connect to controller services. Check your connection or retry.
            </Text>
            <TouchableOpacity
              style={[
                styles.addBtn,
                {
                  backgroundColor: colors.palette.lime,
                  borderRadius: radii.full,
                },
              ]}
              onPress={() => retryBoot()}
            >
              <Ionicons
                name="refresh-outline"
                size={18}
                color={colors.palette.forest}
                style={{ marginRight: 8 }}
              />
              <Text style={[styles.addBtnText, { color: colors.palette.forest }]}>
                Retry Connection
              </Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      );
    }

    if (pairingStatus === 'unpaired') {
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
              Unpaired Controller
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.palette.sage }]}>
              No controller is currently paired under your account. Pair your plant controller to start live monitoring.
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
                name="link-outline"
                size={18}
                color={colors.palette.white}
                style={{ marginRight: 8 }}
              />
              <Text style={styles.addBtnText}>Pair Controller</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      );
    }

    // While pairingStatus is pending or resolving, render smooth loading stage
    return (
      <View style={[styles.emptyStage, { backgroundColor: '#16221A', justifyContent: 'center', alignItems: 'center' }]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={colors.palette.lime} />
      </View>
    );
  }

  const { config, telemetry, status } = device;
  const gradientColors = STAGE_GRADIENTS[health] ?? STAGE_GRADIENTS.unknown;
  const isOffline = !status.online;
  const deviceList = Object.values(devices);

  // Dynamic plant location & name binding
  const locationMeta: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
    indoor: { label: 'Indoor', icon: 'home-outline' },
    balcony: { label: 'Balcony', icon: 'leaf-outline' },
    terrace: { label: 'Terrace', icon: 'sunny-outline' },
  };

  const activeLocation = config.location || 'indoor';
  const currentLocation = locationMeta[activeLocation] ?? {
    label: activeLocation.charAt(0).toUpperCase() + activeLocation.slice(1),
    icon: 'home-outline',
  };

  const plantDisplayName = config.name || config.plantName || 'Plant';

  const ackStatus = device?.command?.ack?.status;
  const isTerminalAck = ackStatus === 'done' || ackStatus === 'failed' || ackStatus === 'rejected';

  // Real-time pump active state: reflects ONLY active pumping and immediately resets to idle
  // as soon as telemetry.pumpOn becomes false or /command/ack/status reaches "done", "failed", or "rejected"
  const isPumpActive =
    !isTerminalAck &&
    Boolean(telemetry?.isPumpActive === true || telemetry?.pumpOn === true);

  const isIdleAndDry =
    !isPumpActive &&
    stage !== 'running' &&
    (health === 'thirsty' || (telemetry ? telemetry.soilMoisture < config.thresholds.moistureMin : false));
  const soakCooldownText = isIdleAndDry && autoSoak.isCoolingDown ? autoSoak.formattedText : undefined;

  // Manual watering trigger with unified command hook
  const handleManualWatering = async () => {
    console.log('[LeafLink] Active Controller ID:', device.id);
    await triggerWaterNow(5);
  };

  const handleRemoveFromSwitcher = (deviceId: string, plantName: string) => {
    if (!user?.uid) return;
    Alert.alert(
      'Remove Controller',
      `Are you sure you want to remove ${plantName} (${deviceId})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await removeDeviceWithAudit(
                user.uid,
                user.email,
                deviceId,
                plantName
              );
              Alert.alert('Controller Removed', `${plantName} (${deviceId}) was successfully removed.`);
              if (!res.nextDeviceId) {
                setGardenStripOpen(false);
                router.replace('/add-device');
              }
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to remove controller.');
            }
          },
        },
      ]
    );
  };

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
          isWatering={isPumpActive}
          secondsLeft={secondsLeft}
          location={activeLocation}
          mode={config.mode}
          plantName={plantDisplayName}
          plantSpecies={config.plantSpecies}
          lastSeen={status.lastSeen}
          weather={weather}
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
              overflow: 'hidden',
            },
          ]}
          onPress={() => router.push('/(tabs)/settings')}
          accessibilityLabel="User profile and settings"
        >
          {user?.avatarUri ? (
            <Image
              source={{ uri: user.avatarUri }}
              style={styles.avatarImg}
              resizeMode="cover"
            />
          ) : (
            <Ionicons
              name="person-outline"
              size={18}
              color={colors.palette.forest}
            />
          )}
        </TouchableOpacity>

        {/* Center: Plant switcher pill (Dynamically shows location, plant name, and device ID) */}
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
          <Ionicons name={currentLocation.icon} size={14} color={colors.palette.forest} />
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text
              style={[styles.switcherText, { color: colors.palette.ink }]}
              numberOfLines={1}
            >
              {currentLocation.label} · {plantDisplayName}
            </Text>
            <Text
              style={[styles.switcherSubtext, { color: colors.palette.sage }]}
              numberOfLines={1}
            >
              ID: {device.id}
            </Text>
          </View>
          <Ionicons
            name={gardenStripOpen ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.palette.sage}
          />
        </TouchableOpacity>

        {/* Right: Manual Water + Online dot + Alerts bell */}
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

          {/* Manual Watering Button - NEVER disabled when moisture is 100% */}
          <TouchableOpacity
            testID="manual-watering-btn"
            accessibilityLabel="Manual watering"
            activeOpacity={0.8}
            disabled={isWatering || isPumpActive || stage === 'sent'}
            onPress={handleManualWatering}
            style={[
              styles.iconPill,
              {
                backgroundColor: isWatering || isPumpActive || stage === 'sent'
                  ? colors.palette.forest
                  : `${colors.palette.white}CC`,
                borderRadius: radii.full,
              },
            ]}
          >
            {stage === 'sent' ? (
              <ActivityIndicator size="small" color={colors.palette.white} />
            ) : (
              <Ionicons
                name={isWatering || isPumpActive ? 'water' : 'water-outline'}
                size={18}
                color={isWatering || isPumpActive ? colors.palette.white : colors.palette.forest}
              />
            )}
          </TouchableOpacity>

          {/* Alerts bell */}
          <TouchableOpacity
            style={[
              styles.iconPill,
              {
                backgroundColor: `${colors.palette.white}CC`,
                borderRadius: radii.full,
              },
            ]}
            onPress={() => router.navigate('/(tabs)/alerts')}
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

      {/* ── Layer 1b: Floating Weather Widget (Centrally below location bar, top center of plant scene) ── */}
      <Animated.View
        style={[
          styles.weatherWidgetContainer,
          {
            top: Math.max(insets.top, 24) + (isOffline ? 104 : 58),
          },
          overlayAnimStyle,
        ]}
        pointerEvents="box-none"
      >
        <WeatherWidget
          weather={weather}
          loading={weatherLoading}
          isRainDelayActive={isRainDelayActive}
        />
      </Animated.View>

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
            onRemove={handleRemoveFromSwitcher}
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
            {status.lastSeen ? `Offline · Last seen ${lastSeenMinutes}m ago` : 'Waiting for device connection'}
          </Text>
        </View>
      )}

      {/* ── Layer 2: Mood bubble (fades when sheet rises) ────────── */}
      <Animated.View style={[styles.moodBubbleContainer, overlayAnimStyle]}>
        <MoodBubble
          health={health}
          lastSeen={isOffline ? status.lastSeen : undefined}
          subtitle={soakCooldownText}
        />
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
          isLoading={!device?.isConfigHydrated && (config.bottle.capacityMl === 0 || config.bottle.remainingMl === 0)}
          deviceId={device.id}
          controllerName={config.name || config.plantName}
          onRefill={() => refillBottle(device.id)}
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
          location={activeLocation}
          mode={config.mode}
          pumpOn={isPumpActive}
          onModeToggle={toggleMode}
          onWaterPress={handleManualWatering}
        />
      </Animated.View>

      {/* ── Layer 5: VitalsSheet ─────────────────────────────────── */}
      <VitalsSheet
        device={device}
        health={health}
        waterLogs={waterLogs}
        forceSnap={isWatering ? 'peek' : undefined}
        animatedTranslateY={sheetTranslateY}
        soakCooldownText={soakCooldownText}
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
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
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
    fontSize: 13,
    fontWeight: '700',
  },
  switcherSubtext: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
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
  weatherWidgetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9,
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
