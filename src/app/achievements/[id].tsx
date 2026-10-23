import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { ACH_GROUPS, MAX_SHOWCASE } from '@/lib/achievements';
import { displayName, getProfile, playerStats, updateProfile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useLoad } from '@/lib/useLoad';
import { Badge } from '@/ui/Badges';
import { Button, Card, ErrorText, Row, Screen, Section, T } from '@/ui/components';
import { space, usePalette } from '@/ui/theme';

/** Every achievement, earned and locked. On your own page you pick which ones show on your profile. */
export default function AchievementsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const mine = id === userId;
  const [selected, setSelected] = useState<string | null>(null);
  const [showcase, setShowcase] = useState<string[] | null>(null);
  const save = useAction();
  const c = usePalette();

  const { data, error, loading, reload } = useLoad(async () => {
    const [profile, stats] = await Promise.all([getProfile(id), playerStats(id)]);
    return { profile, list: stats.achievements };
  }, [id]);

  if (!data) {
    return (
      <Screen refreshing={loading} onRefresh={reload}>
        <ErrorText error={error} />
      </Screen>
    );
  }

  const { profile, list } = data;
  const picked = (showcase ?? profile.showcase ?? []).filter((x) => list.some((a) => a.id === x && a.earned));
  const earned = list.filter((a) => a.earned).length;
  const sel = list.find((a) => a.id === selected) ?? null;
  const isPicked = sel ? picked.includes(sel.id) : false;

  const toggle = () =>
    save.run(async () => {
      if (!sel) return;
      const next = isPicked ? picked.filter((x) => x !== sel.id) : [...picked, sel.id];
      if (next.length > MAX_SHOWCASE) throw new Error(`You can show ${MAX_SHOWCASE} at most. Remove one first.`);
      try {
        await updateProfile(id, { showcase: next });
      } catch (e) {
        if (String(e).includes('showcase')) throw new Error('Run the achievements database update in Supabase first.');
        throw e;
      }
      setShowcase(next);
    });

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <T variant="display" style={{ fontSize: 40, lineHeight: 40 }}>
        {mine ? 'Achievements' : displayName(profile)}
      </T>
      <T muted>
        {earned} of {list.length} earned.
        {mine
          ? ` Tap a badge to see it. Pick up to ${MAX_SHOWCASE} to show on your profile (${picked.length}/${MAX_SHOWCASE}).`
          : ''}
      </T>

      <Modal visible={!!sel} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <Pressable
          onPress={() => setSelected(null)}
          style={{ flex: 1, justifyContent: 'center', padding: space.xl, backgroundColor: 'rgba(11,42,31,0.6)' }}>
          {sel ? (
            <Pressable onPress={() => {}} style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: c.bg }}>
              <Card>
                <Row style={{ alignItems: 'center', gap: space.m }}>
                  <Badge a={sel} size={56} showName={false} picked={isPicked} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <T variant="title">{sel.name}</T>
                    <T muted>{sel.desc}</T>
                    <T variant="label" muted>
                      {sel.earned
                        ? 'Earned'
                        : sel.target > 1
                          ? `${sel.value.toLocaleString('en-GB')} of ${sel.target.toLocaleString('en-GB')} so far`
                          : 'Not yet'}
                    </T>
                  </View>
                </Row>
                {mine && sel.earned ? (
                  <Button
                    title={isPicked ? 'Remove from profile' : 'Show on my profile'}
                    kind={isPicked ? 'secondary' : 'accent'}
                    onPress={toggle}
                    busy={save.busy}
                  />
                ) : null}
                <ErrorText error={save.error} />
                <Button title="Close" kind="secondary" onPress={() => setSelected(null)} />
              </Card>
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>

      {ACH_GROUPS.map((g) => (
        <View key={g} style={{ gap: space.s }}>
          <Section title={g} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s, justifyContent: 'flex-start' }}>
            {list
              .filter((a) => a.group === g)
              .map((a) => (
                <Badge
                  key={a.id}
                  a={a}
                  picked={picked.includes(a.id)}
                  onPress={() => setSelected(selected === a.id ? null : a.id)}
                />
              ))}
          </View>
        </View>
      ))}
    </Screen>
  );
}
