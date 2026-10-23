import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, View } from 'react-native';

import { displayName, finishSeason, getLeague, listCourses, resultsFor } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { buildStandings } from '@/lib/standings';
import { useAction, useLoad } from '@/lib/useLoad';
import { Button, Card, ErrorText, Row, Screen, Section, Segmented, T, Tag } from '@/ui/components';
import { confirmAction } from '@/ui/confirm';
import { fonts, space, usePalette } from '@/ui/theme';

type Filter = 'season' | 'major' | 'minor';

export default function LeagueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const c = usePalette();
  const [filter, setFilter] = useState<Filter>('season');
  const finishing = useAction();

  const { data, error, loading, reload } = useLoad(async () => {
    const [bundle, courses] = await Promise.all([getLeague(id), listCourses()]);
    return { ...bundle, courses };
  }, [id]);

  if (!data) {
    return (
      <Screen refreshing={loading} onRefresh={reload}>
        <ErrorText error={error} />
      </Screen>
    );
  }

  const { league, settings, members, matches, courses } = data;
  const isAdmin = members.some((m) => m.user_id === userId && m.role === 'admin');
  const finished = !!league.finished_at;
  const openCount = matches.filter((m) => m.status === 'open').length;
  const confirmFinish = () =>
    confirmAction(
      'Finish the season?',
      `${openCount ? `${openCount} match${openCount === 1 ? ' still in progress is' : 'es still in progress are'} finished as they stand. ` : ''}After this nobody can change scores, matches, bonuses or settings. This can't be undone.`,
      'Finish season',
      () =>
        finishing.run(async () => {
          await finishSeason(league.id);
          await reload();
          router.push(`/league/${league.id}/stats`);
        }),
    );
  const nameOf = (uid: string) => displayName(members.find((m) => m.user_id === uid)?.profiles);
  const shown = matches.filter((m) => filter === 'season' || m.kind === filter);
  const finals = matches.filter((m) => m.status === 'final' && (filter === 'season' || m.kind === filter));
  const table = buildStandings(
    members.map((m) => m.user_id),
    finals.map((m) => resultsFor(m, settings, courses)),
  );

  const invite = () =>
    Share.share({ message: `Join "${league.name}" on The Rut. League code: ${league.join_code}` });

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <Stack.Screen
        options={{
          title: league.name,
          headerRight: isAdmin && !finished
            ? () => (
                <Pressable onPress={() => router.push(`/league/${id}/settings`)} hitSlop={12}>
                  <T variant="eyebrow" style={{ color: c.accentText, fontSize: 11 }}>
                    Settings
                  </T>
                </Pressable>
              )
            : undefined,
        }}
      />
      {league.season ? (
        <T variant="eyebrow" muted>
          Season {league.season}
        </T>
      ) : null}
      <ErrorText error={error} />

      {finished ? (
        <Card onPress={() => router.push(`/league/${id}/stats`)} style={{ backgroundColor: c.leader, borderColor: c.leader }}>
          <T variant="eyebrow" style={{ color: c.onLeader }}>
            Season finished · scores locked
          </T>
          <T variant="h1" style={{ color: c.onLeader }}>
            See the podium →
          </T>
        </Card>
      ) : null}

      <Segmented
        options={[
          { value: 'season', label: 'Season' },
          { value: 'major', label: 'Majors' },
          { value: 'minor', label: 'Minors' },
        ]}
        value={filter}
        onChange={setFilter}
      />

      {/* Standings rows run edge to edge, the leader on Blaze. */}
      <View style={{ marginHorizontal: -space.l, marginTop: -space.s }}>
        {table.map((r) => {
          const lead = r.rank === 1 && r.total > 0;
          const fg = lead ? c.onLeader : c.text;
          const sharedRank = table.filter((x) => x.rank === r.rank).length > 1;
          return (
            <Pressable key={r.userId} onPress={() => router.push(`/player/${r.userId}`)}>
            <Row
              style={{
                paddingHorizontal: space.l,
                paddingVertical: space.m,
                gap: space.m,
                borderBottomWidth: 1,
                borderColor: lead ? c.leader : c.border,
                backgroundColor: lead ? c.leader : undefined,
              }}>
              <T style={{ width: 24, textAlign: 'center', fontFamily: fonts.num, fontSize: 22, color: fg }}>{r.rank}</T>
              <View style={{ flex: 1 }}>
                <Row style={{ gap: 6 }}>
                  <T style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: fg }}>{nameOf(r.userId)}</T>
                  {sharedRank ? <Tag kind={lead ? 'minor' : 'final'} label="Tied" /> : null}
                </Row>
                <T variant="label" style={{ color: lead ? c.onLeader : c.muted }}>
                  {r.played} round{r.played === 1 ? '' : 's'} · {r.wins} win{r.wins === 1 ? '' : 's'}
                  {r.bonusPoints ? ` · +${r.bonusPoints} bonus` : ''}
                </T>
              </View>
              <T style={{ fontFamily: fonts.num, fontSize: 28, color: fg }}>{r.total}</T>
            </Row>
            </Pressable>
          );
        })}
      </View>

      <Row>
        {!finished ? (
          <Button title="+ Add match" onPress={() => router.push(`/league/${id}/new-match`)} style={{ flex: 1 }} />
        ) : null}
        <Button title="Season stats" kind="secondary" onPress={() => router.push(`/league/${id}/stats`)} style={{ flex: 1 }} />
      </Row>

      <Section
        title={`${filter === 'major' ? 'Majors' : filter === 'minor' ? 'Minors' : 'Matches'} · ${shown.length}`}
      />
      {shown.length === 0 && matches.length > 0 ? (
        <T muted>No {filter === 'major' ? 'majors' : 'minors'} played yet.</T>
      ) : null}
      {matches.length === 0 ? <T muted>No matches yet. Add the first one after your next round.</T> : null}
      {shown.map((m) => {
        const course = courses.find((x) => x.id === m.course_id);
        const res = resultsFor(m, settings, courses);
        const winners = res.filter((r) => r.position === 1).map((r) => nameOf(r.userId));
        return (
          <Card key={m.id} onPress={() => router.push(`/match/${m.id}`)}>
            <Row style={{ flexWrap: 'wrap' }}>
              <Tag kind={m.kind} label={`${m.kind} · ${m.holes}`} />
              <Tag kind="final" label={m.format === 'stableford' ? 'Stableford' : 'Stroke play'} />
              {m.bonus_awards.length ? <Tag kind="bonus" label="Bonus" /> : null}
              {m.status === 'open' ? <Tag kind="live" label="● Live" /> : null}
            </Row>
            <T variant="h2">{course?.name ?? 'Match'}</T>
            <T variant="label" muted>
              {m.played_on} · {m.status === 'final' ? `Won by ${winners.join(' & ') || '–'}` : 'In progress'}
            </T>
          </Card>
        );
      })}

      <Section title="Players" />
      <Card>
        {members.map((m) => (
          <Row key={m.user_id} style={{ justifyContent: 'space-between', minHeight: 32 }}>
            <T style={{ fontFamily: fonts.bodyBold }}>{displayName(m.profiles)}</T>
            <T variant="eyebrow" muted>
              {m.role === 'admin' ? 'Admin' : ''}
            </T>
          </Row>
        ))}
        <Row style={{ justifyContent: 'space-between', marginTop: space.s }}>
          <View>
            <T variant="eyebrow" muted>
              League code
            </T>
            <T style={{ fontFamily: fonts.num, fontSize: 26, letterSpacing: 2 }}>{league.join_code}</T>
          </View>
          <Button title="Invite" kind="secondary" compact onPress={invite} />
        </Row>
      </Card>

      {isAdmin && !finished ? (
        <>
          <ErrorText error={finishing.error} />
          <Button title="Finish season" kind="danger" onPress={confirmFinish} busy={finishing.busy} />
          <T variant="label" muted>
            Locks the league for good and crowns the winner.
          </T>
        </>
      ) : null}
    </Screen>
  );
}
