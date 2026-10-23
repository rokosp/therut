import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';

import { teeWeather, type WeatherKind } from '@/lib/weather';
import { brand, useScheme } from '@/ui/theme';

// The art is drawn on a 360x140 card and only the right-hand 110px is shown.
const VIEW = '250 0 110 140';
const W = 110;
const H = 140;

type Layer = 'sun' | 'disc' | 'cloud' | 'drops' | 'fog' | 'wind';
const LAYERS: Record<WeatherKind, Layer[]> = {
  sunny: ['sun'],
  cloudy: ['disc', 'cloud'],
  rain: ['drops'],
  fog: ['fog'],
  wind: ['wind'],
};
const DROPS: [number, number, number][] = [
  [270, 14, 1.0],
  [300, 30, 0.7],
  [334, 10, 0.85],
  [356, 40, 1.1],
  [282, 54, 0.6],
  [318, 66, 1.0],
  [346, 84, 0.7],
  [266, 92, 0.9],
  [296, 104, 0.65],
  [330, 118, 0.95],
  [358, 128, 0.6],
  [284, 130, 0.8],
  [312, 22, 0.55],
];

function LayerArt({ layer, ink, fill }: { layer: Layer; ink: string; fill: string }) {
  if (layer === 'sun') {
    const cx = 334,
      cy = 18,
      r = 32;
    return (
      <G>
        <Circle cx={cx} cy={cy} r={r} fill={brand.blaze} />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return (
            <Line
              key={i}
              x1={cx + Math.cos(a) * (r + 8)}
              y1={cy + Math.sin(a) * (r + 8)}
              x2={cx + Math.cos(a) * (r + 19)}
              y2={cy + Math.sin(a) * (r + 19)}
              stroke={brand.blaze}
              strokeWidth={5}
              strokeLinecap="round"
            />
          );
        })}
      </G>
    );
  }
  if (layer === 'disc') return <Circle cx={326} cy={36} r={30} fill={brand.blaze} />;
  if (layer === 'cloud') {
    return (
      <Path
        transform="translate(268 22) scale(0.85)"
        fill={fill}
        stroke={ink}
        strokeWidth={4.5}
        strokeLinejoin="round"
        d="M10 60 Q0 60 0 48 Q0 34 16 34 Q18 14 40 14 Q58 14 64 30 Q70 20 84 22 Q100 26 100 42 Q114 44 114 54 Q114 60 104 60 Z"
      />
    );
  }
  if (layer === 'drops') {
    return (
      <G>
        {DROPS.map(([x, y, k], i) => (
          <Path
            key={i}
            transform={`translate(${x} ${y}) rotate(28) scale(${k})`}
            fill={ink}
            opacity={0.6}
            d="M0 -11 Q7 -1 7 4 A7 7 0 1 1 -7 4 Q-7 -1 0 -11 Z"
          />
        ))}
      </G>
    );
  }
  if (layer === 'fog') {
    const parts: React.ReactNode[] = [];
    for (let row = 0; row < 7; row++) {
      const y = 18 + row * 18;
      let x = 262 + (row % 2) * 12;
      let k = row;
      while (x < 372) {
        if (k % 3 === 2) {
          parts.push(<Circle key={`${row}-${k}`} cx={x} cy={y} r={2.6} fill={ink} opacity={0.5} />);
          x += 13;
        } else {
          const w = 18 + ((k * 7) % 14);
          parts.push(
            <Line
              key={`${row}-${k}`}
              x1={x}
              y1={y}
              x2={x + w}
              y2={y}
              stroke={ink}
              strokeWidth={4}
              strokeLinecap="round"
              opacity={0.5}
            />,
          );
          x += w + 11;
        }
        k++;
      }
    }
    return <G>{parts}</G>;
  }
  // Wind: gusts from the left that end in curls.
  const gust = (y: number, x2: number, r: number, up: boolean) => {
    const sweep = up ? 0 : 1;
    const d = up ? 1 : -1;
    return `M258 ${y} H${x2} a${r} ${r} 0 1 ${sweep} 0 ${-2 * r * d} a${r * 0.55} ${r * 0.55} 0 1 ${sweep} 0 ${1.1 * r * d}`;
  };
  return (
    <G fill="none" stroke={ink} strokeWidth={4.5} strokeLinecap="round" opacity={0.65}>
      <Path d={gust(46, 304, 11, true)} />
      <Path d={gust(70, 322, 13, true)} />
      <Path d={gust(92, 334, 19, true)} />
      <Path d={gust(108, 318, 13, false)} />
      <Path d={gust(124, 290, 10, false)} />
    </G>
  );
}

/** Weather picture in the top-right corner of an upcoming match card. */
export function WeatherArt({ city, startsAt }: { city?: string | null; startsAt?: string | null }) {
  const dark = useScheme() === 'dark';
  const ink = dark ? brand.bone : brand.pine;
  const fill = dark ? '#103527' : brand.bone;
  const [kind, setKind] = useState<WeatherKind | null>(null);

  useEffect(() => {
    let live = true;
    if (startsAt) teeWeather(city, startsAt).then((w) => live && setKind(w?.kind ?? null));
    return () => {
      live = false;
    };
  }, [city, startsAt]);

  if (!kind) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, width: W, height: H }}>
      <Svg width={W} height={H} viewBox={VIEW}>
        {LAYERS[kind].map((l) => (
          <LayerArt key={l} layer={l} ink={ink} fill={fill} />
        ))}
      </Svg>
    </View>
  );
}
