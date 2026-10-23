import { router } from 'expo-router';
import { useColorScheme, View } from 'react-native';

import { handicapsFor, listCourses, listLeagues, syncMyHandicap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLoad } from '@/lib/useLoad';
import { Button, Card, ErrorText, Row, Screen, Section, T } from '@/ui/components';
import { brand, space, usePalette } from '@/ui/theme';

export default function Home() {
  const { userId } = useAuth();
  const c = usePalette();
  const dark = useColorScheme() === 'dark';
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

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <View style={{ paddingTop: space.s }}>
        <T variant="display" style={{ fontSize: 56, lineHeight: 52, color: dark ? c.text : brand.pine }}>
          Welcome back, playa.
        </T>
      </View>
      <ErrorText error={error} />
      <Section title="Your leagues" />
      {leagues?.length === 0 ? (
        <Card>
          <T variant="h2">No leagues yet</T>
          <T muted>Start one for the crew, or join with the code a buddy sent you.</T>
        </Card>
      ) : null}
      {leagues?.map((l) => (
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
      <Row>
        <Button title="New league" onPress={() => router.push('/league/new')} style={{ flex: 1 }} />
        <Button title="Join with code" kind="secondary" onPress={() => router.push('/league/join')} style={{ flex: 1 }} />
      </Row>
    </Screen>
  );
}
