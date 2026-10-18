import React, { useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';

export interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (val: number) => void;
  accentColor?: string;
  description?: string;
}

export function SliderControl({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  accentColor,
  description,
}: SliderControlProps) {
  const { colors } = useAppTheme();
  const trackWidthRef = useRef<number>(200);
  const trackLayoutXRef = useRef<number>(0);
  const activeColor = accentColor || colors.palette.forest;

  const clampValue = (val: number) => {
    const stepped = Math.round((val - min) / step) * step + min;
    return Math.max(min, Math.min(max, stepped));
  };

  const calculateValueFromTouch = (pageX: number) => {
    const relativeX = pageX - trackLayoutXRef.current;
    const ratio = Math.max(0, Math.min(1, relativeX / trackWidthRef.current));
    const rawVal = min + ratio * (max - min);
    return clampValue(rawVal);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt: GestureResponderEvent) => {
          const newVal = calculateValueFromTouch(evt.nativeEvent.pageX);
          onChange(newVal);
        },
        onPanResponderMove: (
          evt: GestureResponderEvent,
          _gestureState: PanResponderGestureState
        ) => {
          const newVal = calculateValueFromTouch(evt.nativeEvent.pageX);
          onChange(newVal);
        },
      }),
    [min, max, step, onChange]
  );

  const percentage = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  const handleDecrement = () => {
    onChange(clampValue(value - step));
  };

  const handleIncrement = () => {
    onChange(clampValue(value + step));
  };

  return (
    <View style={styles.container}>
      {/* Label and Value Row */}
      <View style={styles.labelRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
          {description ? (
            <Text style={[styles.desc, { color: colors.textMuted }]}>{description}</Text>
          ) : null}
        </View>

        <View
          style={[
            styles.valueBadge,
            { backgroundColor: colors.palette.mist, borderColor: colors.palette.mint },
          ]}
        >
          <Text style={[styles.valueText, { color: activeColor }]}>
            {value}
            {unit}
          </Text>
        </View>
      </View>

      {/* Slider Track with Minus / Plus Steppers */}
      <View style={styles.sliderControlRow}>
        <TouchableOpacity
          onPress={handleDecrement}
          activeOpacity={0.7}
          style={[
            styles.stepBtn,
            { backgroundColor: colors.palette.mist, borderColor: colors.border },
          ]}
        >
          <Ionicons name="remove" size={16} color={colors.text} />
        </TouchableOpacity>

        <View
          style={[styles.trackWrapper, { backgroundColor: colors.palette.mist }]}
          onLayout={(e) => {
            trackWidthRef.current = e.nativeEvent.layout.width;
            (e.target as any).measure?.(
              (_x: number, _y: number, _w: number, _h: number, pageX: number) => {
                trackLayoutXRef.current = pageX;
              }
            );
          }}
          {...panResponder.panHandlers}
        >
          {/* Active Progress Fill */}
          <View
            style={[
              styles.trackFill,
              {
                width: `${percentage}%`,
                backgroundColor: activeColor,
              },
            ]}
          />

          {/* Draggable Thumb Indicator */}
          <View
            style={[
              styles.thumb,
              {
                left: `${percentage}%`,
                backgroundColor: colors.palette.white,
                borderColor: activeColor,
              },
            ]}
          />
        </View>

        <TouchableOpacity
          onPress={handleIncrement}
          activeOpacity={0.7}
          style={[
            styles.stepBtn,
            { backgroundColor: colors.palette.mist, borderColor: colors.border },
          ]}
        >
          <Ionicons name="add" size={16} color={colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
  },
  desc: {
    fontSize: 11,
    marginTop: 2,
  },
  valueBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  valueText: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  sliderControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackWrapper: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    position: 'relative',
    justifyContent: 'center',
  },
  trackFill: {
    height: '100%',
    borderRadius: 6,
  },
  thumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    marginLeft: -11,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 3,
  },
});
