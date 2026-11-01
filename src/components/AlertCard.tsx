import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';

export interface AlertCardData {
  id: string;
  title?: string;
  message?: string;
  description?: string;
  body?: string;
  severity?: 'critical' | 'warning' | 'info';
  type?: string;
  createdAt?: number;
  ts?: number;
  timestamp?: number;
  status?: string;
  actionLabel?: string;
}

export interface AlertCardProps {
  alert: AlertCardData;
  onMarkRead?: () => void;
  onSnooze?: () => void;
  onAction?: () => void;
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

export function AlertCard({ alert, onMarkRead, onSnooze, onAction }: AlertCardProps) {
  const { radii } = useAppTheme();

  // Normalize severity
  const severity: 'critical' | 'warning' | 'info' =
    alert.severity ??
    (alert.type === 'LOW_WATER' || alert.type === 'PUMP_ERROR'
      ? 'critical'
      : alert.type === 'INFO_ALERT'
      ? 'info'
      : 'warning');

  // Text rendering bindings with strict fallbacks
  const displayTitle = (alert.title && alert.title.trim().length > 0)
    ? alert.title.trim()
    : 'System Notice';

  const displayMessage = (alert.message && alert.message.trim().length > 0)
    ? alert.message.trim()
    : (alert.description && alert.description.trim().length > 0)
    ? alert.description.trim()
    : (alert.body && alert.body.trim().length > 0)
    ? alert.body.trim()
    : 'No additional details provided.';

  const timestamp = alert.createdAt ?? alert.ts ?? alert.timestamp;

  const severityTheme = {
    critical: {
      bg: '#FFECEC',
      border: '#C0505E',
      text: '#C0505E',
      bodyText: '#8B3040',
      icon: 'alert-circle' as const,
    },
    warning: {
      bg: '#FFF8EB',
      border: '#D97706',
      text: '#92400E',
      bodyText: '#78350F',
      icon: 'warning-outline' as const,
    },
    info: {
      bg: '#F4F9EC',
      border: '#5A8A5C',
      text: '#2E5A30',
      bodyText: '#3A5C3C',
      icon: 'information-circle-outline' as const,
    },
  }[severity];

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: severityTheme.bg,
          borderColor: severityTheme.border,
          borderRadius: radii.card,
        },
      ]}
    >
      <View style={styles.contentRow}>
        <Ionicons
          name={severityTheme.icon}
          size={20}
          color={severityTheme.text}
          style={styles.icon}
        />
        <View style={styles.textContainer}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: severityTheme.text }]}>
              {displayTitle}
            </Text>
            <Text style={[styles.timeText, { color: `${severityTheme.text}90` }]}>
              {formatRelativeTime(timestamp)}
            </Text>
          </View>

          <Text style={[styles.message, { color: severityTheme.bodyText }]}>
            {displayMessage}
          </Text>

          {alert.actionLabel && onAction && (
            <TouchableOpacity
              onPress={onAction}
              style={[
                styles.actionButton,
                {
                  backgroundColor: severityTheme.border,
                  borderRadius: radii.md,
                },
              ]}
              activeOpacity={0.8}
            >
              <Text style={styles.actionButtonText}>{alert.actionLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 10,
    overflow: 'hidden',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  icon: {
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '500',
    marginLeft: 8,
  },
  message: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 17,
  },
  actionButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 8,
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
