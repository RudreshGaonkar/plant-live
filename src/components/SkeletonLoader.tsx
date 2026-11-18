import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';
import { useAppTheme } from '@/theme';

const layouts = {
  home: [230, 120, 96],
  history: [278, 88, 124],
  settings: [116, 144, 180],
} as const;

export function SkeletonLoader({ screen }: { screen: keyof typeof layouts }) {
  const { colors, radii, spacing } = useAppTheme();
  return (
    <SafeAreaView
      accessible
      accessibilityLabel={`Loading ${screen === 'home' ? 'dashboard' : screen}`}
      accessibilityState={{ busy: true }}
      style={[styles.screen, { backgroundColor: colors.background, padding: spacing.md }]}
    >
      <View style={[styles.heading, { backgroundColor: colors.border }]} />
      {layouts[screen].map((height) => (
        <View
          key={height}
          style={[styles.card, {
            minHeight: height,
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radii.card,
          }]}
        >
          <View style={[styles.title, { backgroundColor: colors.border }]} />
          <View style={[styles.body, { backgroundColor: colors.palette.mist }]} />
        </View>
      ))}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 14, overflow: 'hidden' },
  heading: { width: 145, height: 20, borderRadius: 5, marginVertical: 8 },
  card: { borderWidth: 1, padding: 16, gap: 12 },
  title: { width: '40%', height: 14, borderRadius: 5 },
  body: { flex: 1, borderRadius: 8 },
});
