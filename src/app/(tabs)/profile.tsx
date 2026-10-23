import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { claimGuest, displayName, uploadAvatar, getProfile, handicapsFor, listCourses, playerStats, updateProfile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useAction, useLoad } from '@/lib/useLoad';
import { Avatar, Button, Card, ErrorText, Field, Row, Screen, Section, T } from '@/ui/components';
import { Friends } from '@/ui/Friends';
import { CareerHighlights, HcpCards, StatsRow } from '@/ui/PlayerBits';
import { fonts, radius, space, usePalette } from '@/ui/theme';

export default function ProfileScreen() {
  const { userId } = useAuth();
  const c = usePalette();
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [selfHcp, setSelfHcp] = useState('');
  const [editing, setEditing] = useState(false);
  const save = useAction();
  const claim = useAction();
  const photo = useAction();
  const pickPhoto = () =>
    photo.run(async () => {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });
      if (res.canceled || !res.assets[0]) return;
      const a = res.assets[0];
      await uploadAvatar(userId!, a.uri, a.mimeType ?? 'image/jpeg');
      reload();
    });
  const [claimCode, setClaimCode] = useState('');
  const [claimed, setClaimed] = useState(false);
  const [openPair, setOpenPair] = useState<string | null>(null);

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
      await updateProfile(userId!, {
        display_name: name.trim(),
        nickname: nickname.trim() || null,
        self_handicap: value,
      });
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
      <ErrorText error={error ?? photo.error} />
      {data ? (
        <Row style={{ gap: space.m }}>
          <Pressable onPress={pickPhoto} disabled={photo.busy} style={{ alignItems: 'center', gap: 2 }}>
            <Avatar name={displayName(data.profile)} size={64} url={data.profile.avatar_url} />
            <T variant="eyebrow" style={{ color: c.accentText, fontSize: 10 }}>
              {photo.busy ? 'Saving…' : data.profile.avatar_url ? 'Change' : 'Add photo'}
            </T>
          </Pressable>
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
          hcp?.index != null
            ? `From last ${Math.min(rounds, 20)} card${rounds === 1 ? '' : 's'}`
            : `Needs 3 cards (${rounds} so far)`
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
      {data?.stats ? <CareerHighlights career={data.stats.career} /> : null}

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
          <Section
            title="Rounds in your HCP"
            right={
              <T variant="eyebrow" muted>
                ★ = counting now
              </T>
            }
          />
          <T variant="label" muted style={{ marginTop: -space.s }}>
            Each number is how the round rated against the course. Your app HCP comes from the best 8 of your last 20.
            Tap one to open the match.
          </T>
          <View style={{ borderRadius: radius.card, overflow: 'hidden' }}>
            {[...hcp!.differentials]
              .reverse()
              .slice(0, 20)
              .map((d) => {
                const key = d.roundIds.join('+');
                const counting = hcp!.counting.includes(d);
                const pair = d.roundIds.length > 1;
                return (
                  <View key={key} style={{ borderBottomWidth: 1, borderColor: c.border }}>
                    <Pressable
                      onPress={() =>
                        pair ? setOpenPair(openPair === key ? null : key) : router.push(`/match/${d.roundIds[0]}`)
                      }
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        minHeight: 44,
                      }}>
                      <T>
                        {d.playedOn}
                        {pair ? ` · two 9s ${openPair === key ? '▴' : '▾'}` : ' ›'}
                      </T>
                      <T style={{ fontFamily: fonts.num, fontSize: 20, color: counting ? c.accentText : c.text }}>
                        {counting ? '★ ' : ''}
                        {d.differential.toFixed(1)}
                      </T>
                    </Pressable>
                    {pair && openPair === key
                      ? d.roundIds.map((rid, i) => (
                          <Pressable
                            key={rid}
                            onPress={() => router.push(`/match/${rid}`)}
                            style={{ minHeight: 40, justifyContent: 'center', paddingLeft: space.l }}>
                            <T style={{ color: c.accentText }}>{i === 0 ? 'First 9 ›' : 'Second 9 ›'}</T>
                          </Pressable>
                        ))
                      : null}
                  </View>
                );
              })}
          </View>
        </>
      ) : null}

      {data && (data.stats.rounds === 0 || claimed) ? (
        <Card>
          <T variant="h2">Claim your scores</T>
          <T variant="label" muted>
            Were you already on a scorecard before you signed up? Ask your league admin for your 6-character code.
          </T>
          <Row style={{ alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Field
                label="Claim code"
                value={claimCode}
                onChangeText={setClaimCode}
                autoCapitalize="characters"
                maxLength={6}
              />
            </View>
            <Button
              title="Claim"
              kind="secondary"
              busy={claim.busy}
              disabled={claimCode.trim().length < 6}
              onPress={() =>
                claim.run(async () => {
                  await claimGuest(claimCode);
                  setClaimCode('');
                  setClaimed(true);
                  reload();
                })
              }
            />
          </Row>
          <ErrorText error={claim.error} />
          {claimed ? (
            <T style={{ color: c.accentText }}>Done. Your old scores and leagues are now on your account.</T>
          ) : null}
        </Card>
      ) : null}

      <Button title="Sign out" kind="danger" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
