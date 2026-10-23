import { router } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable, View } from 'react-native';

import { anyLiveMatch, getProfile, listFriendships, listNotifications } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLoad } from '@/lib/useLoad';
import { BackButton } from '@/ui/BackButton';
import { LiveDot } from '@/ui/LiveDot';
import { Avatar, HeaderTitle, Row, T } from '@/ui/components';
import { brand, fonts, space, usePalette } from '@/ui/theme';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const c = usePalette();
  const { session, userId } = useAuth();
  // My photo for the header, and how many friend requests are waiting (shown on the Profile tab).
  const { data: me } = useLoad(
    async () => {
      const [profile, friendships, notes, live] = await Promise.all([
        getProfile(userId!),
        listFriendships(),
        listNotifications(),
        anyLiveMatch(),
      ]);
      const requests = friendships.filter((f) => f.status === 'pending' && f.addressee === userId).length;
      return { avatar: profile.avatar_url ?? null, requests, unread: notes.filter((n) => !n.read_at).length, live };
    },
    [userId],
    { pollMs: 30000 },
  );
  const requests = me?.requests ?? 0;
  const name = (session?.user.user_metadata?.display_name as string | undefined) ?? session?.user.email ?? '?';
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.text,
        headerShadowVisible: false,
        headerTitleAlign: 'left',
        headerTitle: ({ children }) => <HeaderTitle title={children} />,
        sceneStyle: { backgroundColor: c.bg },
        // Android draws under the system navigation bar, so add its height below the tabs.
        tabBarStyle: {
          backgroundColor: c.bg,
          borderTopColor: c.border,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
        },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        tabBarIconStyle: { display: 'none' },
        tabBarIcon: () => null,
        tabBarLabelStyle: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.7, textTransform: 'uppercase' },
        tabBarItemStyle: { justifyContent: 'center' },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'The Rut',
          tabBarLabel: 'Leagues',
          headerRight: () => (
            <Row style={{ marginRight: 16, gap: space.m }}>
              <Pressable onPress={() => router.push('/notifications')} hitSlop={12} accessibilityLabel="Notifications">
                <T variant="eyebrow" style={{ color: c.accentText, fontSize: 11 }}>
                  Inbox
                </T>
                {me?.unread ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -8,
                      minWidth: 16,
                      height: 16,
                      borderRadius: 8,
                      paddingHorizontal: 3,
                      backgroundColor: c.danger,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <T style={{ color: '#fff', fontSize: 10, lineHeight: 12, fontFamily: fonts.bodyBold }}>
                      {me.unread}
                    </T>
                  </View>
                ) : null}
              </Pressable>
              <Pressable onPress={() => router.navigate('/profile')} hitSlop={12}>
                <Avatar name={name} url={me?.avatar} />
              </Pressable>
            </Row>
          ),
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: 'Matches',
          tabBarLabel: ({ color }) => (
            <Row style={{ gap: 6, alignItems: 'center' }}>
              <T
                style={{ fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.7, textTransform: 'uppercase', color }}>
                Matches
              </T>
              {me?.live ? <LiveDot /> : null}
            </Row>
          ),
          headerLeft: () => <BackButton home />,
          headerRight: () => (
            <Pressable onPress={() => router.push('/calendar')} hitSlop={12} style={{ marginRight: 16 }}>
              <T variant="eyebrow" style={{ color: c.accentText, fontSize: 11 }}>
                Calendar
              </T>
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: requests ? `Profile · ${requests}` : 'Profile',
          headerLeft: () => <BackButton home />,
        }}
      />
    </Tabs>
  );
}
