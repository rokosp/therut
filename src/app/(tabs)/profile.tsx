import { useState } from 'react';
import { View } from 'react-native';

import { displayName, getProfile, handicapsFor, listCourses, playerStats, updateProfile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useAction, useLoad } from '@/lib/useLoad';
import { Avatar, Button, Card, ErrorText, Field, Row, Screen, Section, T } from '@/ui/components';
import { fonts, radius, space, usePalette } from '@/ui/theme';

export default function ProfileScreen() {
  const { userId } = useAuth();
  const c = usePalette();
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [selfHcp, setSelfHcp] = useState('');
  const [editing, setEditing] = useState(false);
  const save = useAction();

  const { data, error, loading, reload } = useLoad(async () => {
    const [profile, courses, stats] = await Promise.all([getProfile(userId!), listCourses(), playerStats(userId!)]);
    const hcp = (await handicapsFor([userId!], courses)).get(userId!)!;
    setName(profile.display_name);
    setNickname(profile.nickname ?? '');
    setSelfHcp(profile.self_handicap != null ? String(profile.self_handicap) : '');
    return { profile, hcp, stats };
  }, [userId]);

  const onSave = () =>
    save.run(async () => {
      const trimmed = selfHcp.trim().replace(',', '.');
      const value = trimmed === '' ? null : Number(trimmed.replace(/^\+/, '-'));
      if (value != null && (Number.isNaN(value) || value < -10 || value > 54)) {
        throw new Error('Handicap should be a number between +10 and 54.');
      }
      await updateProfile(userId!, { display_name: name.trim(), nickname: nickname.trim() || null, self_handicap: value });
      setEditing(false);
      reload();
    });

  const hcp = data?.hcp;
  const rounds = hcp?.differentials.length ?? 0;
  const own = data?.profile.self_handicap;
  const since = data
    ? new Date(data.profile.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    : '';

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <ErrorText error={error} />
      {data ? (
        <Row style={{ gap: space.m }}>
          <Avatar name={displayName(data.profile)} size={56} />
          <View style={{ flex: 1 }}>
            <T variant="h1" style={{ fontSize: 32, lineHeight: 32 }}>
              {displayName(data.profile)}
            </T>
            <T variant="label" muted>
              Member since {since}
            </T>
          </View>
        </Row>
      ) : null}

      <Row style={{ alignItems: 'stretch', gap: space.s }}>
        <View style={{ flex: 1, backgroundColor: c.primary, borderRadius: 12, padding: space.m, gap: 2 }}>
          <T variant="eyebrow" style={{ color: c.onPrimary }}>
            App HCP
          </T>
          <T variant="score" style={{ color: c.onPrimary, fontSize: 44 }}>
            {hcp?.index != null ? hcp.index.toFixed(1) : '–'}
          </T>
          <T variant="label" style={{ color: c.onPrimary }}>
            {hcp?.index != null
              ? `From last ${Math.min(rounds, 20)} card${rounds === 1 ? '' : 's'}`
              : `Needs 3 cards (${rounds} so far)`}
          </T>
        </View>
        <View
          style={{
            flex: 1,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: c.head,
            borderRadius: 12,
            padding: space.m,
            gap: 2,
          }}>
          <T variant="eyebrow">Own HCP</T>
          <T variant="score" style={{ fontSize: 44 }}>
            {own != null ? Number(own).toFixed(1) : '–'}
          </T>
          <T variant="label">{own != null ? 'Entered by you' : 'Not set'}</T>
        </View>
      </Row>
      {hcp?.pendingNine ? (
        <T variant="label" muted>
          One 9-hole card is waiting for a second 9 to pair with.
        </T>
      ) : null}

      <Row style={{ gap: space.s }}>
        {[
          { v: data?.stats.rounds ?? '–', l: 'Rounds' },
          { v: data?.stats.avg18 ?? '–', l: 'Avg (18)' },
          { v: data?.stats.wins ?? '–', l: 'Wins' },
        ].map((s) => (
          <View key={s.l} style={{ flex: 1, alignItems: 'center', borderTopWidth: 2, borderColor: c.accent, paddingTop: space.s }}>
            <T style={{ fontFamily: fonts.num, fontSize: 28 }}>{s.v}</T>
            <T variant="label" muted>
              {s.l}
            </T>
          </View>
        ))}
      </Row>

      {editing ? (
        <Card>
          <Field label="Name" value={name} onChangeText={setName} />
          <Field label="Nickname (shown in tables)" value={nickname} onChangeText={setNickname} />
          <Field
            label="Your own handicap"
            value={selfHcp}
            onChangeText={setSelfHcp}
            keyboardType="numbers-and-punctuation"
            placeholder="e.g. 18.4"
            hint="Leave empty to use only the app handicap. Use + for plus handicaps."
          />
          <ErrorText error={save.error} />
          <Row>
            <Button title="Save" onPress={onSave} busy={save.busy} style={{ flex: 1 }} />
            <Button title="Cancel" kind="secondary" onPress={() => setEditing(false)} style={{ flex: 1 }} />
          </Row>
        </Card>
      ) : (
        <Button title="Edit profile and own HCP" kind="secondary" onPress={() => setEditing(true)} />
      )}

      {rounds > 0 ? (
        <>
          <Section title="Cards counted" right={<T variant="eyebrow" muted>★ = in your HCP</T>} />
          <View style={{ borderRadius: radius.card, overflow: 'hidden' }}>
            {[...hcp!.differentials].reverse().slice(0, 20).map((d) => (
              <Row
                key={d.roundIds.join('+')}
                style={{ justifyContent: 'space-between', paddingVertical: space.s, borderBottomWidth: 1, borderColor: c.border }}>
                <T>
                  {d.playedOn}
                  {d.roundIds.length > 1 ? ' · two 9s' : ''}
                </T>
                <T style={{ fontFamily: fonts.num, fontSize: 20, color: hcp!.counting.includes(d) ? c.accentText : c.text }}>
                  {hcp!.counting.includes(d) ? '★ ' : ''}
                  {d.differential.toFixed(1)}
                </T>
              </Row>
            ))}
          </View>
        </>
      ) : null}

      <Button title="Sign out" kind="danger" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
