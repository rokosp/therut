import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  acceptFriend,
  displayName,
  friendState,
  getProfiles,
  listFriendships,
  removeFriend,
  searchPlayers,
  sendFriendRequest,
  type Profile,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useLoad } from '@/lib/useLoad';

import { Avatar, Button, ErrorText, Field, Row, Section, T } from './components';
import { fonts, space, usePalette } from './theme';

const hcpText = (p: Profile) => {
  const v = p.app_handicap ?? p.self_handicap;
  return v != null ? `HCP ${Number(v).toFixed(1)}` : 'No HCP yet';
};

/** Friends list, incoming requests and player search, on the Profile tab. */
export function Friends() {
  const { userId } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const action = useAction();

  const { data, error, reload } = useLoad(async () => {
    const all = await listFriendships();
    const others = all.map((f) => (f.requester === userId ? f.addressee : f.requester));
    return { all, profiles: await getProfiles(others) };
  }, [userId]);

  useEffect(() => {
    const t = setTimeout(() => {
      searchPlayers(query)
        .then((r) => setResults(r.filter((p) => p.id !== userId)))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [query, userId]);

  const all = data?.all ?? [];
  const stateOf = (id: string) => friendState(userId!, id, all);
  const profileOf = (id: string) => data?.profiles.find((p) => p.id === id);
  const friends = all.filter((f) => f.status === 'accepted').map((f) => (f.requester === userId ? f.addressee : f.requester));
  const incoming = all.filter((f) => f.status === 'pending' && f.addressee === userId).map((f) => f.requester);

  const act = (fn: () => Promise<void>) => action.run(async () => (await fn(), await reload()));

  return (
    <View style={{ gap: space.s }}>
      <Section title={`Friends · ${friends.length}`} />
      <ErrorText error={error ?? action.error} />

      {incoming.map((id) => {
        const p = profileOf(id);
        return (
          <PlayerRow key={id} profile={p} onPress={() => router.push(`/player/${id}`)} note="Wants to be friends">
            <Button title="Accept" compact onPress={() => act(() => acceptFriend(userId!, id))} />
            <Button title="✕" kind="secondary" compact onPress={() => act(() => removeFriend(userId!, id))} />
          </PlayerRow>
        );
      })}

      {friends.length === 0 && incoming.length === 0 ? (
        <T variant="label" muted>
          Add friends to see their full profile, rounds and live matches. Everyone else only shows their name and HCP.
        </T>
      ) : null}
      {friends.map((id) => (
        <PlayerRow key={id} profile={profileOf(id)} onPress={() => router.push(`/player/${id}`)} />
      ))}

      <Field
        label="Find players"
        value={query}
        onChangeText={setQuery}
        placeholder="Search by name"
        autoCapitalize="none"
      />
      {results.map((p) => {
        const st = stateOf(p.id);
        return (
          <PlayerRow key={p.id} profile={p} onPress={() => router.push(`/player/${p.id}`)}>
            {st === 'none' ? (
              <Button title="Add friend" compact onPress={() => act(() => sendFriendRequest(userId!, p.id))} />
            ) : (
              <T variant="eyebrow" muted>
                {{ friends: 'Friends', sent: 'Requested', received: 'Wants to add you' }[st]}
              </T>
            )}
          </PlayerRow>
        );
      })}
    </View>
  );
}

function PlayerRow({
  profile,
  onPress,
  note,
  children,
}: {
  profile: Profile | undefined;
  onPress: () => void;
  note?: string;
  children?: React.ReactNode;
}) {
  const c = usePalette();
  if (!profile) return null;
  return (
    <Row style={{ minHeight: 52, borderBottomWidth: 1, borderColor: c.border, paddingVertical: space.xs }}>
      <Pressable onPress={onPress} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.m }}>
        <Avatar name={displayName(profile)} size={36} url={profile.avatar_url} />
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: fonts.bodyBold }}>{displayName(profile)}</T>
          <T variant="label" muted>
            {note ?? hcpText(profile)}
          </T>
        </View>
      </Pressable>
      {children}
    </Row>
  );
}
