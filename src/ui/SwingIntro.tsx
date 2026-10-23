import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, View } from 'react-native';

import { brand, fonts } from './theme';

const DURATION = 2100;

/**
 * A two-second intro before starting a match, seen from just behind the ball:
 * the club whips through, the ball flies over the river and drops in the cup.
 * Tap anywhere to skip.
 */
export function SwingIntro({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  const t = useRef(new Animated.Value(0)).current;
  const [size, setSize] = useState({ w: 0, h: 0 });
  const done = useRef(false);

  useEffect(() => {
    if (!visible) return;
    done.current = false;
    t.setValue(0);
    const anim = Animated.timing(t, { toValue: 1, duration: DURATION, easing: Easing.linear, useNativeDriver: true });
    anim.start(() => finish());
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };

  const { w, h } = size;
  const horizon = h * 0.42;
  const river = h * 0.55;
  const ballX = w / 2;
  const ballY = h * 0.84;
  const cupX = w / 2 + w * 0.06;
  const cupY = horizon + h * 0.03;
  const L = h * 0.42; // club length
  const pivotX = w / 2 + 34;
  const pivotY = ballY - L + 6;

  // Club: back, pause, then a fast whip through the ball.
  const swing = t.interpolate({
    inputRange: [0, 0.16, 0.22, 0.3, 1],
    outputRange: ['0deg', '-62deg', '-62deg', '75deg', '75deg'],
  });
  // Ball: rises well above the flag, then drops onto it, shrinking into the distance.
  const ballDX = t.interpolate({ inputRange: [0, 0.29, 0.86, 1], outputRange: [0, 0, cupX - ballX, cupX - ballX] });
  const ballDY = t.interpolate({
    inputRange: [0, 0.29, 0.55, 0.86, 1],
    outputRange: [0, 0, h * 0.14 - ballY, cupY - ballY, cupY - ballY],
  });
  const ballScale = t.interpolate({ inputRange: [0, 0.29, 0.86, 1], outputRange: [1, 1, 0.16, 0.16] });
  const ballOpacity = t.interpolate({ inputRange: [0, 0.86, 0.9, 1], outputRange: [1, 1, 0, 0] });
  const textOpacity = t.interpolate({ inputRange: [0, 0.88, 0.95, 1], outputRange: [0, 0, 1, 1] });
  const textScale = t.interpolate({ inputRange: [0, 0.88, 0.95, 1], outputRange: [0.6, 0.6, 1.08, 1] });
  const flagWave = t.interpolate({ inputRange: [0, 0.88, 0.92, 0.96, 1], outputRange: [1, 1, 1.4, 0.9, 1.2] });

  return (
    <Modal visible={visible} transparent={false} animationType="fade" onRequestClose={finish}>
      <Pressable
        onPress={finish}
        style={{ flex: 1, backgroundColor: brand.blaze, overflow: 'hidden' }}
        onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {w > 0 ? (
          <>
            {/* Course: far fairway, river, then the tee box in front of us. */}
            <View
              style={{ position: 'absolute', left: 0, right: 0, top: horizon, bottom: 0, backgroundColor: brand.pine }}
            />
            <View
              style={{
                position: 'absolute',
                left: -w * 0.1,
                width: w * 1.2,
                top: river,
                height: h * 0.045,
                backgroundColor: brand.bone,
                opacity: 0.55,
                transform: [{ rotate: '-3deg' }],
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: h * 0.68,
                bottom: 0,
                backgroundColor: brand.rough,
                borderTopLeftRadius: w,
                borderTopRightRadius: w,
              }}
            />

            {/* Flag and cup on the horizon. */}
            <View
              style={{
                position: 'absolute',
                left: cupX - 9,
                top: cupY - 3,
                width: 18,
                height: 6,
                borderRadius: 9,
                backgroundColor: brand.rough,
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: cupX - 1,
                top: cupY - 46,
                width: 2,
                height: 46,
                backgroundColor: brand.bone,
              }}
            />
            <Animated.View
              style={{
                position: 'absolute',
                left: cupX + 1,
                top: cupY - 46,
                width: 18,
                height: 12,
                backgroundColor: brand.blaze,
                borderWidth: 1.5,
                borderColor: brand.bone,
                transform: [{ scaleX: flagWave }],
              }}
            />

            {/* Ball. */}
            <Animated.View
              style={{
                position: 'absolute',
                left: ballX - 14,
                top: ballY - 14,
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: brand.bone,
                opacity: ballOpacity,
                transform: [{ translateX: ballDX }, { translateY: ballDY }, { scale: ballScale }],
              }}
            />
            {/* Tee under the ball. */}
            <View
              style={{
                position: 'absolute',
                left: ballX - 3,
                top: ballY + 12,
                width: 6,
                height: 14,
                backgroundColor: brand.blaze,
              }}
            />

            {/* Club: rotates around the hands, above the ball. */}
            <Animated.View
              style={{
                position: 'absolute',
                left: pivotX - 10,
                top: pivotY - L,
                width: 20,
                height: L * 2,
                transform: [{ rotate: swing }],
              }}>
              <View
                style={{ position: 'absolute', top: L, left: 8, width: 4, height: L - 10, backgroundColor: brand.bone }}
              />
              <View
                style={{
                  position: 'absolute',
                  top: L * 2 - 16,
                  left: -14,
                  width: 30,
                  height: 14,
                  borderRadius: 4,
                  backgroundColor: brand.bone,
                }}
              />
            </Animated.View>

            <Animated.Text
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: h * 0.16,
                textAlign: 'center',
                fontFamily: fonts.displayBlack,
                fontSize: 54,
                lineHeight: 56,
                color: brand.pine,
                opacity: textOpacity,
                transform: [{ scale: textScale }],
              }}>
              {'HOLE IN\nONE!'}
            </Animated.Text>
          </>
        ) : null}
      </Pressable>
    </Modal>
  );
}
