import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import {
  acceptFriend,
  displayName,
  friendState,
  getProfile,
  handicapsFor,
  listCourses,
  listFriendships,
  playerMatches,
  playerStats,
  removeFriend,
  sendFriendRequest,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useLoad } from '@/lib/useLoad';
import { Avatar, Button, Card, ErrorText, Row, Screen, Section, T } from '@/ui/components';
import { confirmAction } from '@/ui/confirm';
import { MatchCard, PastMatchCard } from '@/ui/MatchCard';
import { HcpCards, StatsRow } from '@/ui/PlayerBits';
import { space } from '@/ui/theme';

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const action = useAction();

  const { data, error, loading, reload } = useLoad(async () => {
    const [profile, friendships] = await Promise.all([getProfile(id), listFriendships()]);
    const state = id === userId ? 'friends' : friendState(userId!, id, friendships);
    if (state !== 'friends') return { profile, state, full: null };
    // Friends (and you) get the full picture.
    const [courses, stats, history] = await Promise.all([listCourses(), playerStats(id), playerMatches(id)]);
    const hcp = (await handicapsFor([id], courses)).get(id)!;
    return { profile, state, full: { courses, stats, history, hcp } };
  }, [id, userId]);

  if (!data) {
    return (
      <Screen refreshing={loading} onRefresh={reload}>
        <ErrorText error={error} />
      </Screen>
    );
  }

  const { profile, state, full } = data;
  const name = displayName(profile);
  const act = (fn: () => Promise<void>) => action.run(async () => (await fn(), await reload()));
  const rounds = full?.hcp.differentials.length ?? 0;

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <Stack.Screen options={{ title: 'Player' }} />
      <Row style={{ gap: space.m }}>
        <Avatar name={name} size={56} />
        <View style={{ flex: 1 }}>
          <T variant="h1" style={{ fontSize: 32, lineHeight: 32 }}>
            {name}
          </T>
          {profile.nickname && profile.nickname !== profile.display_name ? (
            <T variant="label" muted>
              {profile.display_name}
            </T>
          ) : null}
        </View>
      </Row>

      <HcpCards
        app={full ? full.hcp.index : profile.app_handicap}
        appNote={full ? (full.hcp.index != null ? `From last ${Math.min(rounds, 20)} cards` : 'Needs 3 cards') : 'From their cards'}
        own={profile.self_handicap}
      />

      <ErrorText error={action.error} />
      {id !== userId ? (
        state === 'none' ? (
          <Button title="Add friend" onPress={() => act(() => sendFriendRequest(userId!, id))} busy={action.busy} />
        ) : state === 'sent' ? (
          <Button title="Friend request sent · cancel" kind="secondary" onPress={() => act(() => removeFriend(userId!, id))} />
        ) : state === 'received' ? (
          <Button title={`Accept ${name}'s request`} onPress={() => act(() => acceptFriend(userId!, id))} busy={action.busy} />
        ) : null
      ) : null}

      {full ? (
        <>
          <StatsRow
            items={[
          { v: full.stats.rounds, l: 'Matches\nplayed' },
          { v: full.stats.wins, l: 'Matches\nwon' },
          { v: full.stats.leagues, l: 'Leagues\nplayed' },
          { v: full.stats.leagueWins, l: 'Leagues\nwon' },
        ]}
          />
          <Section title="Match history" />
          {full.history.matches.length === 0 ? <T muted>No matches yet.</T> : null}
          {full.history.matches.map((m) =>
            m.status === 'final' ? (
              <PastMatchCard key={m.id} match={m} courses={full.courses} userId={id} />
            ) : (
              <MatchCard key={m.id} match={m} profiles={full.history.profiles} courses={full.courses} />
            ),
          )}
          {id !== userId ? (
            <Button
              title="Remove friend"
              kind="danger"
              onPress={() =>
                confirmAction(`Remove ${name}?`, 'You will only see their name and HCP.', 'Remove', () =>
                  act(() => removeFriend(userId!, id)).then(() => router.canGoBack() && router.back()),
                )
              }
            />
          ) : null}
        </>
      ) : (
        <Card>
          <T variant="h2">Friends only</T>
          <T muted>
            {state === 'sent'
              ? `Once ${name} accepts, you'll see their rounds, stats and match history.`
              : `Add ${name} as a friend to see their rounds, stats and match history.`}
          </T>
        </Card>
      )}
    </Screen>
  );
}
