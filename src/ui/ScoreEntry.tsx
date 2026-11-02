import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { nextHoleToPlay, toParSoFar } from '@/lib/scan';
import { Button, Card, Row, T } from '@/ui/components';
import { fonts, radius, space, usePalette } from '@/ui/theme';

export type EntryPlayer = { id: string; name: string; scores: (number | null)[] };

const SCORE_NAMES: Record<number, string> = {
  [-3]: 'Albatross',
  [-2]: 'Eagle',
  [-1]: 'Birdie',
  0: 'Par',
  1: 'Bogey',
  2: 'Double',
  3: 'Triple',
};

/**
 * Hole-by-hole score entry: one row of big buttons per player, so most holes take one tap
 * per player. When the last score on a hole goes in, it moves on to the next hole by itself.
 */
export function ScoreEntry({
  players,
  holes,
  holeOffset,
  pars,
  strokeIndex,
  hole,
  setHole,
  onScore,
  holeNote,
  onScan,
  onTotalsOnly,
}: {
  players: EntryPlayer[];
  holes: number;
  holeOffset: number;
  pars: number[] | null | undefined;
  strokeIndex: number[] | null | undefined;
  hole: number;
  setHole: (h: number) => void;
  onScore: (playerId: string, hole: number, value: number | null) => void;
  /** Extra line under a player's name for this hole, like Stableford points. */
  holeNote?: (playerId: string, value: number) => string | null;
  onScan: () => void;
  onTotalsOnly: () => void;
}) {
  const c = usePalette();
  // Phones shouldn't lock between shots while the card is open.
  useKeepAwake();
  const [more, setMore] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelMove = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setMoving(false);
  };

  // Open on the next hole someone still needs a score for, not always hole 1.
  useEffect(() => {
    setHole(nextHoleToPlay(players.map((p) => p.scores), holes));
    return cancelMove;
    // Only when the entry first shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (h: number) => {
    cancelMove();
    setMore(null);
    setHole(Math.max(0, Math.min(holes - 1, h)));
  };

  const par = pars?.[hole] ?? null;
  const base = par ?? 4;
  const quick = [base - 1, base, base + 1, base + 2, base + 3].filter((n) => n >= 1);
  const done = (list: EntryPlayer[]) => list.every((p) => p.scores[hole] != null);
  const holesDone = Array.from({ length: holes }, (_, i) => players.every((p) => p.scores[i] != null)).filter(
    Boolean,
  ).length;
  const complete = done(players);

  const pick = (p: EntryPlayer, n: number) => {
    cancelMove();
    const current = p.scores[hole] ?? null;
    const value = current === n ? null : n;
    const wasDone = done(players);
    onScore(p.id, hole, value);
    setMore(null);
    const after = players.map((x) =>
      x.id === p.id ? { ...x, scores: Object.assign([...x.scores], { [hole]: value }) } : x,
    );
    if (!wasDone && done(after) && hole < holes - 1) {
      setMoving(true);
      const from = hole;
      timer.current = setTimeout(() => {
        timer.current = null;
        setMoving(false);
        setHole(from + 1);
      }, 900);
    }
  };

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <NavButton label="‹" disabled={hole === 0} onPress={() => go(hole - 1)} />
        <View style={{ alignItems: 'center', flex: 1 }}>
          <T variant="eyebrow" muted>
            Hole
          </T>
          <T variant="score" style={{ fontSize: 48, lineHeight: 50 }}>
            {hole + 1 + holeOffset}
          </T>
          <T variant="label" muted>
            {par != null ? `Par ${par}` : 'Par –'}
            {strokeIndex?.[hole] ? ` · SI ${strokeIndex[hole]}` : ''}
          </T>
        </View>
        <NavButton label="›" disabled={hole === holes - 1} onPress={() => go(hole + 1)} />
      </Row>
      <HoleDots holes={holes} hole={hole} players={players} onPick={go} />

      {players.map((p) => {
        const value = p.scores[hole] ?? null;
        const soFar = toParSoFar(p.scores, pars);
        const note = value != null ? holeNote?.(p.id, value) : null;
        const offQuick = value != null && !quick.includes(value);
        return (
          <View key={p.id} style={{ gap: space.xs, paddingTop: space.s }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T style={{ fontFamily: fonts.bodyBold, fontSize: 16, flex: 1 }} numberOfLines={1}>
                {p.name}
              </T>
              <T variant="label" muted>
                {[note, soFar.thru ? `${soFar.label} thru ${soFar.thru}` : null].filter(Boolean).join(' · ')}
              </T>
            </Row>
            <Row style={{ gap: space.xs }}>
              {quick.map((n) => (
                <ScoreButton key={n} n={n} par={par} on={value === n} onPress={() => pick(p, n)} />
              ))}
              <ScoreButton
                label={offQuick ? String(value) : '…'}
                sub={offQuick ? 'Change' : 'Other'}
                on={offQuick || more === p.id}
                onPress={() => setMore(more === p.id ? null : p.id)}
              />
            </Row>
            {more === p.id ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <View key={n} style={{ width: '15%', flexGrow: 1 }}>
                    <ScoreButton n={n} par={par} on={value === n} onPress={() => pick(p, n)} />
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}

      {moving ? (
        <T variant="label" style={{ textAlign: 'center', color: c.accentText }}>
          All in. On to hole {hole + 2 + holeOffset}…
        </T>
      ) : complete && hole < holes - 1 ? (
        <Button title={`Next hole · ${hole + 2 + holeOffset} ›`} kind="accent" onPress={() => go(hole + 1)} />
      ) : complete && holesDone === holes ? (
        <T variant="label" style={{ textAlign: 'center', color: c.accentText }}>
          Card complete. Finish the match at the bottom when you're ready.
        </T>
      ) : null}

      <T variant="label" muted style={{ textAlign: 'center' }}>
        Tap a score again to clear it. {holesDone} of {holes} holes done.
      </T>
      <Button title="Scan a paper scorecard" kind="secondary" onPress={onScan} />
      <Pressable onPress={onTotalsOnly} hitSlop={8} style={{ alignSelf: 'center', padding: space.xs }}>
        <T variant="label" style={{ color: c.accentText, textDecorationLine: 'underline' }}>
          Only have totals? Enter totals instead
        </T>
      </Pressable>
    </Card>
  );
}

function NavButton({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === '‹' ? 'Previous hole' : 'Next hole'}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 60,
        height: 60,
        borderRadius: radius.input,
        borderWidth: 1,
        borderColor: c.head,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.3 : pressed ? 0.7 : 1,
      })}>
      <T style={{ fontFamily: fonts.bodyBold, fontSize: 30, lineHeight: 34, color: c.head }}>{label}</T>
    </Pressable>
  );
}

