import { useColorScheme } from 'react-native';

/** Brand tokens from the brand book (brand-tokens.json). */
export const brand = {
  blaze: '#E78F25',
  pine: '#135840',
  rough: '#0B2A1F',
  bone: '#F0EEE4',
  ember: '#9A520A',
  slate: '#5E6B63',
  birdie: '#B03A2E',
  birdieDark: '#E8705F',
} as const;

export type Palette = Record<
  | 'bg'
  | 'surface'
  | 'card'
  | 'text'
  | 'head'
  | 'muted'
  | 'border'
  | 'primary'
  | 'onPrimary'
  | 'accent'
  | 'onAccent'
  | 'accentText'
  | 'danger'
  | 'leader'
  | 'onLeader',
  string
>;

/** Light is Bone and Pine for daytime on the course. Dark is Rough with Blaze accents. */
export const palettes: { light: Palette; dark: Palette } = {
  light: {
    bg: brand.bone,
    surface: '#E2E1D5',
    card: '#E2E1D5',
    text: brand.rough,
    head: brand.pine,
    muted: brand.slate,
    border: '#DCDBCE',
    primary: brand.pine,
    onPrimary: brand.bone,
    accent: brand.blaze,
    onAccent: brand.rough,
    accentText: brand.ember,
    danger: brand.birdie,
    leader: brand.blaze,
    onLeader: brand.rough,
  },
  dark: {
    bg: brand.rough,
    surface: '#103527',
    card: '#103527',
    text: brand.bone,
    head: brand.bone,
    muted: '#9FB0A6',
    border: '#22493A',
    primary: brand.blaze,
    onPrimary: brand.rough,
    accent: brand.blaze,
    onAccent: brand.rough,
    accentText: brand.blaze,
    danger: brand.birdieDark,
    leader: brand.blaze,
    onLeader: brand.rough,
  },
};

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? palettes.dark : palettes.light;
}

export const fonts = {
  display: 'BigShouldersDisplay_800ExtraBold',
  displayBlack: 'BigShouldersDisplay_900Black',
  body: 'InstrumentSans_400Regular',
  bodyMedium: 'InstrumentSans_500Medium',
  bodyBold: 'InstrumentSans_600SemiBold',
  num: 'BigShouldersDisplay_800ExtraBold',
  mono: 'IBMPlexMono_500Medium',
};

export const type = { display: 48, h1: 32, h2: 24, title: 20, body: 16, label: 13, score: 40 };
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { small: 6, input: 10, card: 14, chip: 999 };
export const touch = 48;
