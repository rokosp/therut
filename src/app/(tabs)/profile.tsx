import { useState } from 'react';
import { View } from 'react-native';

import { displayName, getProfile, handicapsFor, listCourses, playerStats, updateProfile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useAction, useLoad } from '@/lib/useLoad';
import { Avatar, Button, Card, ErrorText, Field, Row, Screen, Section, T } from '@/ui/components';
import { Friends } from '@/ui/Friends';
import { HcpCards, StatsRow } from '@/ui/PlayerBits';
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

      <HcpCards
        app={hcp?.index}
        appNote={
          hcp?.index != null ? `From last ${Math.min(rounds, 20)} card${rounds === 1 ? '' : 's'}` : `Needs 3 cards (${rounds} so far)`
        }
        own={own}
      />
      {hcp?.pendingNine ? (
        <T variant="label" muted>
          One 9-hole card is waiting for a second 9 to pair with.
        </T>
      ) : null}

      <StatsRow
        items={[
          { v: data?.stats.rounds ?? '–', l: 'Matches\nplayed' },
          { v: data?.stats.wins ?? '–', l: 'Matches\nwon' },
          { v: data?.stats.leagues ?? '–', l: 'Leagues\nplayed' },
          { v: data?.stats.leagueWins ?? '–', l: 'Leagues\nwon' },
        ]}
      />

      <Friends />

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
