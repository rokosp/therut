import { router } from 'expo-router';

import { listLeagues } from '@/lib/api';
import { useLoad } from '@/lib/useLoad';
import { Button, Card, ErrorText, Row, Screen, Section, T } from '@/ui/components';

export default function Home() {
  const { data: leagues, error, loading, reload } = useLoad(listLeagues, []);

  return (
    <Screen refreshing={loading} onRefresh={reload}>
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
