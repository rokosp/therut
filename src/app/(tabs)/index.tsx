import { router } from 'expo-router';

import { listLeagues } from '@/lib/api';
import { useLoad } from '@/lib/useLoad';
import { Button, Card, ErrorText, Row, Screen, T } from '@/ui/components';

export default function Home() {
  const { data: leagues, error, loading, reload } = useLoad(listLeagues, []);

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <T variant="h1">Your leagues</T>
      <ErrorText error={error} />
      {leagues?.length === 0 ? (
        <Card>
          <T variant="title">No leagues yet</T>
          <T muted>Start one for the crew, or join with the code a buddy sent you.</T>
        </Card>
      ) : null}
      {leagues?.map((l) => (
        <Card key={l.id} onPress={() => router.push(`/league/${l.id}`)}>
          <T variant="h2">{l.name}</T>
          {l.season ? <T muted>{l.season}</T> : null}
        </Card>
      ))}
      <Row>
        <Button title="New league" onPress={() => router.push('/league/new')} style={{ flex: 1 }} />
        <Button title="Join with code" kind="secondary" onPress={() => router.push('/league/join')} style={{ flex: 1 }} />
      </Row>
    </Screen>
  );
}
