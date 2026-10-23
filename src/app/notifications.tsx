import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';

import { listNotifications, markNotificationsRead } from '@/lib/api';
import { useLoad } from '@/lib/useLoad';
import { ErrorText, Row, Screen, T } from '@/ui/components';
import { fonts, space, usePalette } from '@/ui/theme';

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Match invites and friends teeing off. Opening this marks them all read. */
export default function NotificationsScreen() {
  const c = usePalette();
  const { data, error, loading, reload } = useLoad(() => listNotifications(), []);

  useEffect(() => {
    if (data?.some((n) => !n.read_at)) markNotificationsRead().catch(() => {});
  }, [data]);

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <ErrorText error={error} />
      {data && data.length === 0 ? (
        <T muted>Nothing yet. Match invites and friends teeing off show up here.</T>
      ) : null}
      <View>
        {data?.map((n) => (
          <Pressable
            key={n.id}
            onPress={() => n.match_id && router.push(`/match/${n.match_id}`)}
            style={{ paddingVertical: space.m, borderBottomWidth: 1, borderColor: c.border }}>
            <Row style={{ alignItems: 'flex-start' }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  marginTop: 7,
                  backgroundColor: n.read_at ? 'transparent' : c.accent,
                }}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <T style={{ fontFamily: fonts.bodyBold }}>
                  {n.kind === 'live' ? '● ' : ''}
                  {n.title}
                </T>
                {n.body ? <T muted>{n.body}</T> : null}
                <T variant="label" muted>
                  {ago(n.created_at)}
                </T>
              </View>
            </Row>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
