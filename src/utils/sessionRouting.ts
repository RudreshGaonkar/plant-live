import type { SessionRoutingState } from '@/store/useSession';

const verifiedDestinations = {
  home: '/(tabs)/home',
  history: '/(tabs)/history',
  alerts: '/(tabs)/alerts',
  control: '/(tabs)/control',
  settings: '/(tabs)/settings',
  'add-device': '/add-device',
} as const;

export function normalizeStartupPath(path?: string | null) {
  return path?.replace(/^\/+|\/+$/g, '').replace(/^--\//, '').replace(/^\((tabs|auth)\)\//, '');
}

export function getStartupDestination(state: SessionRoutingState, incomingPath?: string | null) {
  const path = normalizeStartupPath(incomingPath);
  switch (state) {
    case 'resolving':
      return null;
    case 'signed_out':
      return path === 'register' ? '/(auth)/register' : '/(auth)/login';
    case 'verification_pending':
      return '/verify-email';
    case 'verified':
      return path && Object.prototype.hasOwnProperty.call(verifiedDestinations, path)
        ? verifiedDestinations[path as keyof typeof verifiedDestinations]
        : '/(tabs)/home';
  }
}
