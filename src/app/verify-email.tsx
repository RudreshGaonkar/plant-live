import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getVerificationResendTime } from '@/services/auth';
import { useSession } from '@/store/useSession';
import { useAppTheme } from '@/theme';
import { mapAuthError } from '@/utils/authValidation';

export default function VerifyEmailScreen() {
  const { colors, radii } = useAppTheme();
  const user = useSession((state) => state.user);
  const deliveryStatus = useSession((state) =>
    state.verificationEmailDelivery?.uid === state.user?.uid ? state.verificationEmailDelivery?.status : undefined
  );
  const refresh = useSession((state) => state.refreshEmailVerification);
  const resend = useSession((state) => state.resendVerificationEmail);
  const retrySetup = useSession((state) => state.retryRegistrationSetup);
  const signOut = useSession((state) => state.signOut);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [setupFailed, setSetupFailed] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [action, setAction] = useState<'resend' | 'setup' | 'signout' | null>(null);
  const [now, setNow] = useState(Date.now);
  const busy = useRef(false);
  const signingOut = useRef(false);
  const checkInFlight = useRef<Promise<boolean> | null>(null);
  const initialSendFailed = deliveryStatus === 'failed';
  const initialSendPending = deliveryStatus === 'sending';
  const resendSeconds = user && !initialSendFailed
    ? Math.max(0, Math.min(60, Math.ceil((getVerificationResendTime(user.uid) - now) / 1000)))
    : 0;

  const check = useCallback(async (manual = false) => {
    if (signingOut.current) return;
    if (!checkInFlight.current) {
      setIsChecking(true);
      checkInFlight.current = refresh().finally(() => {
        checkInFlight.current = null;
        setIsChecking(false);
      });
    }
    try {
      const verified = await checkInFlight.current;
      if (manual && !verified) setFeedback('Email verification is still pending. Open the link in your inbox and try again.');
    } catch {
      if (manual) setFeedback('Could not check verification. Check your connection and try again.');
    }
  }, [refresh]);

  useEffect(() => {
    let active = true;
    retrySetup().catch(() => {
      if (active) setSetupFailed(true);
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setNow(Date.now());
        void check();
      }
    });
    const polling = setInterval(() => {
      if (AppState.currentState === 'active' || AppState.currentState == null) void check();
    }, 5000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const initialCheck = setTimeout(() => void check(), 0);
    return () => {
      active = false;
      appState.remove();
      clearTimeout(initialCheck);
      clearInterval(polling);
      clearInterval(clock);
    };
  }, [check, retrySetup]);

  async function runAction(next: NonNullable<typeof action>) {
    if (busy.current) return;
    busy.current = true;
    signingOut.current = next === 'signout';
    setAction(next);
    setFeedback(null);
    try {
      if (next === 'resend') {
        if (!user || initialSendPending ||
            (!initialSendFailed && getVerificationResendTime(user.uid) > Date.now())) return;
        await resend();
        setFeedback('Verification email sent.');
      } else if (next === 'setup') {
        await retrySetup();
        setSetupFailed(false);
        await check();
      } else {
        await signOut();
      }
    } catch (err) {
      setFeedback(mapAuthError(err, 'Something went wrong. Please try again.'));
    } finally {
      setNow(Date.now());
      signingOut.current = false;
      busy.current = false;
      setAction(null);
    }
  }

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.hero }]}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Verify your email</Text>
          <Text style={{ color: colors.textMuted }}>
            {initialSendFailed || initialSendPending ? 'Your verification email address' : 'Open the verification link sent to'}
          </Text>
          <Text selectable style={[styles.email, { color: colors.text }]}>{user?.email}</Text>
          <View style={styles.status}>
            {isChecking && <ActivityIndicator size="small" color={colors.textMuted} />}
            <Text style={{ color: colors.textMuted }}>Checking for verification every 5 seconds</Text>
          </View>
          {initialSendFailed && (
            <View style={[styles.warning, { backgroundColor: colors.palette.blush, borderRadius: radii.md }]}>
              <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: colors.palette.warningText }}>
                We couldn&apos;t send the verification email yet — tap below to send it now
              </Text>
            </View>
          )}
          {setupFailed && (
            <Text accessibilityRole="alert" style={{ color: colors.palette.warningText }}>
              Profile setup is incomplete. Retry setup to finish creating your account.
            </Text>
          )}
          {feedback && <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>{feedback}</Text>}
          <Pressable
            accessibilityRole="button"
            disabled={action !== null}
            onPress={() => void check(true)}
            style={[styles.button, { backgroundColor: colors.primary, borderRadius: radii.md }]}
          >
            <Text style={[styles.buttonLabel, { color: colors.palette.white }]}>I&apos;ve Verified — Continue</Text>
          </Pressable>
          {setupFailed && (
            <Pressable accessibilityRole="button" disabled={action !== null} onPress={() => void runAction('setup')} style={styles.button}>
              <Text style={[styles.buttonLabel, { color: colors.text }]}>{action === 'setup' ? 'Completing setup…' : 'Retry Setup'}</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            testID="verification-email-send"
            disabled={action !== null || initialSendPending || resendSeconds > 0}
            onPress={() => void runAction('resend')}
            style={styles.button}
          >
            <Text style={[styles.buttonLabel, { color: resendSeconds ? colors.textMuted : colors.text }]}>
              {initialSendPending || action === 'resend' ? 'Sending…' : initialSendFailed ? 'Send Verification Email' :
                resendSeconds ? `Resend Email (${resendSeconds}s)` : 'Resend Email'}
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={action !== null} onPress={() => void runAction('signout')} style={styles.button}>
            <Text style={[styles.buttonLabel, { color: colors.text }]}>Use a different email / Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: { padding: 22, gap: 12, width: '100%', maxWidth: 480, alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: '800' },
  email: { fontSize: 16, fontWeight: '700' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 },
  warning: { padding: 12 },
  button: { minHeight: 48, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center' },
  buttonLabel: { fontWeight: '700', textAlign: 'center' },
});
