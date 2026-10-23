import { router } from 'expo-router';
import { View } from 'react-native';

import { displayName, holesFor, listCourses, listLiveMatches, type LiveMatch, type Profile } from '@/lib/api';
import { buildCommentary } from '@/lib/commentary';
import { strokesPerHole } from '@/lib/handicap';
import { withDefaults } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';
import { Card, ErrorText, Row, Screen, T } from '@/ui/components';
import { fonts, space, usePalette } from '@/ui/theme';

export default function LiveScreen() {
  const { data, error, loading, reload } = useLoad(
    async () => {
      const [live, courses] = await Promise.all([listLiveMatches(), listCourses()]);
      return { ...live, courses };
    },
    [],
    { pollMs: 10000 },
  );

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <T muted>Matches being played right now in your leagues. Updates every few seconds.</T>
      <ErrorText error={error} />
      {data?.matches.length === 0 ? (
        <Card>
          <T variant="title">Nobody's out right now</T>
          <T muted>When a match is started, it shows up here so you can follow along.</T>
        </Card>
      ) : null}
      {data?.matches.map((m) => (
        <LiveCard key={m.id} match={m} profiles={data.profiles} courses={data.courses} />
      ))}
    </Screen>
  );
}

function LiveCard({
  match,
  profiles,
  courses,
}: {
  match: LiveMatch;
  profiles: Profile[];
  courses: Awaited<ReturnType<typeof listCourses>>;
}) {
  const c = usePalette();
  const settings = withDefaults(match.leagues.settings);
  const { course, played } = holesFor(match, courses);
  const net = settings.scoring === 'net';
  const nameOf = (id: string) => displayName(profiles.find((p) => p.id === id));

  const rows = match.match_players
    .map((p) => {
      const shots = strokesPerHole(p.course_handicap, played.holes, played.strokeIndex);
      let thru = 0;
      let toPar = 0;
      let total = 0;
      (p.hole_scores ?? []).forEach((s, i) => {
        if (s == null) return;
        thru += 1;
        const adj = s - (net ? shots[i] : 0);
        total += adj;
        toPar += adj - (played.holePars?.[i] ?? 0);
      });
      return { id: p.user_id, thru, total, toPar };
    })
    .sort((a, b) => (played.holePars ? a.toPar - b.toPar : a.total - b.total) || b.thru - a.thru);

  const feed = buildCommentary({
    players: match.match_players.map((p) => ({
      userId: p.user_id,
      name: nameOf(p.user_id),
      holeScores: p.hole_scores,
      courseHandicap: p.course_handicap,
    })),
    holes: played.holes,
    holePars: played.holePars,
    strokeIndex: played.strokeIndex,
    scoring: settings.scoring,
    holeOffset: match.nine === 'back' ? 9 : 0,
  });

  const fmt = (n: number) => (n === 0 ? 'E' : n > 0 ? `+${n}` : String(n));

  return (
    <Card onPress={() => router.push(`/match/${match.id}`)}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="label" style={{ color: c.danger }}>
          ● LIVE
        </T>
        <T variant="label" muted>
          {match.leagues.name} · {match.kind === 'major' ? 'MAJOR' : 'MINOR'}
        </T>
      </Row>
      <T variant="h2">{course?.name ?? 'Match'}</T>
      {rows.map((r, i) => (
        <Row key={r.id} style={{ minHeight: 36 }}>
          <T variant="mono" style={{ width: 24 }}>
            {i + 1}
          </T>
          <T style={{ flex: 1, fontFamily: fonts.bodyBold }}>{nameOf(r.id)}</T>
          <T variant="label" muted style={{ width: 64, textAlign: 'right' }}>
            {r.thru === 0 ? 'not started' : r.thru === played.holes ? 'done' : `thru ${r.thru}`}
          </T>
          <T variant="mono" style={{ width: 52, textAlign: 'right', fontSize: 18 }}>
            {r.thru === 0 ? '–' : played.holePars ? fmt(r.toPar) : r.total}
          </T>
        </Row>
      ))}
      {feed.length > 0 ? (
        <View style={{ borderTopWidth: 1, borderColor: c.border, paddingTop: space.s, gap: space.xs }}>
          {feed.slice(0, 2).map((l, i) => (
            <T key={i} muted={i > 0}>
              {l.text}
            </T>
          ))}
        </View>
      ) : null}
      <T variant="label" muted>
        {net ? 'Net scores' : 'Gross scores'} · tap to watch
      </T>
    </Card>
  );
}
