import { useLocalSearchParams } from 'expo-router';

import { NewMatchForm } from '@/ui/NewMatchForm';

export default function NewLeagueMatch() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <NewMatchForm leagueId={id} />;
}
