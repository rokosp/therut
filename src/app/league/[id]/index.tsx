import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, Share, View } from 'react-native';

import { displayName, getLeague, handicapsFor, listCourses, resultsFor } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { buildStandings } from '@/lib/standings';
import { useLoad } from '@/lib/useLoad';
import { Button, Card, ErrorText, Row, Screen, T } from '@/ui/components';
import { fonts, space, usePalette } from '@/ui/theme';

export default function LeagueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const c = usePalette();

  const { data, error, loading, reload } = useLoad(async () => {
    const [bundle, courses] = await Promise.all([getLeague(id), listCourses()]);
    const hcps = await handicapsFor(bundle.members.map((m) => m.user_id), courses);
    return { ...bundle, courses, hcps };
  }, [id]);

  if (!data) {
    return (
      <Screen refreshing={loading} onRefresh={reload}>
        <ErrorText error={error} />
      </Screen>
    );
  }

  const { league, settings, members, matches, courses, hcps } = data;
  const isAdmin = members.some((m) => m.user_id === userId && m.role === 'admin');
  const nameOf = (uid: string) => displayName(members.find((m) => m.user_id === uid)?.profiles);
  const finals = matches.filter((m) => m.status === 'final');
  const table = buildStandings(
    members.map((m) => m.user_id),
    finals.map((m) => resultsFor(m, settings)),
  );

  const invite = () =>
    Share.share({ message: `Join "${league.name}" on The Rut. League code: ${league.join_code}` });

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <Stack.Screen
        options={{
          title: league.name.toUpperCase(),
          headerRight: isAdmin
            ? () => (
                <Pressable onPress={() => router.push(`/league/${id}/settings`)} hitSlop={12}>
                  <T style={{ fontFamily: fonts.bodyBold, color: c.accentText }}>Settings</T>
                </Pressable>
              )
            : undefined,
        }}
      />
      <ErrorText error={error} />

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <View style={{ padding: space.l, paddingBottom: space.s }}>
          <T variant="h2">Standings</T>
          <T variant="label" muted>
            {finals.length} finished match{finals.length === 1 ? '' : 'es'}
          </T>
        </View>
        <Row style={{ paddingHorizontal: space.l, paddingVertical: space.s, borderTopWidth: 1, borderColor: c.border }}>
          <T variant="label" muted style={{ width: 28 }}>#</T>
          <T variant="label" muted style={{ flex: 1 }}>PLAYER</T>
          <T variant="label" muted style={{ width: 28, textAlign: 'right' }}>P</T>
          <T variant="label" muted style={{ width: 28, textAlign: 'right' }}>W</T>
          <T variant="label" muted style={{ width: 44, textAlign: 'right' }}>BON</T>
          <T variant="label" muted style={{ width: 60, textAlign: 'right' }}>PTS</T>
        </Row>
        {table.map((r) => (
          <Row
            key={r.userId}
            style={{
              paddingHorizontal: space.l,
              minHeight: 48,
              borderTopWidth: 1,
              borderColor: c.border,
              backgroundColor: r.rank === 1 && r.total > 0 ? c.leader : undefined,
            }}>
            <T variant="mono" style={{ width: 28 }}>{r.rank}</T>
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: fonts.bodyBold }}>{nameOf(r.userId)}</T>
              <T variant="label" muted>
                HCP {hcps.get(r.userId)?.index?.toFixed(1) ?? '–'}
              </T>
            </View>
            <T variant="mono" style={{ width: 28, textAlign: 'right' }}>{r.played}</T>
            <T variant="mono" style={{ width: 28, textAlign: 'right' }}>{r.wins}</T>
            <T variant="mono" style={{ width: 44, textAlign: 'right' }}>{r.bonusPoints}</T>
            <T variant="mono" style={{ width: 60, textAlign: 'right', fontSize: 18 }}>{r.total}</T>
          </Row>
        ))}
      </Card>

      <Button title="New match" kind="accent" onPress={() => router.push(`/league/${id}/new-match`)} />

      <T variant="h2">Matches</T>
      {matches.length === 0 ? <T muted>No matches yet.</T> : null}
      {matches.map((m) => {
        const course = courses.find((x) => x.id === m.course_id);
        const res = resultsFor(m, settings);
        const winners = res.filter((r) => r.position === 1).map((r) => nameOf(r.userId));
        return (
          <Card key={m.id} onPress={() => router.push(`/match/${m.id}`)}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T variant="title">{course?.name ?? 'Course not set'}</T>
              <T variant="label" style={{ color: m.kind === 'major' ? c.accentText : c.muted }}>
                {m.kind === 'major' ? 'MAJOR' : 'MINOR'} · {m.holes}
              </T>
            </Row>
            <T muted>
              {m.played_on} · {m.status === 'final' ? `Won by ${winners.join(' & ') || '–'}` : 'In progress'}
            </T>
          </Card>
        );
      })}

      <Card>
        <T variant="title">Players</T>
        {members.map((m) => (
          <Row key={m.user_id} style={{ justifyContent: 'space-between' }}>
            <T>
              {displayName(m.profiles)}
              {m.role === 'admin' ? ' (admin)' : ''}
            </T>
            <T variant="mono" muted>
              {m.profiles.self_handicap != null ? `own ${Number(m.profiles.self_handicap).toFixed(1)}` : ''}
            </T>
          </Row>
        ))}
        <T variant="label" muted>
          League code: <T variant="mono">{league.join_code}</T>
        </T>
        <Button title="Invite players" kind="secondary" onPress={invite} />
      </Card>
    </Screen>
  );
}
