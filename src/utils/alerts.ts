export const MAX_VISIBLE_ALERTS = 8;

export function parseAlertTimestamp(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  const numeric = typeof value === 'number' || /^[+\-]?\d+(\.\d+)?$/.test(value.trim());
  const n = numeric ? Number(value) : Date.parse(String(value));
  const ms = numeric && n < 1e12 ? n * 1000 : n;
  return Number.isFinite(ms) && ms > 0 && ms <= 8.64e15 ? ms : undefined;
}

export function alertTimestamp(alert: { createdAt?: unknown; timestamp?: unknown; ts?: unknown }): number {
  return parseAlertTimestamp(alert.createdAt) ?? parseAlertTimestamp(alert.timestamp) ?? parseAlertTimestamp(alert.ts) ?? 0;
}

const titles: Record<string, string> = {
  bottle: 'Water Reservoir Low', LOW_WATER: 'Water Reservoir Low', dry: 'Soil Needs Water',
  wet: 'Soil Too Wet', heat: 'Temperature Alert', offline: 'Device Offline', watered: 'Watering Complete',
  PUMP_ERROR: 'Pump Error', critical: 'Critical Plant Alert', warning: 'Plant Care Warning',
  info: 'Plant Care Update', INFO_ALERT: 'Plant Care Update',
};
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export function normalizeAlert<T extends { type?: unknown; title?: unknown; message?: unknown; description?: unknown; body?: unknown; createdAt?: unknown; timestamp?: unknown; ts?: unknown }>(alert: T): Omit<T, 'title' | 'message' | 'description' | 'body' | 'createdAt' | 'timestamp' | 'ts'> & { title: string; message: string; description: string; body: string; createdAt: number; timestamp: number; ts: number } {
  const title = text(alert.title) || titles[String(alert.type)] || 'Plant Controller Update';
  const message = text(alert.message) || text(alert.description) || text(alert.body) || `${title}. Check your controller for details.`;
  const ts = alertTimestamp(alert);
  return { ...alert, title, message, description: text(alert.description) || message,
    body: text(alert.body) || message, createdAt: ts, timestamp: ts, ts };
}

export function latestAlerts<T extends { id: string; createdAt?: unknown; timestamp?: unknown; ts?: unknown }>(alerts: T[]): T[] {
  return [...alerts].sort((a, b) => alertTimestamp(b) - alertTimestamp(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, MAX_VISIBLE_ALERTS);
}

export function formatAlertTime(value: unknown, now = Date.now()): string {
  const ts = parseAlertTimestamp(value);
  if (!ts || ts > now) return 'Time unavailable';
  const minutes = Math.floor((now - ts) / 60000);
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)}d ago`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ago`;
  return minutes > 0 ? `${minutes}m ago` : 'just now';
}

export function unreadVisibleAlerts<T extends { status: string }>(visible: T[]): T[] {
  return visible.filter(alert => alert.status === 'active' || alert.status === 'unread');
}
