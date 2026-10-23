import { router } from 'expo-router';
import { View } from 'react-native';

import { listCourses, listLiveMatches, playerMatches } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLoad } from '@/lib/useLoad';
import { Button, ErrorText, Row, Screen, Section, T } from '@/ui/components';
import { MatchCard, PastMatchCard } from '@/ui/MatchCard';
import { radius, space, usePalette } from '@/ui/theme';

export default function MatchesScreen() {
  const { userId } = useAuth();
  const c = usePalette();
  const { data, error, loading, reload } = useLoad(
    async () => {
      const [live, mine, courses] = await Promise.all([listLiveMatches(), playerMatches(userId!, 30), listCourses()]);
      return { live, mine, courses, profiles: [...live.profiles, ...mine.profiles] };
    },
    [userId],
    { pollMs: 10000 },
  );

  const past = data?.mine.matches.filter((m) => m.status === 'final') ?? [];

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <ErrorText error={error} />
      <Section
        title="Live now"
        right={
          <T variant="eyebrow" muted>
            Leagues + friends
          </T>
        }
      />
      {data?.live.matches.length === 0 ? (
        <View
          style={{
            minHeight: 56,
            borderRadius: radius.input,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: c.border,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: space.l,
          }}>
          <T style={{ textAlign: 'center' }} muted>
            No one's hitting the links right now
          </T>
        </View>
      ) : null}
      {data?.live.matches.map((m) => (
        <MatchCard key={m.id} match={m} profiles={data.profiles} courses={data.courses} />
      ))}

      <Row>
        <Button title="Start a match" kind="accent" onPress={() => router.push('/match/new')} style={{ flex: 1 }} />
        <Button
          title="Join with code"
          kind="secondary"
          onPress={() => router.push('/match/join')}
          style={{ flex: 1 }}
        />
      </Row>
      <T variant="label" muted>
        Casual rounds outside a league. League matches start from the league page.
      </T>

      <Section title="Past matches" />
      {data && past.length === 0 ? <T muted>Finished matches you played in will show up here.</T> : null}
      {past.map((m) => (
        <PastMatchCard key={m.id} match={m} courses={data!.courses} profiles={data!.profiles} userId={userId!} />
      ))}
    </Screen>
  );
}
