import { formatAlertTime as formatTime } from '@/utils/alerts';
/**
 * Alerts Screen – "Inbox Stack"
 * Severity-grouped alert inbox with swipe gestures.
 * - Critical: #C0505E accent
 * - Warning: blush
 * - Info: lime
 * uiLayout.md Section 6
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
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
import { useAlertEngine, AppAlert, AlertSeverity } from '@/hooks/useAlertEngine';
import { useLiveDevice } from '@/store/useLiveDevice';
import { useSession } from '@/store/useSession';
import { formatTemperatureText } from '@/utils/temperature';
import { RefillConfirmationModal } from '@/components/RefillConfirmation';

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

export default function AlertsScreen() {
  const { colors, radii, spacing } = useAppTheme();
  const tempUnit = useSession((s) => s.prefs.units);
  const device = useLiveDevice((s) => s.devices[s.activeDeviceId]);
  const pairingStatus = useSession((s) => s.pairingStatus);
  const {
    alerts,
    unreadAlerts,
    criticalAlerts,
    markRead,
    markAllRead,
    snooze,
    handleAction,
    isCloudSynced,
  } = useAlertEngine();

  const [refillTargetAlert, setRefillTargetAlert] = useState<AppAlert | null>(null);

  const onAlertAction = useCallback(
    (alert: AppAlert) => {
      if (alert.type === 'bottle' || alert.type === 'LOW_WATER' || alert.actionLabel === 'I Refilled') {
        setRefillTargetAlert(alert);
      } else {
        handleAction(alert);
      }
    },
    [handleAction]
  );

  if (!device || pairingStatus === 'unpaired') {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconWrapCTA, { backgroundColor: colors.palette.lime }]}>
            <Ionicons name="notifications-outline" size={56} color={colors.palette.forest} />
          </View>
          <Text style={[styles.emptyTitleCTA, { color: colors.text }]}>
            No Controller Paired
          </Text>
          <Text style={[styles.emptySubtitleCTA, { color: colors.textMuted }]}>
            Pair your plant controller to receive real-time vitals and plant care alerts.
          </Text>
          <TouchableOpacity
            style={[
              styles.emptyActionBtn,
              { backgroundColor: colors.palette.forest, borderRadius: radii.full },
            ]}
            onPress={() => router.push('/add-device')}
          >
            <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.emptyActionBtnText}>Pair Controller</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const renderItem = ({ item }: { item: AppAlert }) => {
    const isResolved =
      item.status === 'resolved' || item.status === 'read' || item.status === 'snoozed';

    if (isResolved) {
      return (
        <View
          key={item.id}
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
              {formatTemperatureText(item.title, tempUnit)}
            </Text>
            <Text style={[styles.cardBody, { color: colors.textMuted }]}>
              {formatTemperatureText(item.message, tempUnit)}
            </Text>
            <Text style={[styles.cardTime, { color: colors.textMuted }]}>
              {formatTime(item.createdAt)}
            </Text>
          </View>
        </View>
      );
    }

    return (
      <SwipeableAlertCard
        key={item.id}
        alert={item}
        tempUnit={tempUnit}
        onMarkRead={() => markRead(item.id)}
        onSnooze={() => snooze(item.id)}
        onAction={() => onAlertAction(item)}
        colors={colors}
        radii={radii}
      />
    );
  };

  const listHeader = (
    <View style={styles.headerWrap}>
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[styles.title, { color: colors.text }]}>Alerts</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: radii.sm,
              backgroundColor: isCloudSynced ? `${colors.palette.forest}15` : `${colors.palette.sage}20`,
            }}
          >
            <Ionicons
              name={isCloudSynced ? 'cloud-done-outline' : 'hardware-chip-outline'}
              size={12}
              color={isCloudSynced ? colors.palette.forest : colors.palette.sage}
            />
            <Text
              style={{
                fontSize: 10,
                fontWeight: '700',
                color: isCloudSynced ? colors.palette.forest : colors.palette.sage,
              }}
            >
              {isCloudSynced ? 'Cloud Synced' : 'Local Engine'}
            </Text>
          </View>
          {unreadAlerts.length > 0 && (
            <TouchableOpacity onPress={markAllRead}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.palette.forest }}>
                Mark all read
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>
        {unreadAlerts.length > 0
          ? `${unreadAlerts.length} item${unreadAlerts.length > 1 ? 's' : ''} need your attention`
          : 'All caught up'}
      </Text>

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
              {formatTemperatureText(criticalAlerts[0].title, tempUnit)}
            </Text>
            <Text style={[styles.bannerBody, { color: '#8B3040' }]}>
              {formatTemperatureText(
                criticalAlerts[0].message?.trim() ||
                  criticalAlerts[0].description?.trim() ||
                  criticalAlerts[0].body?.trim() ||
                  'Critical system notice.',
                tempUnit
              )}
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
              onPress={() => onAlertAction(criticalAlerts[0])}
            >
              <Text style={styles.bannerActionText}>
                {criticalAlerts[0].actionLabel}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );

  const listEmpty = (
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
        No alerts to review.
      </Text>
    </Animated.View>
  );

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={<View style={{ height: 120 }} />}
        contentContainerStyle={[styles.container, { padding: spacing.md }]}
        showsVerticalScrollIndicator={false}
      />

      <RefillConfirmationModal
        visible={Boolean(refillTargetAlert)}
        deviceId={refillTargetAlert?.deviceId || ''}
        controllerName={refillTargetAlert?.title || 'Plant Controller'}
        onClose={() => setRefillTargetAlert(null)}
        onSuccess={() => {
          if (refillTargetAlert) {
            markRead(refillTargetAlert.id);
          }
        }}
      />
    </SafeAreaView>
  );
}

// ─── SwipeableAlertCard ──────────────────────────────────────────────────────

interface SwipeableAlertCardProps {
  alert: AppAlert;
  tempUnit: 'C' | 'F';
  onMarkRead: () => void;
  onSnooze: () => void;
  onAction: () => void;
  colors: ReturnType<typeof useAppTheme>['colors'];
  radii: ReturnType<typeof useAppTheme>['radii'];
}

function SwipeableAlertCard({
  alert,
  tempUnit,
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

  const displayTitle = formatTemperatureText(alert.title, tempUnit);
  const displayBody = formatTemperatureText(alert.message, tempUnit);
  const timestamp = alert.createdAt;

  return (
    <Animated.View entering={FadeIn.springify()}>
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
                  {displayTitle}
                </Text>
                <Text style={[styles.cardTime, { color: `${sev.text}80` }]}>
                  {formatTime(timestamp)}
                </Text>
              </View>
              <Text style={[styles.cardBody, { color: `${sev.text}CC` }]}>
                {displayBody}
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { paddingBottom: 120 },
  headerWrap: { marginBottom: 12 },
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
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIconWrapCTA: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitleCTA: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtitleCTA: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  emptyActionBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
