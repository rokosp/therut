import { View } from 'react-native';

import { Row, T } from './components';
import { fonts, space, usePalette } from './theme';

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
          <T variant="label" muted>
            {s.l}
          </T>
        </View>
      ))}
    </Row>
  );
}
