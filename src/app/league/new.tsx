import { router } from 'expo-router';
import { useState } from 'react';

import { createLeague } from '@/lib/api';
import { useAction } from '@/lib/useLoad';
import type { MatchFormat } from '@/lib/types';
import { Button, ErrorText, Field, Screen, Segmented, T } from '@/ui/components';

export default function NewLeague() {
  const [name, setName] = useState('');
  const [season, setSeason] = useState(String(new Date().getFullYear()));
  const [format, setFormat] = useState<MatchFormat>('stroke');
  const { busy, error, run } = useAction();

  const create = () =>
    run(async () => {
      if (!name.trim()) throw new Error('Give the league a name.');
      const league = await createLeague(name.trim(), season.trim() || null, { defaultFormat: format });
      router.replace(`/league/${league.id}`);
    });

  return (
    <Screen>
      <T muted>You'll be the league admin. You can change points and rules any time in the league settings.</T>
      <Field label="League name" value={name} onChangeText={setName} placeholder="e.g. Sunday Rut" />
      <Field label="Season" value={season} onChangeText={setSeason} />
      <T variant="eyebrow" muted>
        Match format
      </T>
      <Segmented
        options={[
          { value: 'stroke', label: 'Stroke play' },
          { value: 'stableford', label: 'Stableford' },
        ]}
        value={format}
        onChange={setFormat}
      />
      <T variant="label" muted>
        The usual format for this league. Each match can still pick its own.
      </T>
      <ErrorText error={error} />
      <Button title="Create league" onPress={create} busy={busy} />
    </Screen>
  );
}
