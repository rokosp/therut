import { Pressable, View } from 'react-native';

import { Button, Row, T } from './components';
import { fonts, radius, space, usePalette } from './theme';

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
export const todayIso = () => {
  const t = new Date();
  return isoDay(t.getFullYear(), t.getMonth(), t.getDate());
};

/** A month of days, Monday first. Days in `marks` get dots; `selected` is filled in. */
export function MonthGrid({
  year,
  month,
  onStep,
  selected,
  onPick,
  marks,
  subtitle,
  compact = false,
}: {
  year: number;
  month: number;
  onStep: (delta: number) => void;
  selected: string | null;
  onPick: (iso: string) => void;
  marks?: Map<string, number>;
  subtitle?: string;
  compact?: boolean;
}) {
  const c = usePalette();
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysIn = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...[...Array(daysIn).keys()].map((d) => d + 1)];
  while (cells.length % 7) cells.push(null);
  const today = todayIso();
  return (
    <View style={{ gap: space.s }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Button title="‹" kind="secondary" compact onPress={() => onStep(-1)} style={{ width: 48 }} />
        <View style={{ alignItems: 'center' }}>
          <T variant={compact ? 'h2' : 'h1'}>
            {MONTHS[month]} {year}
          </T>
          {subtitle ? (
            <T variant="label" muted>
              {subtitle}
            </T>
          ) : null}
        </View>
        <Button title="›" kind="secondary" compact onPress={() => onStep(1)} style={{ width: 48 }} />
      </Row>
      <View>
        <Row style={{ gap: 0 }}>
          {DAYS.map((d) => (
            <View key={d} style={{ flex: 1, alignItems: 'center', paddingBottom: space.xs }}>
              <T variant="eyebrow" muted>
                {d}
              </T>
            </View>
          ))}
        </Row>
        {[...Array(cells.length / 7).keys()].map((w) => (
          <Row key={w} style={{ gap: 0 }}>
            {cells.slice(w * 7, w * 7 + 7).map((d, i) => {
              if (d == null) return <View key={i} style={{ flex: 1, aspectRatio: compact ? 1.15 : 1 }} />;
              const key = isoDay(year, month, d);
              const count = marks?.get(key) ?? 0;
              const on = selected === key;
              return (
                <Pressable
                  key={i}
                  onPress={() => onPick(key)}
                  style={{ flex: 1, aspectRatio: compact ? 1.15 : 1, padding: 2 }}>
                  <View
                    style={{
                      flex: 1,
                      borderRadius: radius.input,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: on ? c.primary : count ? c.surface : undefined,
                      borderWidth: key === today ? 1.5 : 0,
                      borderColor: c.accent,
                    }}>
                    <T
                      style={{
                        fontFamily: fonts.num,
                        fontSize: compact ? 16 : 18,
                        color: on ? c.onPrimary : count ? c.text : c.muted,
                      }}>
                      {d}
                    </T>
                    {count ? (
                      <Row style={{ gap: 2, position: 'absolute', bottom: 4 }}>
                        {[...Array(Math.min(count, 3)).keys()].map((k) => (
                          <View key={k} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.accent }} />
                        ))}
                      </Row>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </Row>
        ))}
      </View>
    </View>
  );
}
