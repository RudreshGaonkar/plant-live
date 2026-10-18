/**
 * FloatingDock
 * Floating pill navigation dock that replaces the standard tab bar.
 * - Centered pill, 16px above safe area, white 92% opacity with shadow
 * - 4 icon tabs + raised 64dp center Water button
 * - Long-press center button triggers Water Dial radial menu
 * - Active tab: forest icon + mint dot indicator
 * uiLayout.md Section 2
 */
import { useAppTheme } from '@/theme';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useCallback, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  runOnUI,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface DockTab {
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconFocused: keyof typeof Ionicons.glyphMap;
  label: string;
  accessibilityLabel: string;
}

const TABS: DockTab[] = [
  {
    name: 'home',
    icon: 'leaf-outline',
    iconFocused: 'leaf',
    label: 'Home',
    accessibilityLabel: 'Home tab',
  },
  {
    name: 'history',
    icon: 'stats-chart-outline',
    iconFocused: 'stats-chart',
    label: 'Insights',
    accessibilityLabel: 'Insights tab',
  },
  // center water button slot (index 2)
  {
    name: 'alerts',
    icon: 'notifications-outline',
    iconFocused: 'notifications',
    label: 'Alerts',
    accessibilityLabel: 'Alerts tab',
  },
  {
    name: 'settings',
    icon: 'settings-outline',
    iconFocused: 'settings',
    label: 'Settings',
    accessibilityLabel: 'Settings tab',
  },
];

// Water Dial quick durations (uiLayout.md §4.3)
const WATER_DIAL_OPTIONS: { label: string; duration: number; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: '3 s', duration: 3, icon: 'flash-outline' },
  { label: '5 s', duration: 5, icon: 'water-outline' },
  { label: '10 s', duration: 10, icon: 'rainy-outline' },
  { label: 'Custom', duration: -1, icon: 'options-outline' },
];

interface FloatingDockProps {
  activeRoute: string;
  onTabPress: (name: string) => void;
  onWaterPress: () => void;
  onWaterDialSelect?: (duration: number) => void;
  isWatering?: boolean;
  unreadAlerts?: number;
}

