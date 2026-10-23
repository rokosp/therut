import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { T } from './components';
import { usePalette } from './theme';

/** Back arrow for every screen but the home page. With no history (e.g. a refreshed link), it goes home. */
export function BackButton({ home = false }: { home?: boolean }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={12}
      onPress={() => (!home && router.canGoBack() ? router.back() : router.navigate('/'))}
      style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
      <T style={{ fontSize: 24, lineHeight: 28, color: c.text }}>←</T>
    </Pressable>
  );
}
