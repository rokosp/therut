export type MatchKind = 'major' | 'minor';
export type TiebreakMode = 'countback' | 'playoff' | 'split';
export type ScoringBasis = 'gross' | 'net';
/** Stroke play: fewest strokes wins. Stableford: points per hole against par, most points wins. */
export type MatchFormat = 'stroke' | 'stableford';
export type HandicapSource = 'app' | 'self';

export interface BonusType {
  key: string;
  label: string;
  points: number;
}

/** Everything a league admin can change. Stored as JSON on the league row. */
export interface LeagueSettings {
  /** Points for 1st, 2nd, 3rd... in a major (18 holes). Places past the end of the list get 0. */
  majorPoints: number[];
  /** Points for 1st, 2nd, 3rd... in a minor (9 holes). */
  minorPoints: number[];
  /** Format new matches start with. Each match can still pick its own. */
  defaultFormat: MatchFormat;
  /** Always gross for now: the league plays without handicap strokes. Kept for older saved settings. */
  scoring: ScoringBasis;
  /** Which handicap is used for net scoring: the app's calculated one or the player's own. */
  handicapSource: HandicapSource;
  /** How players level on score inside one match are separated. */
  tiebreak: TiebreakMode;
  bonusTypes: BonusType[];
}

export const DEFAULT_SETTINGS: LeagueSettings = {
  majorPoints: [100, 70, 50, 35, 25, 15],
  minorPoints: [50, 35, 25, 18, 12, 8],
  defaultFormat: 'stroke',
  scoring: 'gross',
  handicapSource: 'app',
  tiebreak: 'countback',
  bonusTypes: [
    { key: 'birdie', label: 'Birdie', points: 5 },
    { key: 'eagle', label: 'Eagle', points: 15 },
    { key: 'hio', label: 'Hole in one', points: 50 },
    { key: 'chip_in', label: 'Chip-in', points: 3 },
  ],
};

/** Fill any missing fields with defaults, so older leagues keep working when new settings are added. */
export function withDefaults(s: Partial<LeagueSettings> | null | undefined): LeagueSettings {
  const saved = (s ?? {}) as Partial<LeagueSettings> & {
    placePoints?: number[];
    majorMultiplier?: number;
    minorMultiplier?: number;
  };
  const out = { ...DEFAULT_SETTINGS, ...saved };
  // Leagues saved before separate major/minor lists had one list plus multipliers.
  if (saved.placePoints && !saved.majorPoints) {
    out.majorPoints = saved.placePoints.map((p) => Math.round(p * (saved.majorMultiplier ?? 1) * 10) / 10);
  }
  if (saved.placePoints && !saved.minorPoints) {
    out.minorPoints = saved.placePoints.map((p) => Math.round(p * (saved.minorMultiplier ?? 0.5) * 10) / 10);
  }
  // Net scoring was removed from the app; everything is played gross.
  out.scoring = 'gross';
  delete (out as { placePoints?: unknown }).placePoints;
  delete (out as { majorMultiplier?: unknown }).majorMultiplier;
  delete (out as { minorMultiplier?: unknown }).minorMultiplier;
  return out;
}
