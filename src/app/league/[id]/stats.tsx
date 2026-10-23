import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { displayName, getLeague, holesFor, listCourses, resultsFor } from '@/lib/api';
import { buildStandings } from '@/lib/standings';
import { seasonAwards, type SeasonCard } from '@/lib/stats';
import { useLoad } from '@/lib/useLoad';
import { Fireworks } from '@/ui/Fireworks';
import { PlayerLink } from '@/ui/PlayerLink';
import { Avatar, Button, Card, ErrorText, Row, Screen, Section, T } from '@/ui/components';
import { fonts, radius, space, usePalette } from '@/ui/theme';

/** Season podium plus fun awards from every finished card in the league. */
export default function SeasonStats() {
  // Fireworks on the podium of a finished season (celebrate=1 also covers the moment it's finished).
  const { id, celebrate } = useLocalSearchParams<{ id: string; celebrate?: string }>();
  const c = usePalette();
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
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

  const { league, members, matches, settings, courses } = data;
  const nameOf = (uid: string) => displayName(members.find((m) => m.user_id === uid)?.profiles);
  const finals = matches.filter((m) => m.status === 'final');
  const resultsByMatch = finals.map((m) => resultsFor(m, settings, courses));
  const table = buildStandings(
    members.map((m) => m.user_id),
    resultsByMatch,
  ).filter((r) => r.played > 0);

  const cards: SeasonCard[] = finals.flatMap((m, i) =>
    m.match_players.map((p) => {
      const { course, played } = holesFor(m, courses, p.tee_id);
      const r = resultsByMatch[i].find((x) => x.userId === p.user_id);
      return {
        userId: p.user_id,
        matchId: m.id,
        playedOn: m.played_on,
        courseName: course?.name ?? 'Match',
        holeOffset: m.nine === 'back' ? 9 : 0,
        holeScores: p.hole_scores,
        holePars: played.holePars,
        gross: r?.gross ?? null,
        par: played.par,
        won: r?.position === 1 && !r.tied,
      };
    }),
  );
  const awards = seasonAwards(cards);

  // Podium order on screen: 2nd, 1st, 3rd.
  const top = table.slice(0, 3);
  const podium = [top[1], top[0], top[2]].filter(Boolean);
  const heights: Record<number, number> = { 1: 120, 2: 88, 3: 64 };

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <Stack.Screen options={{ title: 'Season stats' }} />
      <View onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        <View>
          <T variant="eyebrow" muted>
            {league.name}
            {league.season ? ` · Season ${league.season}` : ''}
          </T>
          <T variant="display" style={{ fontSize: 44, lineHeight: 44 }}>
            {league.finished_at ? 'Final standings' : 'Standings so far'}
          </T>
        </View>
        <ErrorText error={error} />

        {top.length === 0 ? (
          <Card>
            <T variant="h2">Nothing to show yet</T>
            <T muted>Stats appear once the first match is finished.</T>
          </Card>
        ) : (
          <Row style={{ alignItems: 'flex-end', gap: space.s, marginTop: space.m }}>
            {podium.map((r) => {
              const place = top.indexOf(r) + 1;
              const first = place === 1;
              return (
                <Pressable key={r.userId} style={{ flex: 1 }} onPress={() => router.push(`/player/${r.userId}`)}>
                  <View style={{ alignItems: 'center', gap: 4, marginBottom: space.s }}>
                    <Avatar
                      name={nameOf(r.userId)}
                      size={first ? 52 : 40}
                      url={members.find((m) => m.user_id === r.userId)?.profiles.avatar_url}
                    />
                    <T numberOfLines={1} style={{ fontFamily: fonts.bodyBold, fontSize: first ? 17 : 15 }}>
                      {nameOf(r.userId)}
                    </T>
                    <T style={{ fontFamily: fonts.num, fontSize: first ? 30 : 24, lineHeight: first ? 32 : 26 }}>
                      {r.total}
                    </T>
                    <T variant="eyebrow" muted>
                      points
                    </T>
                  </View>
                  <View
                    style={{
                      height: heights[place],
                      backgroundColor: first ? c.leader : c.surface,
                      borderTopLeftRadius: radius.input,
                      borderTopRightRadius: radius.input,
                      borderWidth: first ? 0 : 1,
                      borderBottomWidth: 0,
                      borderColor: c.border,
                      alignItems: 'center',
                      paddingTop: space.s,
                    }}>
                    <T
                      style={{
                        fontFamily: fonts.num,
                        fontSize: first ? 48 : 36,
                        lineHeight: first ? 52 : 40,
                        color: first ? c.onLeader : c.text,
                      }}>
                      {r.rank}
                    </T>
                    <T variant="eyebrow" style={{ color: first ? c.onLeader : c.muted }}>
                      {place === 1 ? 'Winner' : place === 2 ? 'Runner-up' : 'Third'}
                    </T>
                  </View>
                </Pressable>
              );
            })}
          </Row>
        )}
        {box && top.length && (league.finished_at || celebrate === '1') ? (
          <Fireworks width={box.w} height={box.h} />
        ) : null}
      </View>

      {table.length > 3 ? (
        <View style={{ marginTop: -space.s }}>
          {table.slice(3).map((r) => (
            <Row key={r.userId} style={{ paddingVertical: space.s, borderBottomWidth: 1, borderColor: c.border }}>
              <T style={{ width: 28, fontFamily: fonts.num, fontSize: 20 }}>{r.rank}</T>
              <T style={{ flex: 1, fontFamily: fonts.bodyBold }}>{nameOf(r.userId)}</T>
              <T style={{ fontFamily: fonts.num, fontSize: 22 }}>{r.total}</T>
            </Row>
          ))}
        </View>
      ) : null}

      {table.length ? (
        <Button title="Share season recap" kind="secondary" onPress={() => router.push(`/league/${id}/recap`)} />
      ) : null}
      {awards.length ? <Section title="Awards" /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
        {awards.map((a) => (
          <Card key={a.key} style={{ width: '48.5%', flexGrow: 1 }}>
            <T variant="eyebrow" muted>
              {a.title}
            </T>
            <T
              style={{
                fontFamily: fonts.num,
                fontSize: 40,
                lineHeight: 42,
                color: a.key === 'worst' || a.key === 'blowups' ? c.danger : c.accentText,
              }}>
              {a.value}
            </T>
            <Row style={{ flexWrap: 'wrap', gap: 0 }}>
              {a.userIds.map((uid, k) => (
                <PlayerLink key={uid} id={uid}>
                  <T style={{ fontFamily: fonts.bodyBold }}>
                    {nameOf(uid)}
                    {k < a.userIds.length - 2 ? ', ' : k === a.userIds.length - 2 ? ' & ' : ''}
                  </T>
                </PlayerLink>
              ))}
            </Row>
            <T variant="label" muted>
              {a.detail}
            </T>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
