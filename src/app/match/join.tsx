import { router } from 'expo-router';
import { useState } from 'react';

import { joinMatch } from '@/lib/api';
import { useAction } from '@/lib/useLoad';
import { Button, ErrorText, Field, Screen, T } from '@/ui/components';

export default function JoinMatch() {
  const [code, setCode] = useState('');
  const { busy, error, run } = useAction();

  const join = () =>
    run(async () => {
      const id = await joinMatch(code);
      router.replace(`/match/${id}`);
    });

  return (
    <Screen>
      <T muted>Ask whoever started the match for its 6-character code. It's at the top of the match screen.</T>
      <Field label="Match code" value={code} onChangeText={setCode} autoCapitalize="characters" maxLength={6} />
      <ErrorText error={error} />
      <Button title="Join match" onPress={join} busy={busy} disabled={code.trim().length < 6} />
    </Screen>
  );
}
