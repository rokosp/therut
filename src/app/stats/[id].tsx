import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { displayName, getProfile, handicapsFor, holesFor, listCourses, playerMatches } from '@/lib/api';
import { indexTrend } from '@/lib/handicap';
import { holeStats, type HoleCard } from '@/lib/stats';
import { useLoad } from '@/lib/useLoad';
import { Card, Chip, ErrorText, Row, Screen, Section, T } from '@/ui/components';
import { fonts, radius, space, usePalette } from '@/ui/theme';

const fmt = (n: number) => (n === 0 ? 'E' : n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2));

/** Handicap over time and how each hole of a course usually goes. */
export default function StatsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = usePalette();
  const [courseId, setCourseId] = useState<string | null>(null);
  const [width, setWidth] = useState(0);

  const { data, error, loading, reload } = useLoad(async () => {
    const [profile, courses, history] = await Promise.all([getProfile(id), listCourses(), playerMatches(id, 1000)]);
    const hcp = (await handicapsFor([id], courses)).get(id)!;
    return { profile, courses, history, trend: indexTrend(hcp.differentials) };
  }, [id]);

  if (!data) {
    return (
      <Screen refreshing={loading} onRefresh={reload}>
        <ErrorText error={error} />
      </Screen>
    );
  }

  const { profile, courses, history, trend } = data;

  // Hole-by-hole cards per course.
  const byCourse = new Map<string, HoleCard[]>();
  for (const m of history.matches) {
    const p = m.match_players.find((x) => x.user_id === id);
    if (!p?.hole_scores || !m.course_id) continue;
    const { played } = holesFor(m, courses, p.tee_id);
    const offset = m.nine === 'back' ? 9 : 0;
    const list = byCourse.get(m.course_id) ?? [];
    list.push({
      holeNumbers: [...Array(played.holes).keys()].map((i) => i + 1 + offset),
      holeScores: p.hole_scores,
      holePars: played.holePars,
    });
    byCourse.set(m.course_id, list);
  }
  const courseIds = [...byCourse.keys()].sort((a, b) => byCourse.get(b)!.length - byCourse.get(a)!.length);
  const active = courseId ?? courseIds[0] ?? null;
  const holes = active ? holeStats(byCourse.get(active)!) : [];
  const withPar = holes.filter((h) => h.overPar != null);
  const nemesis = withPar.length ? withPar.reduce((a, b) => (b.overPar! > a.overPar! ? b : a)) : null;
  const favourite = withPar.length ? withPar.reduce((a, b) => (b.overPar! < a.overPar! ? b : a)) : null;

  // Chart geometry.
  const H = 160;
  const pad = 12;
  const vals = trend.map((t) => t.index);
  const lo = Math.floor(Math.min(...vals, 99) - 1);
  const hi = Math.ceil(Math.max(...vals, -99) + 1);
  const x = (i: number) =>
    pad + (trend.length < 2 ? (width - 2 * pad) / 2 : (i / (trend.length - 1)) * (width - 2 * pad));
  const y = (v: number) => pad + ((hi - v) / Math.max(1, hi - lo)) * (H - 2 * pad);

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <Stack.Screen options={{ title: 'Stats' }} />
      <T variant="display" style={{ fontSize: 40, lineHeight: 40 }}>
        {displayName(profile)}
      </T>

      <Section title="Handicap trend" />
      {trend.length === 0 ? (
        <T muted>The app handicap needs 3 cards. The chart starts once there is one.</T>
      ) : (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <T variant="eyebrow" muted>
                Now
              </T>
              <T style={{ fontFamily: fonts.num, fontSize: 36, lineHeight: 38 }}>
                {trend[trend.length - 1].index.toFixed(1)}
              </T>
            </View>
            {trend.length > 1 ? (
              <View style={{ alignItems: 'flex-end' }}>
                <T variant="eyebrow" muted>
                  Since {trend[0].playedOn.slice(0, 7)}
                </T>
                <T
                  style={{
                    fontFamily: fonts.num,
                    fontSize: 24,
                    color: trend[trend.length - 1].index <= trend[0].index ? c.accentText : c.danger,
                  }}>
                  {(trend[trend.length - 1].index - trend[0].index > 0 ? '+' : '') +
                    (trend[trend.length - 1].index - trend[0].index).toFixed(1)}
                </T>
              </View>
            ) : null}
          </Row>
          <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: H }}>
            {width > 0 ? (
              <Svg width={width} height={H}>
                {[lo, (lo + hi) / 2, hi].map((v) => (
                  <Line key={v} x1={0} x2={width} y1={y(v)} y2={y(v)} stroke={c.border} strokeWidth={1} />
                ))}
                <Polyline
                  points={trend.map((t, i) => `${x(i)},${y(t.index)}`).join(' ')}
                  fill="none"
                  stroke={c.accent}
                  strokeWidth={3}
                  strokeLinejoin="round"
                />
                {trend.map((t, i) => (
                  <Circle key={i} cx={x(i)} cy={y(t.index)} r={i === trend.length - 1 ? 5 : 3} fill={c.primary} />
                ))}
              </Svg>
            ) : null}
          </View>
          <Row style={{ justifyContent: 'space-between' }}>
            <T variant="label" muted>
              {trend[0].playedOn}
            </T>
            <T variant="label" muted>
              Lower is better
            </T>
            <T variant="label" muted>
              {trend[trend.length - 1].playedOn}
            </T>
          </Row>
        </Card>
      )}

      <Section title="Hole by hole" />
      {courseIds.length === 0 ? <T muted>Hole stats appear after a round with hole-by-hole scores.</T> : null}
      {courseIds.length > 1 ? (
        <Row style={{ flexWrap: 'wrap' }}>
          {courseIds.map((cid) => (
            <Chip
              key={cid}
              label={courses.find((x) => x.id === cid)?.name ?? 'Course'}
              on={cid === active}
              onPress={() => setCourseId(cid)}
            />
          ))}
        </Row>
      ) : null}
      {nemesis && favourite ? (
        <Row style={{ alignItems: 'stretch' }}>
          <Card style={{ flex: 1 }}>
            <T variant="eyebrow" muted>
              Favourite hole
            </T>
            <T style={{ fontFamily: fonts.num, fontSize: 36, lineHeight: 38, color: c.accentText }}>{favourite.hole}</T>
            <T variant="label" muted>
              {fmt(favourite.overPar!)} on average
            </T>
          </Card>
          <Card style={{ flex: 1 }}>
            <T variant="eyebrow" muted>
              Nemesis hole
            </T>
            <T style={{ fontFamily: fonts.num, fontSize: 36, lineHeight: 38, color: c.danger }}>{nemesis.hole}</T>
            <T variant="label" muted>
              {fmt(nemesis.overPar!)} on average
            </T>
          </Card>
        </Row>
      ) : null}
      {holes.length ? (
        <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.input, overflow: 'hidden' }}>
          <Row style={{ gap: 0, backgroundColor: c.surface, paddingVertical: 6, paddingHorizontal: space.s }}>
            {['Hole', 'Par', 'Avg', '+/−', 'Best', 'Played'].map((h) => (
              <T key={h} variant="eyebrow" muted style={{ flex: 1, textAlign: h === 'Hole' ? 'left' : 'center' }}>
                {h}
              </T>
            ))}
          </Row>
          {holes.map((h) => {
            const tone =
              h.overPar == null ? c.text : h.overPar <= 0 ? c.accentText : h.overPar >= 1.5 ? c.danger : c.text;
            return (
              <Row
                key={h.hole}
                style={{
                  gap: 0,
                  paddingVertical: 6,
                  paddingHorizontal: space.s,
                  borderTopWidth: 1,
                  borderColor: c.border,
                }}>
                <T style={{ flex: 1, fontFamily: fonts.num, fontSize: 18 }}>{h.hole}</T>
                <T style={{ flex: 1, textAlign: 'center' }} muted>
                  {h.par ?? '–'}
                </T>
                <T style={{ flex: 1, textAlign: 'center', fontFamily: fonts.num, fontSize: 18 }}>
                  {h.average.toFixed(1)}
                </T>
                <T style={{ flex: 1, textAlign: 'center', color: tone, fontFamily: fonts.bodyBold }}>
                  {h.overPar == null ? '–' : fmt(h.overPar)}
                </T>
                <T style={{ flex: 1, textAlign: 'center' }}>{h.best}</T>
                <T style={{ flex: 1, textAlign: 'center' }} muted>
                  {h.played}
                </T>
              </Row>
            );
          })}
        </View>
      ) : null}
    </Screen>
  );
}
