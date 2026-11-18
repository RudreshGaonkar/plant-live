import AsyncStorage from '@react-native-async-storage/async-storage';
import { createUserWithEmailAndPassword, sendEmailVerification, updateProfile, User } from 'firebase/auth';
import { get, runTransaction } from 'firebase/database';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { registerUserWithEmail } from '../src/services/auth';
import { selectSessionRoutingState, useSession } from '../src/store/useSession';
import VerifyEmailScreen from '../src/app/verify-email';

let mockCurrentUser: User | null;
let mockAuthListener: (user: User | null) => Promise<void>;
let mockAccount: Record<string, unknown> | null;
let mockSendButton: { disabled: boolean; onPress: () => void };

jest.mock('react', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  return {
    ...react,
    // Render the screen against the live Zustand snapshot in this Node test.
    useSyncExternalStore: <T>(subscribe: (callback: () => void) => () => void, getSnapshot: () => T) =>
      react.useSyncExternalStore(subscribe, getSnapshot, getSnapshot),
  };
});
jest.mock('react-native', () => ({
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  ScrollView: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  Text: ({ children }: { children: ReactNode }) => createElement('span', null, children),
  Pressable: ({ testID, disabled, onPress, children }: {
    testID?: string; disabled: boolean; onPress: () => void; children: ReactNode;
  }) => {
    if (testID === 'verification-email-send') mockSendButton = { disabled, onPress };
    return createElement('button', { disabled }, children);
  },
  ActivityIndicator: () => null,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));
jest.mock('../src/theme', () => ({
  useAppTheme: () => ({ colors: { palette: {} }, radii: {} }),
}));

jest.mock('../src/services/firebase', () => ({
  auth: { get currentUser() { return mockCurrentUser; } },
  db: {},
}));
jest.mock('../src/store/useLiveDevice', () => ({
  useLiveDevice: { getState: () => ({ clearDeviceState: jest.fn() }) },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));
jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: jest.fn(async () => ({ user: mockCurrentUser })),
  sendEmailVerification: jest.fn(async () => {}),
  updateProfile: jest.fn(async (user, changes) => Object.assign(user, changes)),
  onAuthStateChanged: jest.fn((_auth, listener) => {
    mockAuthListener = listener;
    return jest.fn();
  }),
  signOut: jest.fn(async () => { mockCurrentUser = null; }),
}));
jest.mock('firebase/database', () => ({
  ref: jest.fn(),
  get: jest.fn(async () => ({ exists: () => false })),
  runTransaction: jest.fn(async (_ref, update) => { mockAccount = update(mockAccount); }),
  serverTimestamp: jest.fn(() => 123),
}));

const routingState = () => selectSessionRoutingState(useSession.getState());
const registration = {
  name: '  Leaf Grower ',
  email: ' grower@example.com ',
  password: ' password ',
  confirmPassword: ' password ',
};

