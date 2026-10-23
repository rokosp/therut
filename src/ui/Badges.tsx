import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { MAX_SHOWCASE, type AchGroup, type Achievement } from '@/lib/achievements';
import { Button, Section, T } from '@/ui/components';
import { brand, fonts, space, usePalette } from '@/ui/theme';

const COLORS: Record<AchGroup, { bg: string; fg: string; ring: string }> = {
  Playing: { bg: brand.pine, fg: brand.bone, ring: brand.blaze },
  Winning: { bg: brand.blaze, fg: brand.rough, ring: brand.pine },
  Holes: { bg: brand.birdie, fg: brand.bone, ring: brand.bone },
  Rounds: { bg: brand.rough, fg: brand.blaze, ring: brand.blaze },
  Strokes: { bg: brand.bone, fg: brand.pine, ring: brand.pine },
  Fun: { bg: brand.ember, fg: brand.bone, ring: brand.rough },
};

/** A round medallion with a short glyph. Locked badges are greyed out and show progress. */
export function Badge({
  a,
  size = 64,
  picked,
  onPress,
  showName = true,
}: {
  a: Achievement;
  size?: number;
  picked?: boolean;
  onPress?: () => void;
  showName?: boolean;
}) {
  const c = usePalette();
  const col = COLORS[a.group];
  picked = picked && a.earned;
  const glyphSize = size * (a.glyph.length <= 2 ? 0.42 : a.glyph.length === 3 ? 0.32 : 0.26);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityLabel={`${a.name}${a.earned ? '' : ', locked'}`}
      style={{ width: size + 28, alignItems: 'center', gap: 4 }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: a.earned ? col.bg : c.surface,
          borderWidth: picked ? 4 : 3,
          borderColor: picked ? c.accent : a.earned ? col.ring : c.border,
          borderStyle: a.earned ? 'solid' : 'dashed',
          opacity: a.earned ? 1 : 0.8,
        }}>
        {a.id === 'lone-wolf' ? (
          <PuddingGuy size={size * 0.72} color={a.earned ? col.fg : c.muted} />
        ) : (
          <T
            style={{
              fontFamily: fonts.displayBlack,
              fontSize: glyphSize,
              lineHeight: glyphSize * 1.1,
              color: a.earned ? col.fg : c.muted,
            }}>
            {a.glyph}
          </T>
        )}
      </View>
      {showName ? (
        <T variant="label" numberOfLines={2} style={{ textAlign: 'center', fontSize: 12, lineHeight: 15 }}>
          {a.name}
        </T>
      ) : null}
      {showName && !a.earned && a.target > 1 ? (
        <T variant="label" muted style={{ fontSize: 11, lineHeight: 13 }}>
          {a.value.toLocaleString('en-GB')}/{a.target.toLocaleString('en-GB')}
        </T>
      ) : null}
    </Pressable>
  );
}

/** The (up to 4) badges a player picked to show off. */
export function Showcase({
  ids,
  achievements,
  onPress,
}: {
  ids: string[];
  achievements: Achievement[];
  onPress?: () => void;
}) {
  const picked = ids
    .map((id) => achievements.find((a) => a.id === id))
    .filter((a): a is Achievement => !!a && a.earned);
  if (picked.length === 0) return null;
  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.xs }}>
        {picked.map((a) => (
          <Badge key={a.id} a={a} size={56} />
        ))}
      </View>
    </Pressable>
  );
}

/** Profile block: the picked badges plus a way into the full list. */
export function BadgesBlock({
  userId,
  mine,
  ids,
  achievements,
}: {
  userId: string;
  mine: boolean;
  ids: string[];
  achievements: Achievement[];
}) {
  const earned = achievements.filter((a) => a.earned).length;
  const shown = ids.filter((id) => achievements.some((a) => a.id === id && a.earned));
  const open = () => router.push(`/achievements/${userId}`);
  return (
    <View style={{ gap: space.s }}>
      <Section
        title="Badges"
        right={
          <T variant="label" muted>
            {earned}/{achievements.length}
          </T>
        }
      />
      {shown.length ? (
        <Showcase ids={shown} achievements={achievements} onPress={open} />
      ) : (
        <T muted>
          {mine
            ? earned
              ? `You've earned ${earned}. Pick up to ${MAX_SHOWCASE} to show off here.`
              : 'Play a match to start earning badges.'
            : `${earned} earned so far.`}
        </T>
      )}
      <Button title={mine ? 'All badges' : 'See their badges'} kind="secondary" onPress={open} />
    </View>
  );
}

/** A lone guy at a table, eating pudding by himself. */
function PuddingGuy({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx={60} cy={27} r={12} fill={color} />
      <Path d="M49 25 L44 32 L50 33 Z" fill={color} />
      <Path d="M50 52 Q52 42 64 41 Q84 42 88 66 L90 74 L50 74 Z" fill={color} />
      {/* Elbow on the table, spoon up to the mouth. */}
      <Path d="M56 50 L44 70" stroke={color} strokeWidth={9} strokeLinecap="round" />
      <Path d="M44 70 L40 46" stroke={color} strokeWidth={7} strokeLinecap="round" />
      <Path d="M40 45 L49 37" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      <Rect x={6} y={74} width={90} height={7} rx={2} fill={color} />
      <Rect x={76} y={81} width={6} height={15} fill={color} />
      {/* The pudding cup. */}
      <Path d="M17 63 L31 63 L29 74 L19 74 Z" fill={color} />
      <Path d="M16.5 63 Q18 56 24 58 Q30 56 31.5 63 Z" fill={color} />
    </Svg>
  );
}
