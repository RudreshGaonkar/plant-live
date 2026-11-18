import React, { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, TextInputProps, View, ViewStyle, StyleProp } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';

interface PasswordInputProps extends Omit<TextInputProps, 'secureTextEntry' | 'selection'> {
  accessibilityLabel: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export const PasswordInput = forwardRef<TextInput, PasswordInputProps>(function PasswordInput(
  { accessibilityLabel, containerStyle, style, onSelectionChange, ...props },
  ref
) {
  const { colors } = useAppTheme();
  const input = useRef<TextInput>(null);
  const selection = useRef<{ start: number; end: number }>(null);
  const restoreSelection = useRef<typeof selection.current>(null);
  const [visible, setVisible] = useState(false);

  useImperativeHandle(ref, () => input.current!, []);

  useLayoutEffect(() => {
    if (restoreSelection.current) {
      const { start, end } = restoreSelection.current;
      input.current?.setSelection(start, end);
      restoreSelection.current = null;
    }
  }, [visible]);

  return (
    <View style={[styles.container, containerStyle]}>
      <TextInput
        {...props}
        ref={input}
        accessibilityLabel={accessibilityLabel}
        secureTextEntry={!visible}
        style={[style, styles.input]}
        onSelectionChange={(event) => {
          selection.current = event.nativeEvent.selection;
          onSelectionChange?.(event);
        }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${visible ? 'Hide' : 'Show'} ${accessibilityLabel.toLowerCase()}`}
        style={styles.toggle}
        onPress={() => {
          restoreSelection.current = input.current?.isFocused() ? selection.current : null;
          setVisible((previous) => !previous);
        }}
      >
        <Ionicons
          name={visible ? 'eye-off-outline' : 'eye-outline'}
          size={22}
          color={colors.textMuted}
        />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', flexGrow: 1, flexShrink: 1 },
  input: { flex: 1, minWidth: 0 },
  toggle: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
