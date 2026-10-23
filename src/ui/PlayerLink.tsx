import { router } from 'expo-router';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

/** Wrap a player's name so tapping it opens their profile. */
export function PlayerLink({
  id,
  children,
  style,
}: {
  id: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={(e) => {
        // Don't also trigger the card the name sits on.
        e?.stopPropagation?.();
        router.push(`/player/${id}`);
      }}
      hitSlop={4}
      style={style}>
      {children}
    </Pressable>
  );
}