/** A strip of small dots, one per hole: filled when every score is in. Tap one to jump there. */
function HoleDots({
  holes,
  hole,
  players,
  onPick,
}: {
  holes: number;
  hole: number;
  players: EntryPlayer[];
  onPick: (h: number) => void;
}) {
  const c = usePalette();
  return (
    <Row style={{ justifyContent: 'center', gap: 4, flexWrap: 'wrap' }}>
      {Array.from({ length: holes }, (_, i) => {
        const full = players.every((p) => p.scores[i] != null);
        const some = players.some((p) => p.scores[i] != null);
        return (
          <Pressable key={i} onPress={() => onPick(i)} hitSlop={4} accessibilityLabel={`Hole ${i + 1}`}>
            <View
              style={{
                width: i === hole ? 18 : 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: full ? c.primary : some ? c.accent : 'transparent',
                borderWidth: 1,
                borderColor: i === hole ? c.head : c.border,
              }}
            />
          </Pressable>
        );
      })}
    </Row>
  );
}

/** One big score button: the number, with birdie/par/bogey underneath. */
function ScoreButton({
  n,
  par,
  label,
  sub,
  on,
  onPress,
}: {
  n?: number;
  par?: number | null;
  label?: string;
  sub?: string;
  on: boolean;
  onPress: () => void;
}) {
  const c = usePalette();
  const name = sub ?? (n != null && par != null ? (n === 1 ? 'Ace' : SCORE_NAMES[n - par]) : null);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label ?? n}${name ? `, ${name}` : ''}`}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 56,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.small,
        borderWidth: 1,
        borderColor: on ? c.primary : c.border,
        backgroundColor: on ? c.primary : pressed ? c.border : 'transparent',
      })}>
      <T style={{ fontFamily: fonts.num, fontSize: 24, lineHeight: 26, color: on ? c.onPrimary : c.text }}>
        {label ?? n}
      </T>
      {name ? <T style={{ fontSize: 10, lineHeight: 12, color: on ? c.onPrimary : c.muted }}>{name}</T> : null}
    </Pressable>
  );
}
