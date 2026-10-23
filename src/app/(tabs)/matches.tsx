import { listCourses, listLiveMatches, playerMatches } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLoad } from '@/lib/useLoad';
import { Card, ErrorText, Screen, Section, T } from '@/ui/components';
import { MatchCard } from '@/ui/MatchCard';

export default function MatchesScreen() {
  const { userId } = useAuth();
  const { data, error, loading, reload } = useLoad(
    async () => {
      const [live, mine, courses] = await Promise.all([listLiveMatches(), playerMatches(userId!), listCourses()]);
      return { live, mine, courses, profiles: [...live.profiles, ...mine.profiles] };
    },
    [userId],
    { pollMs: 10000 },
  );

  const recent = data?.mine.matches.filter((m) => m.status === 'final') ?? [];

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <ErrorText error={error} />
      <Section title="Live now" right={<T variant="eyebrow" muted>Leagues + friends</T>} />
      {data?.live.matches.length === 0 ? (
        <Card>
          <T variant="h2">Nobody's out right now</T>
          <T muted>Matches your friends and league mates are playing show up here, live.</T>
        </Card>
      ) : null}
      {data?.live.matches.map((m) => (
        <MatchCard key={m.id} match={m} profiles={data.profiles} courses={data.courses} />
      ))}

      <Section title="Your recent matches" />
      {data && recent.length === 0 ? <T muted>Finished matches you played in will show up here.</T> : null}
      {recent.map((m) => (
        <MatchCard key={m.id} match={m} profiles={data!.profiles} courses={data!.courses} />
      ))}
    </Screen>
  );
}
