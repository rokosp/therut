import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
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

import { fonts, radius, space, touch, type, usePalette, useScheme } from './theme';

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
    <SafeAreaView edges={['left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
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

type Variant = 'display' | 'h1' | 'h2' | 'title' | 'body' | 'label' | 'eyebrow' | 'mono' | 'score';

/**
 * Text in the brand type system.
 * display/h1/h2: Big Shoulders, all caps. mono: numbers in Big Shoulders (scores are the biggest thing on screen).
 * eyebrow: IBM Plex Mono small caps for tags and column heads. label: small body text.
 */
export function T({ variant = 'body', muted, style, ...rest }: TextProps & { variant?: Variant; muted?: boolean }) {
  const c = usePalette();
  const v: Record<Variant, object> = {
    display: { fontFamily: fonts.displayBlack, fontSize: type.display, lineHeight: type.display * 0.95, textTransform: 'uppercase' },
    h1: { fontFamily: fonts.displayBlack, fontSize: 28, lineHeight: 28, textTransform: 'uppercase' },
    h2: { fontFamily: fonts.display, fontSize: 22, lineHeight: 24, textTransform: 'uppercase' },
    title: { fontFamily: fonts.bodyBold, fontSize: 15 },
    body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21 },
    label: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
    eyebrow: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
    mono: { fontFamily: fonts.num, fontSize: 20 },
    score: { fontFamily: fonts.displayBlack, fontSize: 48, lineHeight: 46 },
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
  compact,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'accent' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  style?: ViewStyle;
  compact?: boolean;
}) {
  const c = usePalette();
  const bg = { primary: c.primary, accent: c.accent, secondary: 'transparent', danger: 'transparent' }[kind];
  const fg = { primary: c.onPrimary, accent: c.onAccent, secondary: c.head, danger: c.danger }[kind];
  const border = kind === 'secondary' ? c.head : kind === 'danger' ? c.danger : bg;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        compact && { minHeight: 40, paddingHorizontal: space.m, borderRadius: radius.input },
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
        style,
      ]}>
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ color: fg, fontFamily: fonts.bodyBold, fontSize: compact ? 14 : 15 }}>{title}</Text>
      )}
    </Pressable>
  );
}

/** A soft panel on the page background, as in the brand book's bonus rows. */
export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const c = usePalette();
  const s = [styles.card, { backgroundColor: c.surface }, style];
  if (!onPress) return <View style={s}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [...s, { opacity: pressed ? 0.85 : 1 }]}>
      {children}
    </Pressable>
  );
}

/** Section heading: Plex Mono small caps with an optional action on the right. */
export function Section({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space.s }}>
      <T variant="eyebrow" muted>
        {title}
      </T>
      {right}
    </Row>
  );
}

export function Field({ label, hint, secureTextEntry, ...props }: TextInputProps & { label: string; hint?: string }) {
  const c = usePalette();
  const [show, setShow] = useState(false);
  return (
    <View style={{ gap: space.xs }}>
      <T variant="eyebrow" muted>
        {label}
      </T>
      <View>
        <TextInput
          placeholderTextColor={c.muted}
          secureTextEntry={secureTextEntry && !show}
          style={[
            styles.input,
            { color: c.text, borderColor: c.border, backgroundColor: c.bg },
            secureTextEntry && { paddingRight: 64 },
          ]}
          {...props}
        />
        {secureTextEntry ? (
          // Password fields get a Show / Hide toggle.
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={show ? 'Hide password' : 'Show password'}
            onPress={() => setShow(!show)}
            hitSlop={8}
            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: space.m }}>
            <T variant="eyebrow" style={{ color: c.accentText, fontSize: 11 }}>
              {show ? 'Hide' : 'Show'}
            </T>
          </Pressable>
        ) : null}
      </View>
      {hint ? (
        <T variant="label" muted>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

/** Pill switch, one option selected (Season / Majors / Minors in the brand book). */
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
    <View style={[styles.segmented, { backgroundColor: c.surface }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, { backgroundColor: on ? c.primary : 'transparent' }]}>
            <Text style={{ color: on ? c.onPrimary : c.text, fontFamily: fonts.bodyBold, fontSize: 13 }}>{o.label}</Text>
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
      <Text style={{ color: on ? c.onPrimary : c.text, fontFamily: fonts.bodyMedium, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

/** Match tags: Major filled pine, Minor outlined, Bonus blaze, Live red. */
export function Tag({ kind, label }: { kind: 'major' | 'minor' | 'bonus' | 'live' | 'final'; label: string }) {
  const c = usePalette();
  const dark = useScheme() === 'dark';
  const pine = dark ? c.text : c.head;
  const look = {
    major: { bg: dark ? c.text : c.head, fg: c.bg, border: 'transparent' },
    minor: { bg: 'transparent', fg: pine, border: pine },
    bonus: { bg: c.accent, fg: c.onAccent, border: 'transparent' },
    live: { bg: 'transparent', fg: c.danger, border: c.danger },
    final: { bg: 'transparent', fg: c.muted, border: c.muted },
  }[kind];
  return (
    <View style={[styles.tag, { backgroundColor: look.bg, borderColor: look.border }]}>
      <Text style={{ color: look.fg, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' }}>
        {label}
      </Text>
    </View>
  );
}

export function Avatar({ name, size = 28, url }: { name: string; size?: number; url?: string | null }) {
  const c = usePalette();
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.surface }}
        contentFit="cover"
        accessibilityLabel={name}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.accent,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ color: c.onAccent, fontFamily: fonts.displayBlack, fontSize: size * 0.42 }}>
        {(name.trim()[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );
}

/** The deer mark next to a screen title, like the brand book's app bar. */
export function HeaderTitle({ title }: { title: string }) {
  const c = usePalette();
  const dark = useScheme() === 'dark';
  return (
    <Row style={{ gap: space.s }}>
      <Image
        source={dark ? require('@/assets/images/logo-mark-blaze.png') : require('@/assets/images/logo-mark.png')}
        style={{ width: 20, height: 28 }}
        contentFit="contain"
      />
      <Text
        numberOfLines={1}
        style={{ color: c.text, fontFamily: fonts.displayBlack, fontSize: 24, textTransform: 'uppercase', maxWidth: 240 }}>
        {title}
      </Text>
    </Row>
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
    borderRadius: radius.card,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { borderRadius: radius.card, padding: space.l, gap: space.s },
  input: {
    minHeight: touch,
    borderWidth: 1.5,
    borderRadius: radius.input,
    paddingHorizontal: space.m,
    fontFamily: fonts.body,
    fontSize: 16,
  },
  segmented: { flexDirection: 'row', borderRadius: radius.chip, padding: 3 },
  segment: {
    flex: 1,
    minHeight: 36,
    borderRadius: radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.s,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: space.m,
    borderRadius: radius.chip,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: { borderRadius: radius.chip, borderWidth: 1.5, paddingHorizontal: 9, paddingVertical: 2, alignSelf: 'flex-start' },
});
