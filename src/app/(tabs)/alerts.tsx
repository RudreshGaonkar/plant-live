/**
 * Alerts Screen – "Inbox Stack"
 * Severity-grouped alert inbox with swipe gestures.
 * - Critical: #C0505E accent
 * - Warning: blush
 * - Info: lime
 * uiLayout.md Section 6
 */
import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
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
import { useAlertEngine, AppAlert, AlertSeverity } from '@/hooks/useAlertEngine';

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

  const getAlertTime = (alert: AppAlert) =>
    alert.timestamp ?? alert.createdAt ?? alert.ts ?? 0;

  // Filter displayed alerts strictly to today only (timestamp >= startOfTodayMs), sorted newest-first
  const startOfTodayMs = useMemo(() => new Date().setHours(0, 0, 0, 0), []);

  const todayAlerts = useMemo(() => {
    return alerts
      .filter((alert) => getAlertTime(alert) >= startOfTodayMs)
      .sort((a, b) => getAlertTime(b) - getAlertTime(a));
  }, [alerts, startOfTodayMs]);

  // Cap rendered items to max 25 items
  const cappedAlerts = useMemo(() => todayAlerts.slice(0, 25), [todayAlerts]);

  const todayUnread = useMemo(
    () => unreadAlerts.filter((a) => getAlertTime(a) >= startOfTodayMs),
    [unreadAlerts, startOfTodayMs]
  );

  const todayCritical = useMemo(
    () => criticalAlerts.filter((a) => getAlertTime(a) >= startOfTodayMs),
    [criticalAlerts, startOfTodayMs]
  );

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
              {item.title?.trim() || 'System Notice'}
            </Text>
            <Text style={[styles.cardTime, { color: colors.textMuted }]}>
              {formatTime(item.ts ?? item.timestamp ?? item.createdAt)}
            </Text>
          </View>
        </View>
      );
    }

    return (
      <SwipeableAlertCard
        key={item.id}
        alert={item}
        onMarkRead={() => markRead(item.id)}
        onSnooze={() => snooze(item.id)}
        onAction={() => handleAction(item)}
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
          {todayUnread.length > 0 && (
            <TouchableOpacity onPress={markAllRead}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.palette.forest }}>
                Mark all read
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>
        {todayUnread.length > 0
          ? `${todayUnread.length} item${todayUnread.length > 1 ? 's' : ''} need your attention`
          : 'All caught up'}
      </Text>

      {/* Pinned critical banner */}
      {todayCritical.length > 0 && (
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
              {todayCritical[0].title?.trim() || 'System Notice'}
            </Text>
            <Text style={[styles.bannerBody, { color: '#8B3040' }]}>
              {todayCritical[0].message?.trim() ||
                todayCritical[0].description?.trim() ||
                todayCritical[0].body?.trim() ||
                'Critical system notice.'}
            </Text>
          </View>
          {todayCritical[0].actionLabel && (
            <TouchableOpacity
              style={[
                styles.bannerAction,
                {
                  backgroundColor: colors.palette.critical,
                  borderRadius: radii.md,
                },
              ]}
              onPress={() => handleAction(todayCritical[0])}
            >
              <Text style={styles.bannerActionText}>
                {todayCritical[0].actionLabel}
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
        Your plant is happy and healthy. No alerts to review.
      </Text>
    </Animated.View>
  );

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <FlatList
        data={cappedAlerts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={<View style={{ height: 120 }} />}
        contentContainerStyle={[styles.container, { padding: spacing.md }]}
        showsVerticalScrollIndicator={false}
      />
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

  const displayTitle = (alert.title && alert.title.trim().length > 0)
    ? alert.title.trim()
    : 'System Notice';

  const displayBody = (alert.message && alert.message.trim().length > 0)
    ? alert.message.trim()
    : (alert.description && alert.description.trim().length > 0)
    ? alert.description.trim()
    : (alert.body && alert.body.trim().length > 0)
    ? alert.body.trim()
    : '';

  const timestamp = alert.createdAt ?? alert.ts ?? alert.timestamp;

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

function formatTime(ts: number | undefined): string {
  const parsed = typeof ts === 'number' ? ts : Number(ts);
  if (!ts || !isFinite(parsed) || parsed <= 0) return 'Just now';
  const diffMs = Date.now() - parsed;
  if (diffMs < 0) return 'Just now';
  const diffH = Math.floor(diffMs / 3600000);
  const diffMin = Math.floor((diffMs % 3600000) / 60000);
  if (diffH >= 24) {
    const diffD = Math.floor(diffH / 24);
    return `${diffD}d ago`;
  }
  if (diffH > 0) return `${diffH}h ago`;
  if (diffMin > 0) return `${diffMin}m ago`;
  return 'just now';
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
});