export function FloatingDock({
  activeRoute,
  onTabPress,
  onWaterPress,
  onWaterDialSelect,
  isWatering = false,
  unreadAlerts = 0,
}: FloatingDockProps) {
  const { colors, radii, shadow } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [dialOpen, setDialOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animation for center water button pulse
  const waterScale = useSharedValue(1);
  // Animation for dial items
  const dialScale = useSharedValue(0);

  const waterBtnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: waterScale.value }],
  }));

  const dialContainerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dialScale.value }],
    opacity: dialScale.value,
  }));

  const openDial = useCallback(() => {
    setDialOpen(true);
    runOnUI(() => {
      'worklet';
      dialScale.value = withSpring(1, { damping: 14, stiffness: 180 });
    })();
  }, [dialScale]);

  const closeDial = useCallback(() => {
    runOnUI(() => {
      'worklet';
      dialScale.value = withTiming(0, { duration: 180 });
    })();
    setTimeout(() => setDialOpen(false), 200);
  }, [dialScale]);

  const handleWaterPressIn = useCallback(() => {
    runOnUI(() => {
      'worklet';
      waterScale.value = withSpring(0.92, { damping: 12 });
    })();
    longPressTimer.current = setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      openDial();
    }, 500);
  }, [waterScale, openDial]);

  const handleWaterPressOut = useCallback(() => {
    runOnUI(() => {
      'worklet';
      waterScale.value = withSpring(1, { damping: 12 });
    })();
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, [waterScale]);

  const handleWaterTap = useCallback(() => {
    if (!dialOpen) {
      onWaterPress();
    }
  }, [dialOpen, onWaterPress]);

  const handleDialSelect = useCallback(
    (duration: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      closeDial();
      if (duration === -1) {
        onWaterPress();
      } else if (onWaterDialSelect) {
        onWaterDialSelect(duration);
      }
    },
    [closeDial, onWaterPress, onWaterDialSelect]
  );

  const dockBottom = insets.bottom + 16;
  const DIAL_RADIUS = 96;
  const DIAL_ITEM_SIZE = 62;

  // Symmetrical arc angles centered around the 90° top axis:
  // 140°, 107°, 73°, 40°
  const dialAngles = [140, 107, 73, 40];
  const dialPositions = dialAngles.map((deg) => {
    const rad = (deg * Math.PI) / 180;
    const x = Math.round(DIAL_RADIUS * Math.cos(rad));
    const y = Math.round(DIAL_RADIUS * Math.sin(rad));
    return {
      left: x - DIAL_ITEM_SIZE / 2,
      bottom: y - DIAL_ITEM_SIZE / 2,
    };
  });

  return (
    <>
      {/* Backdrop to close dial */}
      {dialOpen && (
        <Pressable
          style={[StyleSheet.absoluteFill, { zIndex: 105 }]}
          onPress={closeDial}
          accessibilityLabel="Close water dial"
        />
      )}

      {/* Water Dial radial menu */}
      {dialOpen && (
        <Animated.View
          style={[
            styles.dialContainer,
            { bottom: dockBottom + 32 },
            dialContainerStyle,
          ]}
        >
          {WATER_DIAL_OPTIONS.map((opt, i) => (
            <Animated.View
              key={opt.duration}
              entering={FadeIn.delay(i * 35).springify()}
              exiting={FadeOut}
              style={[
                styles.dialOption,
                {
                  backgroundColor: colors.palette.white,
                  borderRadius: radii.full,
                  shadowColor: shadow.color,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: shadow.opacity * 2,
                  shadowRadius: 10,
                  elevation: 10,
                  borderWidth: 1.5,
                  borderColor: colors.palette.mint,
                  left: dialPositions[i].left,
                  bottom: dialPositions[i].bottom,
                },
              ]}
            >
              <TouchableOpacity
                onPress={() => handleDialSelect(opt.duration)}
                style={styles.dialOptionInner}
                accessibilityLabel={`Water for ${opt.label}`}
              >
                <Ionicons
                  name={opt.icon}
                  size={18}
                  color={colors.palette.forest}
                />
                <Text
                  style={[
                    styles.dialLabel,
                    { color: colors.palette.forest },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          ))}
        </Animated.View>
      )}

      {/* Main Dock */}
      <View
        style={[
          styles.dock,
          {
            bottom: dockBottom,
            backgroundColor: `rgba(255,255,255,0.92)`,
            borderRadius: radii.full,
            shadowColor: shadow.color,
            shadowOffset: { width: 0, height: shadow.offsetY },
            shadowOpacity: shadow.opacity * 1.5,
            shadowRadius: shadow.blur,
            elevation: shadow.elevation,
          },
        ]}
        accessibilityRole="tablist"
      >
        {/* Left 2 tabs */}
        {TABS.slice(0, 2).map((tab) => {
          const isFocused = activeRoute === tab.name;
          return (
            <DockTabButton
              key={tab.name}
              tab={tab}
              isFocused={isFocused}
              onPress={() => onTabPress(tab.name)}
              colors={colors}
            />
          );
        })}

        {/* Raised center Water button */}
        <View style={styles.centerSlot}>
          <Animated.View style={[styles.centerBtnWrapper, waterBtnAnimStyle]}>
            <Pressable
              onPressIn={handleWaterPressIn}
              onPressOut={handleWaterPressOut}
              onPress={handleWaterTap}
              style={[
                styles.centerBtn,
                {
                  backgroundColor: isWatering
                    ? colors.palette.sage
                    : colors.palette.forest,
                  borderRadius: radii.full,
                  shadowColor: colors.palette.forest,
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.35,
                  shadowRadius: 16,
                  elevation: 16,
                },
              ]}
              accessibilityLabel={isWatering ? 'Watering active' : 'Water plant – long press for quick dial'}
              accessibilityRole="button"
            >
              <Ionicons
                name={isWatering ? 'hourglass-outline' : 'water'}
                size={26}
                color={colors.palette.white}
              />
            </Pressable>
          </Animated.View>
        </View>

        {/* Right 2 tabs */}
        {TABS.slice(2).map((tab) => {
          const isFocused = activeRoute === tab.name;
          const showBadge = tab.name === 'alerts' && unreadAlerts > 0;
          return (
            <DockTabButton
              key={tab.name}
              tab={tab}
              isFocused={isFocused}
              onPress={() => onTabPress(tab.name)}
              colors={colors}
              badge={showBadge ? unreadAlerts : undefined}
            />
          );
        })}
      </View>
    </>
  );
}

// Sub-component for a single tab icon button
interface DockTabButtonProps {
  tab: DockTab;
  isFocused: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useAppTheme>['colors'];
  badge?: number;
}

function DockTabButton({ tab, isFocused, onPress, colors, badge }: DockTabButtonProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    runOnUI(() => {
      'worklet';
      scale.value = withSpring(0.88, { damping: 12 });
    })();
  }, [scale]);
  const handlePressOut = useCallback(() => {
    runOnUI(() => {
      'worklet';
      scale.value = withSpring(1, { damping: 12 });
    })();
  }, [scale]);

  return (
    <Animated.View style={[styles.tabItem, animStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.tabPressable}
        accessibilityLabel={tab.accessibilityLabel}
        accessibilityRole="tab"
        accessibilityState={{ selected: isFocused }}
      >
        <View style={styles.tabIconContainer}>
          <Ionicons
            name={isFocused ? tab.iconFocused : tab.icon}
            size={22}
            color={
              isFocused
                ? colors.palette.forest
                : `${colors.palette.ink}99`
            }
          />
          {badge !== undefined && badge > 0 && (
            <View
              style={[
                styles.badge,
                { backgroundColor: colors.palette.critical },
              ]}
            >
              <Text style={styles.badgeText}>
                {badge > 9 ? '9+' : badge}
              </Text>
            </View>
          )}
        </View>
        {isFocused && (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={[
              styles.activeDot,
              { backgroundColor: colors.palette.mint },
            ]}
          />
        )}
        <Text
          style={[
            styles.tabLabel,
            {
              color: isFocused
                ? colors.palette.forest
                : `${colors.palette.ink}60`,
              opacity: isFocused ? 1 : 0,
            },
          ]}
          numberOfLines={1}
        >
          {tab.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    zIndex: 100,
    elevation: 30,
    ...Platform.select({
      android: { borderWidth: 0 },
    }),
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
  },
  tabPressable: {
    alignItems: 'center',
    paddingVertical: 2,
    minWidth: 48,
    minHeight: 48,
    justifyContent: 'center',
  },
  tabIconContainer: {
    position: 'relative',
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginTop: 1,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 8,
    fontWeight: '800',
  },
  centerSlot: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBtnWrapper: {
    marginTop: -24,
  },
  centerBtn: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialContainer: {
    position: 'absolute',
    left: '50%',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 110,
    elevation: 35,
  },
  dialOption: {
    position: 'absolute',
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialOptionInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  dialLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
});
