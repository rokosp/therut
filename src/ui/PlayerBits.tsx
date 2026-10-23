import { View } from 'react-native';

import type { Career } from '@/lib/stats';

import { Row, Section, T } from './components';
import { fonts, radius, space, usePalette } from './theme';

/** App HCP in a solid card, own HCP in a dashed one, as in the brand book. */
export function HcpCards({ app, appNote, own }: { app: number | null | undefined; appNote: string; own: number | null | undefined }) {
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
        style={{ flex: 1, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.head, borderRadius: 12, padding: space.m, gap: 2 }}>
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
        <View key={s.l} style={{ flex: 1, alignItems: 'center', borderTopWidth: 2, borderColor: c.accent, paddingTop: space.s }}>
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
