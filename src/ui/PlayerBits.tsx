import { View } from 'react-native';

import { router } from 'expo-router';

import { resultsFor, type Course, type LiveMatch } from '@/lib/api';
import { headToHead, type Career } from '@/lib/stats';
import { withDefaults } from '@/lib/types';

import { Card, Row, Section, T } from './components';
import { fonts, radius, space, usePalette } from './theme';

/** App HCP in a solid card, own HCP in a dashed one, as in the brand book. */
export function HcpCards({
  app,
  appNote,
  own,
}: {
  app: number | null | undefined;
  appNote: string;
  own: number | null | undefined;
}) {
  const c = usePalette();
  return (
    <Row style={{ alignItems: 'stretch', gap: space.s }}>
      <View style={{ flex: 1, backgroundColor: c.primary, borderRadius: 12, padding: space.m, gap: 2 }}>
        <T variant="eyebrow" style={{ color: c.onPrimary }}>
          App HCP
        </T>
        <T variant="score" style={{ color: c.onPrimary, fontSize: 44 }}>
          {app != null ? Number(app).toFixed(1) : '–'}
        </T>
        <T variant="label" style={{ color: c.onPrimary }}>
          {appNote}
        </T>
      </View>
      <View
        style={{
          flex: 1,
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: c.head,
          borderRadius: 12,
          padding: space.m,
          gap: 2,
        }}>
        <T variant="eyebrow">Own HCP</T>
        <T variant="score" style={{ fontSize: 44 }}>
          {own != null ? Number(own).toFixed(1) : '–'}
        </T>
        <T variant="label">{own != null ? 'Entered by player' : 'Not set'}</T>
      </View>
    </Row>
  );
}

export function StatsRow({ items }: { items: { v: string | number; l: string }[] }) {
  const c = usePalette();
  return (
    <Row style={{ gap: space.s }}>
      {items.map((s) => (
        <View
          key={s.l}
          style={{ flex: 1, alignItems: 'center', borderTopWidth: 2, borderColor: c.accent, paddingTop: space.s }}>
          <T style={{ fontFamily: fonts.num, fontSize: 28 }}>{s.v}</T>
          <T variant="label" muted style={{ textAlign: 'center' }}>
            {s.l}
          </T>
        </View>
      ))}
    </Row>
  );
}

const toPar = (n: number) => (n === 0 ? 'E' : n > 0 ? `+${n}` : String(n));

/** Lifetime numbers from every card: best rounds, then how each hole went against par. */
export function CareerHighlights({ career }: { career: Career }) {
  const c = usePalette();
  if (career.rounds === 0) return null;
  const tiles: { v: string | number; l: string; note?: string; tone?: 'good' | 'bad' }[] = [
    { v: career.best18?.gross ?? '–', l: 'Best 18', note: career.best18 ? toPar(career.best18.toPar) : undefined },
    { v: career.best9?.gross ?? '–', l: 'Best 9', note: career.best9 ? toPar(career.best9.toPar) : undefined },
    { v: career.rounds, l: 'Rounds' },
    { v: career.holesPlayed, l: 'Holes played' },
    { v: career.holesPlayed ? (career.strokes / career.holesPlayed).toFixed(2) : '–', l: 'Strokes per hole' },
    { v: career.strokes.toLocaleString('en-GB'), l: 'Total strokes' },
    { v: career.aces, l: 'Holes in one', tone: 'good' },
    { v: career.eagles, l: 'Eagles', tone: 'good' },
    { v: career.birdies, l: 'Birdies', tone: 'good' },
    { v: career.pars, l: 'Pars' },
    { v: career.bogeys, l: 'Bogeys' },
    { v: career.doubles, l: 'Doubles or worse', tone: 'bad' },
  ];
  return (
    <View style={{ gap: space.s }}>
      <Section title="Career highlights" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
        {tiles.map((t) => (
          <View
            key={t.l}
            style={{
              width: '31.5%',
              flexGrow: 1,
              backgroundColor: c.surface,
              borderRadius: radius.input,
              paddingVertical: space.s,
              paddingHorizontal: space.s,
              alignItems: 'center',
            }}>
            <T
              style={{
                fontFamily: fonts.num,
                fontSize: 28,
                lineHeight: 30,
                color: t.tone === 'good' ? c.accentText : t.tone === 'bad' ? c.danger : c.text,
              }}>
              {t.v}
            </T>
            {t.note ? (
              <T variant="eyebrow" muted>
                {t.note}
              </T>
            ) : null}
            <T variant="label" muted style={{ textAlign: 'center' }}>
              {t.l}
            </T>
          </View>
        ))}
      </View>
    </View>
  );
}

/** My record against another player, from finished matches we both played. */
export function HeadToHead({
  me,
  them,
  theirName,
  matches,
  courses,
}: {
  me: string;
  them: string;
  theirName: string;
  matches: LiveMatch[];
  courses: Course[];
}) {
  const c = usePalette();
  const shared = matches
    .filter((m) => m.status === 'final' && m.match_players.some((p) => p.user_id === me))
    .map((m) => {
      const res = resultsFor(m, withDefaults(m.leagues?.settings), courses);
      const a = res.find((r) => r.userId === me);
      const b = res.find((r) => r.userId === them);
      const stableford = m.format === 'stableford';
      return {
        matchId: m.id,
        playedOn: m.played_on,
        mine: a?.position ?? null,
        theirs: b?.position ?? null,
        myScore: (stableford ? a?.stableford : a?.gross) ?? null,
        theirScore: (stableford ? b?.stableford : b?.gross) ?? null,
        stableford,
      };
    });
  const h = headToHead(shared);
  if (h.wins + h.losses + h.ties === 0) return null;
  const last = h.last!;
  const margin = last.myScore != null && last.theirScore != null ? Math.abs(last.myScore - last.theirScore) : null;
  const unit = last.stableford ? 'pt' : 'stroke';
  const lastText =
    last.mine! < last.theirs!
      ? `You won the last one${margin ? ` by ${margin} ${unit}${margin === 1 ? '' : 's'}` : ''}`
      : last.mine! > last.theirs!
        ? `${theirName} won the last one${margin ? ` by ${margin} ${unit}${margin === 1 ? '' : 's'}` : ''}`
        : 'The last one was a tie';
  const cell = (v: number, l: string, color: string) => (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <T style={{ fontFamily: fonts.num, fontSize: 40, lineHeight: 42, color }}>{v}</T>
      <T variant="eyebrow" muted>
        {l}
      </T>
    </View>
  );
  return (
    <Card onPress={() => router.push(`/match/${last.matchId}`)}>
      <T variant="eyebrow" muted>
        Head to head · you vs {theirName}
      </T>
      <Row>
        {cell(h.wins, 'Wins', c.accentText)}
        {cell(h.ties, 'Ties', c.text)}
        {cell(h.losses, 'Losses', c.danger)}
      </Row>
      <T variant="label" muted style={{ textAlign: 'center' }}>
        {lastText} (
        {new Date(`${last.playedOn}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})
      </T>
    </Card>
  );
}
