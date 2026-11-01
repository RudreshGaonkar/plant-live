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
import { DeviceHistoryRecord } from '@/services/devices';

export type WateringEventType = 'MANUAL_WATER' | 'AUTO_WATER' | 'PUMP_PULSE' | 'TELEMETRY_LOG';

export interface TimelineEvent {
  id: string;
  kind: 'water' | 'telemetry';
  eventType: WateringEventType;
  ts: number;
  timestamp: number;
  // Water specific
  trigger?: 'auto' | 'manual' | 'pulse';
  durationSec?: number;
  moistureBefore?: number;
  moistureAfter?: number;
  note?: string;
  // Telemetry specific
  soilMoisture?: number;
  temperature?: number;
  humidity?: number;
  light?: number | null;
}

interface EventTimelineProps {
  waterLogs: WaterLog[];
  telemetryHistory?: DeviceHistoryRecord[];
  alerts?: unknown[];
}

const PAGE_SIZE = 8;

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
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function EventTimeline({ waterLogs, telemetryHistory = [] }: EventTimelineProps) {
  const { colors, radii } = useAppTheme();
  const [filter, setFilter] = useState<'all' | 'water' | 'telemetry' | 'auto' | 'manual'>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Reset pagination when filter changes
  const handleFilterChange = (newFilter: 'all' | 'water' | 'telemetry' | 'auto' | 'manual') => {
    setFilter(newFilter);
    setCurrentPage(1);
  };

  // Strictly combines watering activity logs and telemetry snapshots
  // Sorted in descending order by timestamp (b.timestamp - a.timestamp) so latest events always render at top
  const combinedEvents: TimelineEvent[] = React.useMemo(() => {
    const list: TimelineEvent[] = [];

    // 1. Ingest Water Logs
    (waterLogs || []).forEach((w) => {
      let eventType: WateringEventType = 'MANUAL_WATER';
      let trigger: 'auto' | 'manual' | 'pulse' = 'manual';

      const trigStr = String(w.trigger || '').toLowerCase();
      const noteStr = String(w.note || '').toLowerCase();

      if (trigStr === 'auto' || trigStr === 'auto_water') {
        eventType = 'AUTO_WATER';
        trigger = 'auto';
      } else if (trigStr === 'pulse' || trigStr === 'pump_pulse' || noteStr.includes('pulse')) {
        eventType = 'PUMP_PULSE';
        trigger = 'pulse';
      } else {
        eventType = 'MANUAL_WATER';
        trigger = 'manual';
      }

      const itemTs = w.ts || (w as unknown as { timestamp?: number }).timestamp || 0;
      list.push({
        id: `w-${w.id}`,
        kind: 'water',
        eventType,
        ts: itemTs,
        timestamp: itemTs,
        trigger,
        durationSec: w.durationSec,
        moistureBefore: w.moistureBefore,
        moistureAfter: w.moistureAfter,
        note: w.note,
      });
    });

    // 2. Ingest Telemetry History Snapshots
    (telemetryHistory || []).forEach((t) => {
      const itemTs = t.timestamp ?? t.ts ?? 0;
      list.push({
        id: `t-${t.id}`,
        kind: 'telemetry',
        eventType: 'TELEMETRY_LOG',
        ts: itemTs,
        timestamp: itemTs,
        soilMoisture: t.soilMoisture,
        temperature: t.temperature,
        humidity: t.humidity,
        light: t.light,
      });
    });

    // Explicit descending sort: b.timestamp - a.timestamp (latest events always render at the top)
    list.sort((a, b) => b.timestamp - a.timestamp);
    return list;
  }, [waterLogs, telemetryHistory]);

  const filteredEvents = React.useMemo(() => {
    return combinedEvents.filter((e) => {
      if (filter === 'water') return e.kind === 'water';
      if (filter === 'telemetry') return e.kind === 'telemetry';
      if (filter === 'auto') return e.eventType === 'AUTO_WATER';
      if (filter === 'manual') return e.eventType === 'MANUAL_WATER' || e.eventType === 'PUMP_PULSE';
      return true;
    });
  }, [combinedEvents, filter]);

  // Paginated slice: page size 15 items
  const totalCount = filteredEvents.length;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
  const displayedCount = Math.min(currentPage * PAGE_SIZE, totalCount);
  const displayedEvents = React.useMemo(() => {
    return filteredEvents.slice(0, displayedCount);
  }, [filteredEvents, displayedCount]);

  const hasMore = displayedCount < totalCount;

  return (
    <View style={styles.container}>
      {/* ── Section Header ──────────────────────────────────── */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Activity &amp; Telemetry Logs
          </Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
            Latest events first · {totalCount} total entries
          </Text>
        </View>

        {/* Filter Chips */}
        <View
          style={[
            styles.filterPillGroup,
            { backgroundColor: `${colors.palette.sage}15`, borderRadius: radii.full },
          ]}
        >
          {(['all', 'water', 'telemetry', 'auto', 'manual'] as const).map((tab) => {
            const isActive = filter === tab;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => handleFilterChange(tab)}
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
                  {tab === 'all'
                    ? 'All'
                    : tab === 'water'
                    ? 'Water'
                    : tab === 'telemetry'
                    ? 'Telemetry'
                    : tab === 'auto'
                    ? 'Auto'
                    : 'Manual'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Timeline List ───────────────────────────────────── */}
      {displayedEvents.length === 0 ? (
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
          {displayedEvents.map((event, index) => {
            const isLast = index === displayedEvents.length - 1;
            const isWater = event.kind === 'water';

            return (
              <View key={event.id} style={styles.timelineItem}>
                {/* ── Left Node & Connecting Line ─────────────── */}
                <View style={styles.leftColumn}>
                  <View
                    style={[
                      styles.nodeIconCircle,
                      {
                        backgroundColor: isWater ? colors.palette.forest : colors.palette.sage,
                        borderColor: colors.palette.white,
                      },
                    ]}
                  >
                    <Ionicons
                      name={isWater ? 'water' : 'pulse'}
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
                {isWater ? (
                  <View
                    style={[
                      styles.eventCard,
                      {
                        backgroundColor: '#F4F9EC', // Lime tint
                        borderColor: `${colors.palette.lime}90`,
                        borderRadius: radii.card,
                      },
                    ]}
                  >
                    {/* Card Header: Type Badge (MANUAL_WATER, AUTO_WATER, PUMP_PULSE) + Time Ago */}
                    <View style={styles.cardHeader}>
                      <View style={styles.badgeRow}>
                        <View
                          style={[
                            styles.kindBadge,
                            {
                              backgroundColor: `${colors.palette.forest}20`,
                              borderRadius: radii.sm,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.kindBadgeText,
                              {
                                color: colors.palette.forest,
                              },
                            ]}
                          >
                            {event.eventType}
                          </Text>
                        </View>

                        <Text
                          style={[
                            styles.durationChipText,
                            { color: colors.palette.forest },
                          ]}
                        >
                          · {event.durationSec}s run
                        </Text>
                      </View>

                      <Text style={[styles.timeText, { color: colors.textMuted }]}>
                        {formatRelativeTime(event.timestamp)}
                      </Text>
                    </View>

                    {/* Body Details: Moisture Shift */}
                    <View style={styles.waterDetails}>
                      <View style={styles.shiftRow}>
                        <Text style={[styles.shiftLabel, { color: colors.text }]}>
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
                          (+{(event.moistureAfter ?? 0) - (event.moistureBefore ?? 0)}%)
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
                  </View>
                ) : (
                  <View
                    style={[
                      styles.eventCard,
                      {
                        backgroundColor: '#F0FDF4', // Mint tint
                        borderColor: '#86EFAC',
                        borderRadius: radii.card,
                      },
                    ]}
                  >
                    {/* Card Header: TELEMETRY SNAPSHOT + Time Ago */}
                    <View style={styles.cardHeader}>
                      <View style={styles.badgeRow}>
                        <View
                          style={[
                            styles.kindBadge,
                            {
                              backgroundColor: `${colors.palette.sage}25`,
                              borderRadius: radii.sm,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.kindBadgeText,
                              {
                                color: colors.palette.forest,
                              },
                            ]}
                          >
                            TELEMETRY SNAPSHOT
                          </Text>
                        </View>
                      </View>

                      <Text style={[styles.timeText, { color: colors.textMuted }]}>
                        {formatRelativeTime(event.timestamp)}
                      </Text>
                    </View>

                    {/* Telemetry Sensor Metrics Grid */}
                    <View style={styles.telemetryMetricsRow}>
                      <View style={styles.telemPill}>
                        <Text style={styles.telemLabel}>Moisture</Text>
                        <Text style={[styles.telemValue, { color: colors.palette.forest }]}>
                          {event.soilMoisture ?? '--'}%
                        </Text>
                      </View>
                      <View style={styles.telemPill}>
                        <Text style={styles.telemLabel}>Temp</Text>
                        <Text style={[styles.telemValue, { color: colors.palette.ink }]}>
                          {event.temperature ?? '--'}°C
                        </Text>
                      </View>
                      <View style={styles.telemPill}>
                        <Text style={styles.telemLabel}>Humidity</Text>
                        <Text style={[styles.telemValue, { color: colors.palette.ink }]}>
                          {event.humidity ?? '--'}%
                        </Text>
                      </View>
                      <View style={styles.telemPill}>
                        <Text style={styles.telemLabel}>Light</Text>
                        <Text style={[styles.telemValue, { color: colors.palette.ink }]}>
                          {event.light === 1
                            ? 'Bright'
                            : event.light === 0
                            ? 'Dim'
                            : typeof event.light === 'number'
                            ? `${event.light}%`
                            : '--'}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* ── Pagination Controls (15 Items Per Page) ─────────── */}
      {totalCount > PAGE_SIZE && (
        <View style={styles.paginationContainer}>
          <Text style={[styles.paginationCountText, { color: colors.textMuted }]}>
            Showing {displayedCount} of {totalCount} logs (Page {currentPage} of {totalPages})
          </Text>

          <View style={styles.paginationButtonsRow}>
            {hasMore ? (
              <TouchableOpacity
                style={[
                  styles.loadMoreBtn,
                  {
                    backgroundColor: colors.palette.forest,
                    borderRadius: radii.md,
                  },
                ]}
                onPress={() => setCurrentPage((p) => p + 1)}
                activeOpacity={0.8}
              >
                <Ionicons name="arrow-down-circle-outline" size={16} color={colors.palette.white} />
                <Text style={styles.loadMoreBtnText}>
                  Load More (+{Math.min(PAGE_SIZE, totalCount - displayedCount)})
                </Text>
              </TouchableOpacity>
            ) : null}

            {currentPage > 1 && (
              <TouchableOpacity
                style={[
                  styles.collapseBtn,
                  {
                    borderColor: colors.border,
                    borderRadius: radii.md,
                  },
                ]}
                onPress={() => setCurrentPage(1)}
                activeOpacity={0.8}
              >
                <Ionicons name="arrow-up-circle-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.collapseBtnText, { color: colors.textMuted }]}>
                  Collapse to Top 8
                </Text>
              </TouchableOpacity>
            )}
          </View>
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
  telemetryMetricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  telemPill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    minWidth: 68,
    alignItems: 'center',
  },
  telemLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  telemValue: {
    fontSize: 12,
    fontWeight: '800',
  },
  paginationContainer: {
    marginTop: 18,
    alignItems: 'center',
    gap: 10,
  },
  paginationCountText: {
    fontSize: 12,
    fontWeight: '600',
  },
  paginationButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    elevation: 1,
  },
  loadMoreBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  collapseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
  },
  collapseBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