describe('Email verification pending', () => {
  const initial = useSession.getState();
  let unsubscribe: () => void;
  let user: User;
  let nextUid = 0;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAccount = null;
    user = {
      uid: `grower-${nextUid++}`,
      email: 'grower@example.com',
      emailVerified: false,
      displayName: null,
      reload: jest.fn().mockResolvedValue(undefined),
      getIdToken: jest.fn().mockResolvedValue('verified-token'),
    } as unknown as User;
    mockCurrentUser = user;
    useSession.setState(initial, true);
    unsubscribe = useSession.getState().initializeAuthListener();
  });

  afterEach(() => unsubscribe());

  it('resolves anonymous sessions to signed out and unverified users to pending without loading devices', async () => {
    expect(routingState()).toBe('resolving');
    mockCurrentUser = null;
    await mockAuthListener(null);
    expect(routingState()).toBe('signed_out');
    mockCurrentUser = user;
    await mockAuthListener(user);
    expect(routingState()).toBe('verification_pending');
    expect(useSession.getState().user?.email).toBe(user.email);
    expect(get).not.toHaveBeenCalled();
    await expect(useSession.getState().refreshEmailVerification()).resolves.toBe(false);
    expect(routingState()).toBe('verification_pending');
  });

  it('keeps a newly verified account pending until setup succeeds, then hydrates the session', async () => {
    await mockAuthListener(user);
    Object.assign(user, { emailVerified: true });
    (runTransaction as jest.Mock).mockRejectedValueOnce(new Error('Offline'));

    await expect(useSession.getState().refreshEmailVerification()).rejects.toThrow('Offline');
    expect(routingState()).toBe('verification_pending');
    expect(get).not.toHaveBeenCalled();

    await useSession.getState().retryRegistrationSetup();
    await expect(useSession.getState().refreshEmailVerification()).resolves.toBe(true);
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(useSession.getState().pairingStatus).toBe('unpaired');
    expect(routingState()).toBe('verified');
  });

  it('recovers a persisted setup draft on verified cold start', async () => {
    Object.assign(user, { emailVerified: true });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('Saved Grower');
    await mockAuthListener(user);
    expect(routingState()).toBe('verification_pending');
  });

  it('retries registration setup without creating another account or overwriting existing data', async () => {
    mockAccount = {
      devices: { pairedController: true },
      profile: { createdAt: 10, avatar: 'photo' },
      prefs: { units: 'F', alerts: { heat: false } },
    };
    (updateProfile as jest.Mock).mockRejectedValueOnce(new Error('Offline'));
    await expect(registerUserWithEmail(registration)).rejects.toThrow('Offline');
    await mockAuthListener(user);
    await useSession.getState().retryRegistrationSetup();
    await useSession.getState().retryRegistrationSetup();

    expect(createUserWithEmailAndPassword).toHaveBeenCalledTimes(1);
    expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
      expect.anything(), user.email, registration.password
    );
    expect(mockAccount).toMatchObject({
      devices: { pairedController: true },
      profile: { displayName: 'Leaf Grower', createdAt: 10, avatar: 'photo' },
      prefs: { units: 'F', alerts: { heat: false, offline: true } },
    });
  });

  it('shares the reload request and discards its result after sign-out', async () => {
    await mockAuthListener(user);
    let finishReload!: () => void;
    (user.reload as jest.Mock).mockReturnValue(new Promise<void>((resolve) => { finishReload = resolve; }));
    const first = useSession.getState().refreshEmailVerification();
    const second = useSession.getState().refreshEmailVerification();
    expect(user.reload).toHaveBeenCalledTimes(1);

    await useSession.getState().signOut();
    Object.assign(user, { emailVerified: true });
    finishReload();
    await expect(Promise.all([first, second])).resolves.toEqual([false, false]);
    expect(routingState()).toBe('signed_out');
  });

  it('enforces a 60-second cooldown after sending a verification email', async () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(100_000);
    try {
      const { resendVerificationEmail } = useSession.getState();
      await resendVerificationEmail();
      clock.mockReturnValue(159_999);
      await resendVerificationEmail();
      expect(sendEmailVerification).toHaveBeenCalledTimes(1);
      clock.mockReturnValue(160_000);
      await resendVerificationEmail();
      expect(sendEmailVerification).toHaveBeenCalledTimes(2);
    } finally {
      clock.mockRestore();
    }
  });

  it('shows an enabled send button after initial failure and starts the cooldown only after a successful retry', async () => {
    const { renderToStaticMarkup } = jest.requireActual<{ renderToStaticMarkup: (element: ReactElement) => string }>('react-dom/server');
    const renderScreen = () => renderToStaticMarkup(createElement(VerifyEmailScreen));
    const firebaseSend = sendEmailVerification as jest.Mock;
    firebaseSend.mockRejectedValueOnce(new Error('Offline'));
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const clock = jest.spyOn(Date, 'now').mockReturnValue(100_000);
    try {
      await mockAuthListener(user);
      await expect(useSession.getState().registerUser(registration)).resolves.toBe(user);
      expect(useSession.getState().verificationEmailDelivery).toEqual({ uid: user.uid, status: 'failed' });
      const failed = renderScreen();
      expect(failed).toContain('We couldn&#x27;t send the verification email yet — tap below to send it now');
      expect(failed).toContain('Send Verification Email');
      expect(mockSendButton.disabled).toBe(false);

      firebaseSend.mockRejectedValueOnce(new Error('Still offline'));
      mockSendButton.onPress();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(firebaseSend).toHaveBeenCalledTimes(2);
      renderScreen();
      expect(mockSendButton.disabled).toBe(false);

      mockSendButton.onPress();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(firebaseSend).toHaveBeenCalledTimes(3);
      expect(useSession.getState().verificationEmailDelivery).toEqual({ uid: user.uid, status: 'sent' });
      const sent = renderScreen();
      expect(sent).not.toContain('tap below to send it now');
      expect(sent).toContain('Resend Email (60s)');
      expect(mockSendButton.disabled).toBe(true);

      const otherUser = { ...user, uid: 'another-account' } as User;
      mockCurrentUser = otherUser;
      await mockAuthListener(otherUser);
      expect(renderScreen()).not.toContain('Resend Email (60s)');
      expect(mockSendButton.disabled).toBe(false);
    } finally {
      warning.mockRestore();
      clock.mockRestore();
    }
  });
});
