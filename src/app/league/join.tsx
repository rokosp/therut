import { router } from 'expo-router';
import { useState } from 'react';

import { joinLeague } from '@/lib/api';
import { useAction } from '@/lib/useLoad';
import { Button, ErrorText, Field, Screen, T } from '@/ui/components';

export default function JoinLeague() {
  const [code, setCode] = useState('');
  const { busy, error, run } = useAction();

  const join = () =>
    run(async () => {
      const id = await joinLeague(code);
      router.replace(`/league/${id}`);
    });

  return (
    <Screen>
      <T muted>Ask the league admin for the 6-character code. It's on the league page.</T>
      <Field label="League code" value={code} onChangeText={setCode} autoCapitalize="characters" maxLength={6} />
      <ErrorText error={error} />
      <Button title="Join" onPress={join} busy={busy} disabled={code.trim().length < 6} />
    </Screen>
  );
}
