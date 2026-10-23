import { useState } from 'react';

import { displayName, getProfile, handicapsFor, listCourses, updateProfile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useAction, useLoad } from '@/lib/useLoad';
import { Button, Card, ErrorText, Field, Row, Screen, T } from '@/ui/components';
import { space } from '@/ui/theme';

export default function ProfileScreen() {
  const { userId } = useAuth();
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [selfHcp, setSelfHcp] = useState('');
  const save = useAction();
  const [saved, setSaved] = useState(false);

  const { data, error, loading, reload } = useLoad(async () => {
    const [profile, courses] = await Promise.all([getProfile(userId!), listCourses()]);
    const hcp = (await handicapsFor([userId!], courses)).get(userId!)!;
    setName(profile.display_name);
    setNickname(profile.nickname ?? '');
    setSelfHcp(profile.self_handicap != null ? String(profile.self_handicap) : '');
    return { profile, hcp };
  }, [userId]);

  const onSave = () =>
    save.run(async () => {
      const trimmed = selfHcp.trim().replace(',', '.');
      const value = trimmed === '' ? null : Number(trimmed.replace(/^\+/, '-'));
      if (value != null && (Number.isNaN(value) || value < -10 || value > 54)) {
        throw new Error('Handicap should be a number between +10 and 54.');
      }
      await updateProfile(userId!, { display_name: name.trim(), nickname: nickname.trim() || null, self_handicap: value });
      setSaved(true);
      reload();
    });

  const hcp = data?.hcp;
  const rounds = hcp?.differentials.length ?? 0;

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <T variant="h1">{data ? displayName(data.profile) : ' '}</T>
      <ErrorText error={error} />

      <Row style={{ alignItems: 'stretch' }}>
        <Card style={{ flex: 1 }}>
          <T variant="label" muted>
            APP HANDICAP
          </T>
          <T variant="score">{hcp?.index != null ? hcp.index.toFixed(1) : '–'}</T>
          <T variant="label" muted>
            {hcp?.index != null
              ? `From ${rounds} round${rounds === 1 ? '' : 's'}`
              : `Needs 3 rounds (${rounds} so far)`}
          </T>
        </Card>
        <Card style={{ flex: 1 }}>
          <T variant="label" muted>
            YOUR OWN
          </T>
          <T variant="score">{data?.profile.self_handicap != null ? Number(data.profile.self_handicap).toFixed(1) : '–'}</T>
          <T variant="label" muted>
            Optional, set below
          </T>
        </Card>
      </Row>
      {hcp?.pendingNine ? <T muted>One 9-hole round is waiting for a second 9 to pair with.</T> : null}

      <Card>
        <T variant="title">Profile</T>
        <Field label="Name" value={name} onChangeText={(v) => (setName(v), setSaved(false))} />
        <Field label="Nickname (shown in tables)" value={nickname} onChangeText={(v) => (setNickname(v), setSaved(false))} />
        <Field
          label="Your own handicap"
          value={selfHcp}
          onChangeText={(v) => (setSelfHcp(v), setSaved(false))}
          keyboardType="numbers-and-punctuation"
          placeholder="e.g. 18.4"
          hint="Leave empty to use only the app handicap. Use + for plus handicaps."
        />
        <ErrorText error={save.error} />
        <Button title={saved ? 'Saved' : 'Save'} onPress={onSave} busy={save.busy} />
      </Card>

      {rounds > 0 ? (
        <Card>
          <T variant="title">Rounds counted</T>
          <T variant="label" muted>
            Latest 20. Starred ones make up your app handicap.
          </T>
          {[...hcp!.differentials].reverse().slice(0, 20).map((d) => (
            <Row key={d.roundIds.join('+')} style={{ justifyContent: 'space-between', paddingVertical: space.xs }}>
              <T>
                {d.playedOn}
                {d.roundIds.length > 1 ? ' (two 9s)' : ''}
              </T>
              <T variant="mono">
                {hcp!.counting.includes(d) ? '★ ' : ''}
                {d.differential.toFixed(1)}
              </T>
            </Row>
          ))}
        </Card>
      ) : null}

      <Button title="Sign out" kind="danger" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
