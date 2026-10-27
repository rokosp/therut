import { useLocalSearchParams } from 'expo-router';

import { getMatch } from '@/lib/api';
import { useLoad } from '@/lib/useLoad';
import { ErrorText, Screen, T } from '@/ui/components';
import { NewMatchForm } from '@/ui/NewMatchForm';

/** Change a scheduled match before it starts. */
export default function EditMatch() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error } = useLoad(() => getMatch(id), [id]);
  if (!data) {
    return (
      <Screen>
        <ErrorText error={error} />
      </Screen>
    );
  }
  if (data.status !== 'scheduled') {
    return (
      <Screen>
        <T muted>This match has already started, so it can&apos;t be changed here.</T>
      </Screen>
    );
  }
  return <NewMatchForm leagueId={data.league_id} edit={data} />;
}
