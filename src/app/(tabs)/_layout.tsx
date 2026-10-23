import { Tabs } from 'expo-router/tabs';
import { Text, type ColorValue } from 'react-native';

import { fonts, usePalette } from '@/ui/theme';

function Glyph({ char, color }: { char: string; color: ColorValue }) {
  return <Text style={{ color, fontSize: 18, fontFamily: fonts.bodyBold }}>{char}</Text>;
}

export default function TabsLayout() {
  const c = usePalette();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.text,
        headerTitleStyle: { fontFamily: fonts.display, fontSize: 22 },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: c.bg },
        tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.border },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 12 },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'THE RUT', tabBarLabel: 'Leagues', tabBarIcon: ({ color }) => <Glyph char="⛳" color={color} /> }}
      />
      <Tabs.Screen
        name="live"
        options={{ title: 'LIVE MATCHES', tabBarLabel: 'Live', tabBarIcon: ({ color }) => <Glyph char="●" color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'PROFILE', tabBarLabel: 'Profile', tabBarIcon: ({ color }) => <Glyph char="☺" color={color} /> }}
      />
    </Tabs>
  );
}
