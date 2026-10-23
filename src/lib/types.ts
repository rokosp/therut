export type MatchKind = 'major' | 'minor';
export type TiebreakMode = 'countback' | 'playoff' | 'split';
export type ScoringBasis = 'gross' | 'net';
export type HandicapSource = 'app' | 'self';

export interface BonusType {
  key: string;
  label: string;
  points: number;
}

/** Everything a league admin can change. Stored as JSON on the league row. */
export interface LeagueSettings {
  /** Points for 1st, 2nd, 3rd... Places past the end of the list get 0. */
  placePoints: number[];
  majorMultiplier: number;
  minorMultiplier: number;
  /** Rank each match on gross strokes or on net (gross minus course handicap). */
  scoring: ScoringBasis;
  /** Which handicap is used for net scoring: the app's calculated one or the player's own. */
  handicapSource: HandicapSource;
  /** How players level on score inside one match are separated. */
  tiebreak: TiebreakMode;
  bonusTypes: BonusType[];
}

export const DEFAULT_SETTINGS: LeagueSettings = {
  placePoints: [100, 70, 50, 35, 25, 15],
  majorMultiplier: 1,
  minorMultiplier: 0.5,
  scoring: 'net',
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
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}
