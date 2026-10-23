import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

import { brand } from '@/ui/theme';

/** A red dot that slowly pulses, for "something is live". */
export function LiveDot({ size = 8 }: { size?: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t]);
  return (
    <Animated.View
      accessibilityLabel="A match is live"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: brand.birdie,
        opacity: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] }),
        transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] }) }],
      }}
    />
  );
}
