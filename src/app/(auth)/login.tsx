import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/services/firebase';
import { useSession } from '@/store/useSession';
import { useAppTheme } from '@/theme';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const { colors, radii } = useAppTheme();
  const { enterDemoMode } = useSession();
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setAuthError(null);
    setIsSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, data.email.trim(), data.password);
      router.replace('/(tabs)/home');
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : 'Failed to sign in. Please check your credentials.';
      setAuthError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoMode = () => {
    enterDemoMode();
    router.replace('/(tabs)/home');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Brand */}
          <View style={styles.brandHeader}>
            <View
              style={[
                styles.logoWrap,
                { backgroundColor: colors.palette.lime, borderRadius: radii.full },
              ]}
            >
              <Ionicons name="leaf" size={36} color={colors.palette.forest} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>LeafLink</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Smart Plant-Watering Companion
            </Text>
          </View>

          {/* Form Card */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderRadius: radii.hero,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.cardTitle, { color: colors.text }]}>Sign In</Text>

            {authError && (
              <View
                style={[
                  styles.errorBanner,
                  {
                    backgroundColor: colors.palette.blush,
                    borderRadius: radii.sm,
                    borderColor: colors.palette.warningBorder,
                  },
                ]}
              >
                <Ionicons
                  name="alert-circle"
                  size={18}
                  color={colors.palette.warningText}
                />
                <Text
                  style={[styles.errorBannerText, { color: colors.palette.warningText }]}
                >
                  {authError}
                </Text>
              </View>
            )}

            {/* Email Field */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
                Email Address
              </Text>
              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, onBlur, value } }) => (
                  <View
                    style={[
                      styles.inputContainer,
                      {
                        backgroundColor: colors.palette.mist,
                        borderColor: errors.email
                          ? colors.palette.warningBorder
                          : colors.border,
                        borderRadius: radii.md,
                      },
                    ]}
                  >
                    <Ionicons
                      name="mail-outline"
                      size={20}
                      color={colors.textMuted}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      placeholder="gardener@example.com"
                      placeholderTextColor={colors.palette.sage}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  </View>
                )}
              />
              {errors.email && (
                <Text style={[styles.fieldError, { color: colors.palette.warningText }]}>
                  {errors.email.message}
                </Text>
              )}
            </View>

            {/* Password Field */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
                Password
              </Text>
              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, onBlur, value } }) => (
                  <View
                    style={[
                      styles.inputContainer,
                      {
                        backgroundColor: colors.palette.mist,
                        borderColor: errors.password
                          ? colors.palette.warningBorder
                          : colors.border,
                        borderRadius: radii.md,
                      },
                    ]}
                  >
                    <Ionicons
                      name="lock-closed-outline"
                      size={20}
                      color={colors.textMuted}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      placeholder="••••••••"
                      placeholderTextColor={colors.palette.sage}
                      secureTextEntry
                      autoCapitalize="none"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  </View>
                )}
              />
              {errors.password && (
                <Text style={[styles.fieldError, { color: colors.palette.warningText }]}>
                  {errors.password.message}
                </Text>
              )}
            </View>

            {/* Sign In Button */}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                {
                  backgroundColor: colors.palette.forest,
                  borderRadius: radii.full,
                  opacity: isSubmitting ? 0.7 : 1,
                },
              ]}
              onPress={handleSubmit(onSubmit)}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.palette.white} />
              ) : (
                <>
                  <Text style={[styles.primaryButtonText, { color: colors.palette.white }]}>
                    Sign In
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color={colors.palette.white} />
                </>
              )}
            </TouchableOpacity>

            {/* Sign Up Navigation */}
            <View style={styles.switchAuthRow}>
              <Text style={[styles.switchAuthText, { color: colors.textMuted }]}>
                Don&apos;t have an account?{' '}
              </Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
                <Text
                  style={[
                    styles.switchAuthLink,
                    { color: colors.palette.forest, fontWeight: '700' },
                  ]}
                >
                  Create one
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Demo Mode Action Card */}
          <View
            style={[
              styles.demoCard,
              {
                backgroundColor: colors.palette.mist,
                borderColor: colors.palette.lime,
                borderRadius: radii.card,
              },
            ]}
          >
            <View style={styles.demoContent}>
              <Ionicons
                name="sparkles-outline"
                size={24}
                color={colors.palette.forest}
              />
              <View style={styles.demoTextWrap}>
                <Text style={[styles.demoTitle, { color: colors.text }]}>
                  No hardware or account?
                </Text>
                <Text style={[styles.demoDesc, { color: colors.textMuted }]}>
                  Explore all live metrics, 3D views & watering with the local simulator.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.demoButton,
                {
                  backgroundColor: colors.palette.lime,
                  borderColor: colors.palette.forest,
                  borderRadius: radii.full,
                },
              ]}
              onPress={handleDemoMode}
            >
              <Ionicons name="play" size={16} color={colors.palette.forest} />
              <Text
                style={[
                  styles.demoButtonText,
                  { color: colors.palette.forest, fontWeight: '700' },
                ]}
              >
                Try Demo Mode
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  brandHeader: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 28,
  },
  logoWrap: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  card: {
    padding: 24,
    borderWidth: 1.5,
    elevation: 3,
    shadowColor: '#1F2A21',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  errorBannerText: {
    fontSize: 13,
    flex: 1,
    fontWeight: '500',
  },
  fieldGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
  },
  fieldError: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    marginTop: 10,
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  switchAuthRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
  },
  switchAuthText: {
    fontSize: 14,
  },
  switchAuthLink: {
    fontSize: 14,
  },
  demoCard: {
    marginTop: 24,
    padding: 18,
    borderWidth: 1.5,
  },
  demoContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  demoTextWrap: {
    flex: 1,
  },
  demoTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  demoDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  demoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderWidth: 1,
    gap: 6,
  },
  demoButtonText: {
    fontSize: 14,
  },
});
