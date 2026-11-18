import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from 'firebase/auth';
import { get } from 'firebase/database';
import { useLiveDevice } from '../src/store/useLiveDevice';
import { selectSessionRoutingState, useSession } from '../src/store/useSession';
import { getStartupDestination } from '../src/utils/sessionRouting';

let mockUser: User | null;
let mockAuthCallback: (user: User | null) => Promise<void>;
const mockSeed = jest.fn((ids: string[], preferred?: string | null) => preferred ?? ids[0]);

jest.mock('../src/services/firebase', () => ({
  auth: { get currentUser() { return mockUser; } },
  db: {},
}));
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn((_auth, callback) => {
    mockAuthCallback = callback;
    return jest.fn();
  }),
}));
jest.mock('firebase/database', () => ({
  ref: jest.fn((_db, path) => path),
  get: jest.fn(),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/store/useLiveDevice', () => ({
  useLiveDevice: {
    getState: () => ({ seedDeviceRecords: mockSeed, clearDeviceState: mockClear }),
  },
}));
const mockClear = jest.fn();

const snapshot = (value: unknown) => ({ exists: () => value !== null, val: () => value });
const account = (uid: string, emailVerified = true) => ({
  uid, emailVerified, email: `${uid}@example.com`,
} as User);
const route = () => selectSessionRoutingState(useSession.getState());

describe('Session routing during startup', () => {
  const initial = useSession.getState();
  let stop: () => void;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = null;
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (get as jest.Mock).mockResolvedValue(snapshot(null));
    useSession.setState(initial, true);
    stop = useSession.getState().initializeAuthListener();
  });

  afterEach(() => {
    stop();
    jest.useRealTimers();
  });

  it('keeps a retry before the first auth callback unresolved', async () => {
    await useSession.getState().retryBoot();
    expect(route()).toBe('resolving');
    expect(getStartupDestination(route(), 'login')).toBeNull();
    await mockAuthCallback(null);
    expect(route()).toBe('signed_out');
    expect(getStartupDestination(route(), 'control')).toBe('/(auth)/login');
  });

  it('publishes a verified login before pairing is resolved and preserves an allowed deep link', async () => {
    await mockAuthCallback(null);
    mockUser = account('grower');
    let finish!: (value: ReturnType<typeof snapshot>) => void;
    (get as jest.Mock).mockImplementation((path) => path.endsWith('/devices')
      ? new Promise((resolve) => { finish = resolve; })
      : Promise.resolve(snapshot(null)));

    const login = mockAuthCallback(mockUser);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(route()).toBe('verified');
    expect(useSession.getState().pairingStatus).toBe('pending');
    expect(getStartupDestination(route(), '/(tabs)/history')).toBe('/(tabs)/history');
    finish(snapshot({ garden: true }));
    await login;
    expect(useSession.getState().activeDeviceId).toBe('garden');
  });

  it('rejects protected startup links while verification is pending', async () => {
    mockUser = account('pending', false);
    await mockAuthCallback(mockUser);
    expect(route()).toBe('verification_pending');
    expect(getStartupDestination(route(), '/add-device')).toBe('/verify-email');
    expect(get).not.toHaveBeenCalled();
  });

  it('bounds stalled storage and membership without discarding successful preferences', async () => {
    jest.useFakeTimers();
    mockUser = account('offline');
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => key.includes('registration')
      ? Promise.resolve(null)
      : new Promise(() => {}));
    (get as jest.Mock).mockImplementation((path) => path.endsWith('/prefs')
      ? Promise.resolve(snapshot({ units: 'F', alerts: { dry: false } }))
      : new Promise(() => {}));

    const boot = mockAuthCallback(mockUser);
    await jest.advanceTimersByTimeAsync(5000);
    await boot;
    expect(route()).toBe('verified');
    expect(useSession.getState().pairingStatus).toBe('unavailable');
    expect(useSession.getState().prefs).toMatchObject({ units: 'F', alerts: { dry: false } });
    expect(useSession.getState().isLoading).toBe(false);
  });

  it('distinguishes cached membership from an authoritative empty result', async () => {
    mockUser = account('cached');
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key) =>
      Promise.resolve(key.includes('active_device') ? 'cached-controller' : null));
    (get as jest.Mock).mockRejectedValueOnce(new Error('Offline'));
    await mockAuthCallback(mockUser);
    expect(useSession.getState().pairingStatus).toBe('cached');
    expect(mockSeed).toHaveBeenCalledWith(['cached-controller'], 'cached-controller');

    await useSession.getState().retryBoot();
    expect(useSession.getState().pairingStatus).toBe('unpaired');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@plant_live_active_device_cached');
  });

  it('discards an earlier account’s hydration before changing the device store', async () => {
    mockUser = account('earlier');
    let finish!: (value: ReturnType<typeof snapshot>) => void;
    (get as jest.Mock).mockImplementation((path) => path === 'users/earlier/devices'
      ? new Promise((resolve) => { finish = resolve; })
      : Promise.resolve(snapshot(null)));
    const earlier = mockAuthCallback(mockUser);
    await new Promise<void>((resolve) => setImmediate(resolve));

    mockUser = account('latest');
    await mockAuthCallback(mockUser);
    const clearCount = useLiveDevice.getState().clearDeviceState as jest.Mock;
    const clears = clearCount.mock.calls.length;
    finish(snapshot({ wrongController: true }));
    await earlier;
    expect(mockSeed).not.toHaveBeenCalled();
    expect(clearCount).toHaveBeenCalledTimes(clears);
    expect(useSession.getState().user?.uid).toBe('latest');
  });
});
