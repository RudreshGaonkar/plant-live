/**
 * Alerts Screen – "Inbox Stack"
 * Severity-grouped alert inbox with swipe gestures.
 * - Critical: #C0505E accent
 * - Warning: blush
 * - Info: lime
 * uiLayout.md Section 6
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  FadeIn,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';
import { useLiveDevice } from '@/store/useLiveDevice';
import { computePlantHealthState } from '@/store/useLiveDevice';

type AlertSeverity = 'critical' | 'warning' | 'info';
type AlertStatus = 'unread' | 'read' | 'snoozed';

interface AppAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  body: string;
  plantName: string;
  ts: number;
  status: AlertStatus;
  actionLabel?: string;
}

const SEVERITY_COLORS: Record<
  AlertSeverity,
  { bg: string; border: string; text: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  critical: {
    bg: '#FFECEC',
    border: '#C0505E',
    text: '#C0505E',
    icon: 'alert-circle',
  },
  warning: {
    bg: '#F8D7DA',
    border: '#C0505E80',
    text: '#8B3040',
    icon: 'warning-outline',
  },
  info: {
    bg: '#CEEA9F60',
    border: '#5A8A5C40',
    text: '#3A5C3C',
    icon: 'information-circle-outline',
  },
};

function buildAlertsFromDevice(device: ReturnType<typeof useLiveDevice.getState>['devices'][string] | undefined): AppAlert[] {
  if (!device) return [];
  const health = computePlantHealthState(device);
  const alerts: AppAlert[] = [];

  if (!device.status.online) {
    alerts.push({
      id: 'offline',
      severity: 'critical',
      title: 'Device Offline',
      body: `${device.config.name} has not reported in over 3 minutes. Check Wi-Fi connection.`,
      plantName: device.config.plantName,
      ts: device.status.lastSeen,
      status: 'unread',
      actionLabel: 'Check Settings',
    });
  }

  if (health === 'thirsty') {
    alerts.push({
      id: 'thirsty',
      severity: 'warning',
      title: 'Low Soil Moisture',
      body: `${device.config.plantName} soil is at ${device.telemetry.soilMoisture}%, below the ${device.config.thresholds.moistureMin}% threshold.`,
      plantName: device.config.plantName,
      ts: Date.now() - 600000,
      status: 'unread',
      actionLabel: 'Water Now',
    });
  }

  if (device.config.bottle.remainingMl <= 20) {
    alerts.push({
      id: 'bottle',
      severity: 'critical',
      title: 'Water Bottle Empty',
      body: 'Estimated bottle level is critically low. Pump is disabled until refilled.',
      plantName: device.config.plantName,
      ts: Date.now() - 1200000,
      status: 'unread',
      actionLabel: 'I Refilled',
    });
  }

  if (device.telemetry.temperature > device.config.thresholds.tempMax) {
    alerts.push({
      id: 'heat',
      severity: 'warning',
      title: 'High Temperature',
      body: `Temperature is ${device.telemetry.temperature}°C, above recommended ${device.config.thresholds.tempMax}°C.`,
      plantName: device.config.plantName,
      ts: Date.now() - 1800000,
      status: 'unread',
    });
  }

  alerts.push({
    id: 'watered',
    severity: 'info',
    title: 'Auto-watering Completed',
    body: `${device.config.plantName} was watered for 5s. Moisture rose from 27% to 47%.`,
    plantName: device.config.plantName,
    ts: Date.now() - 14400000,
    status: 'read',
  });

  return alerts;
}

export default function AlertsScreen() {
  const { colors, radii, spacing } = useAppTheme();
  const device = useLiveDevice((s) => s.devices[s.activeDeviceId]);
  const refillBottle = useLiveDevice((s) => s.refillBottle);

  const [alerts, setAlerts] = useState<AppAlert[]>(() =>
    buildAlertsFromDevice(device)
  );

  const markRead = (id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'read' } : a))
    );
  };

  const snooze = (id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'snoozed' } : a))
    );
  };

  const handleAction = (alert: AppAlert) => {
    if (alert.id === 'bottle') {
      refillBottle();
      markRead(alert.id);
    } else {
      markRead(alert.id);
    }
  };

  const unreadAlerts = alerts.filter((a) => a.status === 'unread');
  const readAlerts = alerts.filter((a) => a.status !== 'unread');

  const criticalAlerts = unreadAlerts.filter((a) => a.severity === 'critical');
  const warningAlerts = unreadAlerts.filter((a) => a.severity === 'warning');
  const infoAlerts = unreadAlerts.filter((a) => a.severity === 'info');

  const isEmpty = alerts.length === 0 || unreadAlerts.length === 0;

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { padding: spacing.md }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={[styles.title, { color: colors.text }]}>Alerts</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {unreadAlerts.length > 0
            ? `${unreadAlerts.length} item${unreadAlerts.length > 1 ? 's' : ''} need your attention`
            : 'All caught up'}
        </Text>

        {/* Empty state */}
        {isEmpty && (
          <Animated.View
            entering={FadeIn.delay(200)}
            style={styles.emptyState}
          >
            <View
              style={[
                styles.emptyIconWrap,
                { backgroundColor: colors.palette.mint },
              ]}
            >
              <Ionicons
                name="leaf"
                size={40}
                color={colors.palette.forest}
              />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              All calm
            </Text>
            <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
              Your plant is happy and healthy. No alerts to review.
            </Text>
          </Animated.View>
        )}

        {/* Pinned critical banner */}
        {criticalAlerts.length > 0 && (
          <View
            style={[
              styles.criticalBanner,
              {
                backgroundColor: '#FFECEC',
                borderRadius: radii.card,
                borderColor: colors.palette.critical,
              },
            ]}
          >
            <Ionicons
              name="alert-circle"
              size={20}
              color={colors.palette.critical}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.bannerTitle, { color: colors.palette.critical }]}>
                {criticalAlerts[0].title}
              </Text>
              <Text style={[styles.bannerBody, { color: '#8B3040' }]}>
                {criticalAlerts[0].body}
              </Text>
            </View>
            {criticalAlerts[0].actionLabel && (
              <TouchableOpacity
                style={[
                  styles.bannerAction,
                  {
                    backgroundColor: colors.palette.critical,
                    borderRadius: radii.md,
                  },
                ]}
                onPress={() => handleAction(criticalAlerts[0])}
              >
                <Text style={styles.bannerActionText}>
                  {criticalAlerts[0].actionLabel}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Severity groups */}
        {[
          { label: 'Critical', alerts: criticalAlerts, severity: 'critical' as AlertSeverity },
          { label: 'Warning', alerts: warningAlerts, severity: 'warning' as AlertSeverity },
          { label: 'Info', alerts: infoAlerts, severity: 'info' as AlertSeverity },
        ].map(({ label, alerts: groupAlerts, severity }) =>
          groupAlerts.length > 0 ? (
            <View key={severity} style={styles.group}>
              <Text style={[styles.groupLabel, { color: colors.textMuted }]}>
                {label}
              </Text>
              {groupAlerts.map((alert) => (
                <SwipeableAlertCard
                  key={alert.id}
                  alert={alert}
                  onMarkRead={() => markRead(alert.id)}
                  onSnooze={() => snooze(alert.id)}
                  onAction={() => handleAction(alert)}
                  colors={colors}
                  radii={radii}
                />
              ))}
            </View>
          ) : null
        )}

        {/* Read / snoozed section */}
        {readAlerts.length > 0 && (
          <View style={styles.group}>
            <Text style={[styles.groupLabel, { color: colors.textMuted }]}>
              Resolved
            </Text>
            {readAlerts.map((alert) => (
              <View
                key={alert.id}
                style={[
                  styles.readCard,
                  {
                    backgroundColor: `${colors.palette.white}80`,
                    borderRadius: radii.md,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={16}
                  color={colors.palette.sage}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.textMuted }]}>
                    {alert.title}
                  </Text>
                  <Text style={[styles.cardTime, { color: colors.textMuted }]}>
                    {formatTime(alert.ts)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── SwipeableAlertCard ──────────────────────────────────────────────────────

interface SwipeableAlertCardProps {
  alert: AppAlert;
  onMarkRead: () => void;
  onSnooze: () => void;
  onAction: () => void;
  colors: ReturnType<typeof useAppTheme>['colors'];
  radii: ReturnType<typeof useAppTheme>['radii'];
}

function SwipeableAlertCard({
  alert,
  onMarkRead,
  onSnooze,
  onAction,
  colors,
  radii,
}: SwipeableAlertCardProps) {
  const sev = SEVERITY_COLORS[alert.severity];
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  const panStartX = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      panStartX.value = translateX.value;
    })
    .onUpdate((event) => {
      translateX.value = panStartX.value + event.translationX;
    })
    .onEnd((event) => {
      if (event.translationX > 80) {
        // Swipe right → mark read
        translateX.value = withTiming(400, { duration: 280 });
        opacity.value = withTiming(0, { duration: 280 });
        runOnJS(onMarkRead)();
      } else if (event.translationX < -80) {
        // Swipe left → snooze
        translateX.value = withTiming(-400, { duration: 280 });
        opacity.value = withTiming(0, { duration: 280 });
        runOnJS(onSnooze)();
      } else {
        translateX.value = withTiming(0, { duration: 240 });
      }
    });

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          styles.alertCard,
          {
            backgroundColor: sev.bg,
            borderRadius: radii.card,
            borderColor: sev.border,
            borderLeftWidth: 4,
          },
          cardAnimStyle,
        ]}
        entering={FadeIn.springify()}
      >
        {/* Swipe hint row */}
        <View style={styles.swipeHint}>
          <View style={styles.swipeHintLeft}>
            <Ionicons name="checkmark" size={10} color={colors.palette.forest} />
            <Text style={[styles.swipeHintText, { color: colors.palette.forest }]}>
              Read
            </Text>
          </View>
          <View style={styles.swipeHintRight}>
            <Text style={[styles.swipeHintText, { color: colors.palette.sage }]}>
              Snooze
            </Text>
            <Ionicons name="time-outline" size={10} color={colors.palette.sage} />
          </View>
        </View>

        <View style={styles.cardContent}>
          <Ionicons name={sev.icon} size={20} color={sev.text} />
          <View style={{ flex: 1 }}>
            <View style={styles.cardTitleRow}>
              <Text style={[styles.cardTitle, { color: sev.text }]}>
                {alert.title}
              </Text>
              <Text style={[styles.cardTime, { color: `${sev.text}80` }]}>
                {formatTime(alert.ts)}
              </Text>
            </View>
            <Text style={[styles.cardBody, { color: `${sev.text}CC` }]}>
              {alert.body}
            </Text>
            {alert.actionLabel && (
              <TouchableOpacity
                onPress={onAction}
                style={[
                  styles.cardAction,
                  {
                    backgroundColor: sev.border,
                    borderRadius: radii.md,
                  },
                ]}
              >
                <Text style={styles.cardActionText}>{alert.actionLabel}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

function formatTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffH = Math.floor(diffMs / 3600000);
  const diffMin = Math.floor((diffMs % 3600000) / 60000);
  if (diffH > 0) return `${diffH}h ago`;
  if (diffMin > 0) return `${diffMin}m ago`;
  return 'just now';
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { paddingBottom: 120 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
  subtitle: { fontSize: 14, fontWeight: '400', marginBottom: 20 },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 14 },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  criticalBanner: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, gap: 12, borderWidth: 1.5, marginBottom: 16,
  },
  bannerTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  bannerBody: { fontSize: 12, fontWeight: '400', lineHeight: 17 },
  bannerAction: {
    paddingHorizontal: 12, paddingVertical: 8,
  },
  bannerActionText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  group: { marginBottom: 20, gap: 10 },
  groupLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 4,
  },
  alertCard: {
    borderWidth: 1, overflow: 'hidden',
  },
  swipeHint: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingTop: 6, opacity: 0.5,
  },
  swipeHintLeft: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  swipeHintRight: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  swipeHintText: { fontSize: 9, fontWeight: '600' },
  cardContent: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 14, gap: 10,
  },
  cardTitleRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 4,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  cardTime: { fontSize: 11, fontWeight: '500', marginLeft: 8 },
  cardBody: { fontSize: 12, fontWeight: '400', lineHeight: 17 },
  cardAction: {
    alignSelf: 'flex-start', paddingHorizontal: 12,
    paddingVertical: 7, marginTop: 10,
  },
  cardActionText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  readCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, gap: 10, borderWidth: 1,
  },
});
