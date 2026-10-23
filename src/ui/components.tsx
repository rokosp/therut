import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fonts, radius, space, touch, type, usePalette } from './theme';

export function Screen({
  children,
  refreshing,
  onRefresh,
  padded = true,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  padded?: boolean;
}) {
  const c = usePalette();
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: padded ? space.l : 0, gap: space.l, paddingBottom: space.xxxl }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.primary} /> : undefined
        }>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Loading() {
  const c = usePalette();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
      <ActivityIndicator color={c.primary} size="large" />
    </View>
  );
}

type Variant = 'display' | 'h1' | 'h2' | 'title' | 'body' | 'label' | 'mono' | 'score';

export function T({ variant = 'body', muted, style, ...rest }: TextProps & { variant?: Variant; muted?: boolean }) {
  const c = usePalette();
  const v: Record<Variant, object> = {
    display: { fontFamily: fonts.displayBlack, fontSize: type.display, lineHeight: type.display, textTransform: 'uppercase' },
    h1: { fontFamily: fonts.display, fontSize: type.h1, lineHeight: type.h1 * 1.05, textTransform: 'uppercase' },
    h2: { fontFamily: fonts.display, fontSize: type.h2, lineHeight: type.h2 * 1.1, textTransform: 'uppercase' },
    title: { fontFamily: fonts.bodyBold, fontSize: type.title },
    body: { fontFamily: fonts.body, fontSize: type.body, lineHeight: type.body * 1.4 },
    label: { fontFamily: fonts.bodyMedium, fontSize: type.label, letterSpacing: 0.4 },
    mono: { fontFamily: fonts.mono, fontSize: type.body },
    score: { fontFamily: fonts.mono, fontSize: type.score },
  };
  return <Text style={[{ color: muted ? c.muted : c.text }, v[variant], style]} {...rest} />;
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  busy,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'accent' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  style?: ViewStyle;
}) {
  const c = usePalette();
  const bg = { primary: c.primary, accent: c.accent, secondary: 'transparent', danger: 'transparent' }[kind];
  const fg = { primary: c.onPrimary, accent: c.onAccent, secondary: c.text, danger: c.danger }[kind];
  const border = kind === 'secondary' ? c.border : kind === 'danger' ? c.danger : bg;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}>
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ color: fg, fontFamily: fonts.bodyBold, fontSize: type.body }}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const c = usePalette();
  const s = [styles.card, { backgroundColor: c.card, borderColor: c.border }, style];
  if (!onPress) return <View style={s}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [...s, { opacity: pressed ? 0.85 : 1 }]}>
      {children}
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const c = usePalette();
  return (
    <View style={{ gap: space.xs }}>
      <T variant="label" muted>
        {label}
      </T>
      <TextInput
        placeholderTextColor={c.muted}
        style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
        {...props}
      />
      {hint ? (
        <T variant="label" muted>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

/** A row of options where exactly one is selected. */
export function Segmented<V extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  const c = usePalette();
  return (
    <View style={[styles.segmented, { borderColor: c.border }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, { backgroundColor: on ? c.primary : 'transparent' }]}>
            <Text style={{ color: on ? c.onPrimary : c.text, fontFamily: fonts.bodyMedium, fontSize: type.label }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress?: () => void }) {
  const c = usePalette();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, { borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary : 'transparent' }]}>
      <Text style={{ color: on ? c.onPrimary : c.text, fontFamily: fonts.bodyMedium, fontSize: type.label }}>{label}</Text>
    </Pressable>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.s }, style]}>{children}</View>;
}

export function ErrorText({ error }: { error: string | null | undefined }) {
  const c = usePalette();
  if (!error) return null;
  return <T style={{ color: c.danger }}>{error}</T>;
}

const styles = StyleSheet.create({
  button: {
    minHeight: touch,
    paddingHorizontal: space.xl,
    borderRadius: radius.small,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { borderRadius: radius.card, borderWidth: 1, padding: space.l, gap: space.s },
  input: {
    minHeight: touch,
    borderWidth: 1,
    borderRadius: radius.small,
    paddingHorizontal: space.m,
    fontFamily: fonts.body,
    fontSize: type.body,
  },
  segmented: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.small, overflow: 'hidden' },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.s },
  chip: {
    minHeight: 36,
    paddingHorizontal: space.m,
    borderRadius: radius.chip,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
