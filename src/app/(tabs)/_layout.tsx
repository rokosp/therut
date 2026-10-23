import { router } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import { Pressable } from 'react-native';

import { getProfile, listFriendships } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLoad } from '@/lib/useLoad';
import { Avatar, HeaderTitle } from '@/ui/components';
import { fonts, usePalette } from '@/ui/theme';

export default function TabsLayout() {
  const c = usePalette();
  const { session, userId } = useAuth();
  // My photo for the header, and how many friend requests are waiting (shown on the Profile tab).
  const { data: me } = useLoad(
    async () => {
      const [profile, friendships] = await Promise.all([getProfile(userId!), listFriendships()]);
      const requests = friendships.filter((f) => f.status === 'pending' && f.addressee === userId).length;
      return { avatar: profile.avatar_url ?? null, requests };
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
        tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.border, height: 56 },
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
          tabBarLabel: 'League',
          headerRight: () => (
            <Pressable onPress={() => router.navigate('/profile')} hitSlop={12} style={{ marginRight: 16 }}>
              <Avatar name={name} url={me?.avatar} />
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen name="matches" options={{ title: 'Matches', tabBarLabel: 'Matches' }} />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarLabel: requests ? `Profile · ${requests}` : 'Profile' }}
      />
    </Tabs>
  );
}
