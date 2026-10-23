import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, useColorScheme, View } from 'react-native';

import { handicapsFor, listCourses, listLeagues, syncMyHandicap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLoad } from '@/lib/useLoad';
import { Button, Card, ErrorText, Row, Screen, Section, T } from '@/ui/components';
import { brand, fonts, space, usePalette } from '@/ui/theme';

export default function Home() {
  const { userId } = useAuth();
  const c = usePalette();
  const dark = useColorScheme() === 'dark';
  const [showPast, setShowPast] = useState(false);
  const { data: leagues, error, loading, reload } = useLoad(async () => {
    const leagues = await listLeagues();
    // Keep my app handicap on my profile up to date, so non-friends see the right number.
    listCourses()
      .then((courses) => handicapsFor([userId!], courses))
      .then((h) => {
        const mine = h.get(userId!);
        if (mine) return syncMyHandicap(userId!, mine.index, mine.differentials.length);
      })
      .catch(() => {});
    return leagues;
  }, [userId]);

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
      <Section title="Your leagues" />
      {active.length === 0 && leagues ? (
        <Card>
          <T variant="h2">{past.length ? 'No league on the go' : 'No leagues yet'}</T>
          <T muted>
            {past.length ? 'Start next season, or join with the code a buddy sent you.' : 'Start one for the crew, or join with the code a buddy sent you.'}
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
        <Button title="Join with code" kind="secondary" onPress={() => router.push('/league/join')} style={{ flex: 1 }} />
      </Row>
    </Screen>
  );
}
