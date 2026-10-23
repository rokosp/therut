import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { displayName, handicapsFor, listCourses, listLeagues, listUpcoming, syncMyHandicap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLoad } from '@/lib/useLoad';
import { Button, Card, ErrorText, Row, Screen, Section, T } from '@/ui/components';
import { brand, fonts, space, usePalette, useScheme } from '@/ui/theme';
import { WeatherLine } from '@/ui/Weather';
import { WeatherArt } from '@/ui/WeatherArt';

export default function Home() {
  const { userId } = useAuth();
  const c = usePalette();
  const dark = useScheme() === 'dark';
  const [showPast, setShowPast] = useState(false);
  const {
    data: home,
    error,
    loading,
    reload,
  } = useLoad(async () => {
    const [leagues, upcoming, courses] = await Promise.all([listLeagues(), listUpcoming(userId!), listCourses()]);
    // Keep my app handicap on my profile up to date, so non-friends see the right number.
    listCourses()
      .then((courses) => handicapsFor([userId!], courses))
      .then((h) => {
        const mine = h.get(userId!);
        if (mine) return syncMyHandicap(userId!, mine.index, mine.differentials.length);
      })
      .catch(() => {});
    return { leagues, upcoming, courses };
  }, [userId]);
  const leagues = home?.leagues;
  const upcoming = home?.upcoming.matches ?? [];

  const active = leagues?.filter((l) => !l.finished_at) ?? [];
  const past = leagues?.filter((l) => l.finished_at) ?? [];

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <View style={{ paddingTop: space.s }}>
        <T variant="display" style={{ fontSize: 56, lineHeight: 52, color: dark ? c.text : brand.pine }}>
          Welcome back, playa.
        </T>
      </View>
      <ErrorText error={error} />
      {upcoming.length ? (
        <>
          <Section title="Upcoming" />
          {upcoming.map((m) => {
            const when = m.starts_at ? new Date(m.starts_at) : new Date(`${m.played_on}T12:00:00`);
            const course = home!.courses.find((x) => x.id === m.course_id);
            const names = m.match_players
              .map((p) => displayName(home!.upcoming.profiles.find((x) => x.id === p.user_id)))
              .join(', ');
            return (
              <Card key={m.id} onPress={() => router.push(`/match/${m.id}`)} style={{ overflow: 'hidden' }}>
                <WeatherArt
                  city={course?.city ?? course?.club_name}
                  startsAt={m.starts_at ?? `${m.played_on}T10:00:00`}
                />
                <Row style={{ alignItems: 'flex-start', gap: space.m }}>
                  <View
                    style={{
                      width: 56,
                      alignItems: 'center',
                      backgroundColor: c.primary,
                      borderRadius: 10,
                      paddingVertical: 6,
                    }}>
                    <T variant="eyebrow" style={{ color: c.onPrimary }}>
                      {when.toLocaleDateString('en-GB', { month: 'short' })}
                    </T>
                    <T style={{ fontFamily: fonts.num, fontSize: 28, lineHeight: 30, color: c.onPrimary }}>
                      {when.getDate()}
                    </T>
                  </View>
                  <View style={{ flex: 1, gap: 2, paddingRight: 90 }}>
                    <T variant="eyebrow" style={{ color: c.accentText }}>
                      {when.toLocaleDateString('en-GB', { weekday: 'long' })}
                      {m.starts_at
                        ? ` · ${when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
                        : ''}
                    </T>
                    <T variant="h2">{course?.name ?? 'Match'}</T>
                    <T variant="label" muted numberOfLines={1}>
                      {[course?.city, names].filter(Boolean).join(' · ')}
                    </T>
                    <WeatherLine
                      city={course?.city ?? course?.club_name}
                      startsAt={m.starts_at ?? `${m.played_on}T10:00:00`}
                    />
                  </View>
                </Row>
              </Card>
            );
          })}
        </>
      ) : null}
      <Section title="Your leagues" />
      {active.length === 0 && leagues ? (
        <Card>
          <T variant="h2">{past.length ? 'No league on the go' : 'No leagues yet'}</T>
          <T muted>
            {past.length
              ? 'Start next season, or join with the code a buddy sent you.'
              : 'Start one for the crew, or join with the code a buddy sent you.'}
          </T>
        </Card>
      ) : null}
      {active.map((l) => (
        <Card key={l.id} onPress={() => router.push(`/league/${l.id}`)}>
          {l.season ? (
            <T variant="eyebrow" muted>
              Season {l.season}
            </T>
          ) : null}
          <T variant="h1">{l.name}</T>
          <T variant="label" muted>
            Standings, matches and players →
          </T>
        </Card>
      ))}
      {past.length ? (
        <>
          <Pressable
            onPress={() => setShowPast(!showPast)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: 48,
              borderTopWidth: 1,
              borderBottomWidth: showPast ? 0 : 1,
              borderColor: c.border,
            }}>
            <T variant="eyebrow" muted>
              Past leagues · {past.length}
            </T>
            <T style={{ fontFamily: fonts.bodyBold, color: c.muted }}>{showPast ? '▴' : '▾'}</T>
          </Pressable>
          {showPast
            ? past.map((l) => (
                <Card key={l.id} onPress={() => router.push(`/league/${l.id}`)}>
                  <T variant="eyebrow" muted>
                    {l.season ? `Season ${l.season} · ` : ''}Finished
                  </T>
                  <T variant="h2">{l.name}</T>
                  <T variant="label" muted>
                    Final standings and podium →
                  </T>
                </Card>
              ))
            : null}
        </>
      ) : null}
      <Row>
        <Button title="New league" onPress={() => router.push('/league/new')} style={{ flex: 1 }} />
        <Button
          title="Join with code"
          kind="secondary"
          onPress={() => router.push('/league/join')}
          style={{ flex: 1 }}
        />
      </Row>
    </Screen>
  );
}
