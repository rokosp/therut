import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { brand } from './theme';

const COLORS = [brand.blaze, brand.pine, '#F4C27A', brand.birdie, brand.bone];
const SPARKS = 18;

interface Burst {
  x: number;
  y: number;
  delay: number;
  color: string;
}

/** A short burst of brand-coloured fireworks over its parent, played once on mount. */
export function Fireworks({ width, height, bursts = 5 }: { width: number; height: number; bursts?: number }) {
  const [done, setDone] = useState(false);
  const plan = useMemo<Burst[]>(
    () =>
      [...Array(bursts).keys()].map((i) => ({
        x: width * (0.15 + Math.random() * 0.7),
        y: height * (0.12 + Math.random() * 0.45),
        delay: i * 320,
        color: COLORS[i % COLORS.length],
      })),
    [bursts, width, height],
  );
  useEffect(() => {
    const t = setTimeout(() => setDone(true), bursts * 320 + 1600);
    return () => clearTimeout(t);
  }, [bursts]);
  if (done) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height, zIndex: 10 }}>
      {plan.map((b, i) => (
        <BurstView key={i} burst={b} />
      ))}
    </View>
  );
}

function BurstView({ burst }: { burst: Burst }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: 1300,
      delay: burst.delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [t, burst.delay]);
  const radius = 70 + Math.random() * 30;
  return (
    <>
      {[...Array(SPARKS).keys()].map((k) => {
        const angle = (k / SPARKS) * Math.PI * 2;
        const dx = Math.cos(angle) * radius;
        const dy = Math.sin(angle) * radius;
        return (
          <Animated.View
            key={k}
            style={{
              position: 'absolute',
              left: burst.x - 4,
              top: burst.y - 4,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: k % 3 === 0 ? brand.blaze : burst.color,
              opacity: t.interpolate({ inputRange: [0, 0.05, 0.7, 1], outputRange: [0, 1, 0.9, 0] }),
              transform: [
                { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
                // A little gravity: sparks drift down as they fade.
                { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, dy + 24] }) },
                { scale: t.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.4, 1.2, 0.6] }) },
              ],
            }}
          />
        );
      })}
    </>
  );
}
