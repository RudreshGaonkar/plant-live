import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';
import { WaterLog } from '@/store/useLiveDevice';
import { AppAlert } from '@/hooks/useAlertEngine';

export type TimelineEvent =
  | {
      id: string;
      kind: 'water';
      ts: number;
      trigger: 'auto' | 'manual';
      durationSec: number;
      moistureBefore: number;
      moistureAfter: number;
      note?: string;
    }
  | {
      id: string;
      kind: 'alert';
      ts: number;
      severity: 'critical' | 'warning' | 'info';
      title: string;
      message: string;
      type: string;
    };

interface EventTimelineProps {
  waterLogs: WaterLog[];
  alerts: AppAlert[];
}

function formatRelativeTime(ts: number | undefined): string {
  const parsed = typeof ts === 'number' ? ts : Number(ts);
  if (!ts || !isFinite(parsed) || parsed <= 0) return 'Just now';
  const diffMs = Date.now() - parsed;
  if (diffMs < 0) return 'Just now';
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffH / 24);

  if (diffMin < 2) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD === 1) return 'Yesterday';
  if (diffD < 7) return `${diffD}d ago`;

  const date = new Date(parsed);
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function EventTimeline({ waterLogs, alerts }: EventTimelineProps) {
  const { colors, radii } = useAppTheme();
  const [filter, setFilter] = useState<'all' | 'water' | 'alert'>('all');

  // Merge and sort newest first
  const combinedEvents: TimelineEvent[] = React.useMemo(() => {
    const list: TimelineEvent[] = [];

    waterLogs.forEach((w) => {
      list.push({
        id: `w-${w.id}`,
        kind: 'water',
        ts: w.ts,
        trigger: w.trigger,
        durationSec: w.durationSec,
        moistureBefore: w.moistureBefore,
        moistureAfter: w.moistureAfter,
        note: w.note,
      });
    });

    alerts.forEach((a) => {
      list.push({
        id: `a-${a.id}`,
        kind: 'alert',
        ts: a.ts,
        severity: a.severity,
        title: a.title,
        message: a.body,
        type: a.type,
      });
    });

    list.sort((a, b) => b.ts - a.ts);
    return list;
  }, [waterLogs, alerts]);

  const filteredEvents = combinedEvents.filter((e) => {
    if (filter === 'water') return e.kind === 'water';
    if (filter === 'alert') return e.kind === 'alert';
    return true;
  });

  return (
    <View style={styles.container}>
      {/* ── Section Header ──────────────────────────────────── */}
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            What Happened
          </Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
            Chronological watering cycles & alerts
          </Text>
        </View>

        {/* Filter Chips */}
        <View
          style={[
            styles.filterPillGroup,
            { backgroundColor: `${colors.palette.sage}15`, borderRadius: radii.full },
          ]}
        >
          {(['all', 'water', 'alert'] as const).map((tab) => {
            const isActive = filter === tab;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setFilter(tab)}
                style={[
                  styles.filterBtn,
                  {
                    backgroundColor: isActive ? colors.palette.forest : 'transparent',
                    borderRadius: radii.full,
                  },
                ]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.filterBtnText,
                    {
                      color: isActive ? colors.palette.white : colors.palette.sage,
                    },
                  ]}
                >
                  {tab === 'all' ? 'All' : tab === 'water' ? 'Waters' : 'Alerts'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Timeline List ───────────────────────────────────── */}
      {filteredEvents.length === 0 ? (
        <View
          style={[
            styles.emptyCard,
            {
              backgroundColor: colors.palette.white,
              borderRadius: radii.card,
              borderColor: colors.border,
            },
          ]}
        >
          <Ionicons
            name="calendar-outline"
            size={28}
            color={colors.palette.sage}
          />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            No events recorded for this selection.
          </Text>
        </View>
      ) : (
        <View style={styles.timelineList}>
          {filteredEvents.map((event, index) => {
            const isLast = index === filteredEvents.length - 1;
            const isWater = event.kind === 'water';

            return (
              <View key={event.id} style={styles.timelineItem}>
                {/* ── Left Node & Connecting Line ─────────────── */}
                <View style={styles.leftColumn}>
                  <View
                    style={[
                      styles.nodeIconCircle,
                      {
                        backgroundColor: isWater
                          ? colors.palette.forest
                          : event.severity === 'critical'
                          ? colors.palette.critical
                          : '#D97706',
                        borderColor: colors.palette.white,
                      },
                    ]}
                  >
                    <Ionicons
                      name={isWater ? 'water' : 'alert-circle'}
                      size={12}
                      color={colors.palette.white}
                    />
                  </View>

                  {!isLast && (
                    <View
                      style={[
                        styles.connectingLine,
                        { backgroundColor: `${colors.palette.sage}30` },
                      ]}
                    />
                  )}
                </View>

                {/* ── Event Details Card ─────────────────────── */}
                <View
                  style={[
                    styles.eventCard,
                    {
                      backgroundColor: isWater
                        ? '#F4F9EC' // Lime tint
                        : event.severity === 'critical'
                        ? '#FFF0F2' // Blush critical tint
                        : '#FFF8EB', // Warning amber tint
                      borderColor: isWater
                        ? `${colors.palette.lime}90`
                        : `${colors.palette.blush}90`,
                      borderRadius: radii.card,
                    },
                  ]}
                >
                  {/* Card Header: Type Badge + Time Ago */}
                  <View style={styles.cardHeader}>
                    <View style={styles.badgeRow}>
                      <View
                        style={[
                          styles.kindBadge,
                          {
                            backgroundColor: isWater
                              ? `${colors.palette.forest}20`
                              : `${colors.palette.critical}20`,
                            borderRadius: radii.sm,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.kindBadgeText,
                            {
                              color: isWater
                                ? colors.palette.forest
                                : colors.palette.critical,
                            },
                          ]}
                        >
                          {isWater
                            ? `${(event.trigger ?? 'manual').toUpperCase()} WATER`
                            : `${(event.severity ?? 'info').toUpperCase()} ALERT`}
                        </Text>
                      </View>

                      {isWater && (
                        <Text
                          style={[
                            styles.durationChipText,
                            { color: colors.palette.forest },
                          ]}
                        >
                          · {event.durationSec}s run
                        </Text>
                      )}
                    </View>

                    <Text style={[styles.timeText, { color: colors.textMuted }]}>
                      {formatRelativeTime(event.ts)}
                    </Text>
                  </View>

                  {/* Body Details */}
                  {isWater ? (
                    <View style={styles.waterDetails}>
                      <View style={styles.shiftRow}>
                        <Text
                          style={[styles.shiftLabel, { color: colors.text }]}
                        >
                          Moisture Shift:
                        </Text>
                        <Text
                          style={[
                            styles.shiftValues,
                            { color: colors.palette.forest },
                          ]}
                        >
                          {event.moistureBefore}% → {event.moistureAfter}%
                        </Text>
                        <Text
                          style={[
                            styles.gainBadge,
                            { color: colors.palette.forest },
                          ]}
                        >
                          (+{event.moistureAfter - event.moistureBefore}%)
                        </Text>
                      </View>

                      {event.note ? (
                        <View style={styles.noteRow}>
                          <Ionicons
                            name="information-circle-outline"
                            size={12}
                            color={colors.palette.sage}
                          />
                          <Text
                            style={[
                              styles.noteText,
                              { color: colors.palette.sage },
                            ]}
                          >
                            {event.note}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : (
                    <View style={styles.alertDetails}>
                      <Text
                        style={[
                          styles.alertTitle,
                          {
                            color:
                              event.severity === 'critical'
                                ? colors.palette.critical
                                : '#92400E',
                          },
                        ]}
                      >
                        {event.title}
                      </Text>
                      <Text
                        style={[
                          styles.alertMessage,
                          { color: colors.palette.ink },
                        ]}
                      >
                        {event.message}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  filterPillGroup: {
    flexDirection: 'row',
    padding: 3,
  },
  filterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  filterBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '500',
  },
  timelineList: {
    gap: 0,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  leftColumn: {
    alignItems: 'center',
    width: 24,
  },
  nodeIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    elevation: 2,
  },
  connectingLine: {
    flex: 1,
    width: 2,
    marginTop: 2,
  },
  eventCard: {
    flex: 1,
    padding: 14,
    borderWidth: 1.5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  kindBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  kindBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  durationChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  timeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  waterDetails: {
    gap: 4,
  },
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shiftLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  shiftValues: {
    fontSize: 13,
    fontWeight: '800',
  },
  gainBadge: {
    fontSize: 12,
    fontWeight: '700',
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  noteText: {
    fontSize: 11,
    fontWeight: '500',
    fontStyle: 'italic',
  },
  alertDetails: {
    gap: 2,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  alertMessage: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  },
});
