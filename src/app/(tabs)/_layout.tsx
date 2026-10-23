import { router } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import { Pressable } from 'react-native';

import { useAuth } from '@/lib/auth';
import { Avatar, HeaderTitle } from '@/ui/components';
import { fonts, usePalette } from '@/ui/theme';

export default function TabsLayout() {
  const c = usePalette();
  const { session } = useAuth();
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
          title: 'Leagues',
          tabBarLabel: 'Leagues',
          headerRight: () => (
            <Pressable onPress={() => router.navigate('/profile')} hitSlop={12} style={{ marginRight: 16 }}>
              <Avatar name={name} />
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen name="live" options={{ title: 'Live', tabBarLabel: 'Live' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarLabel: 'Profile' }} />
    </Tabs>
  );
}
