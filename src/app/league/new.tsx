import { router } from 'expo-router';
import { useState } from 'react';

import { createLeague } from '@/lib/api';
import { useAction } from '@/lib/useLoad';
import { Button, ErrorText, Field, Screen, T } from '@/ui/components';

export default function NewLeague() {
  const [name, setName] = useState('');
  const [season, setSeason] = useState(String(new Date().getFullYear()));
  const { busy, error, run } = useAction();

  const create = () =>
    run(async () => {
      if (!name.trim()) throw new Error('Give the league a name.');
      const league = await createLeague(name.trim(), season.trim() || null);
      router.replace(`/league/${league.id}`);
    });

  return (
    <Screen>
      <T muted>You'll be the league admin. You can change points and rules any time in the league settings.</T>
      <Field label="League name" value={name} onChangeText={setName} placeholder="e.g. Sunday Rut" />
      <Field label="Season" value={season} onChangeText={setSeason} />
      <ErrorText error={error} />
      <Button title="Create league" onPress={create} busy={busy} />
    </Screen>
  );
}
