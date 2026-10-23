import type { LeagueSettings, MatchFormat, MatchKind } from './types';

export interface MatchPlayerInput {
  userId: string;
  /** Strokes per hole. May be missing if only a total was entered. */
  holeScores?: (number | null)[] | null;
  /** Total strokes, used when hole scores are missing or incomplete. */
  gross?: number | null;
  /** Course handicap for this match (used for net scoring). */
  courseHandicap: number;
  /** Finishing order from a playoff, 1 = winner. Only used with the playoff tie breaker. */
  playoffRank?: number | null;
}

export interface MatchInput {
  kind: MatchKind;
  holes: 9 | 18;
  /** Defaults to stroke play. */
  format?: MatchFormat;
  /** Needed for Stableford. */
  holePars?: number[] | null;
}

/** Stableford points for one hole: 2 for par, one more per stroke under, one less per stroke over, never below 0. */
export function stablefordHole(strokes: number, par: number): number {
  return Math.max(0, 2 + par - strokes);
}

/** Stableford points over the holes entered so far, or null without hole scores and pars. */
export function stablefordPoints(holeScores: (number | null)[] | null | undefined, pars: number[] | null | undefined) {
  if (!holeScores || !pars) return null;
  let total = 0;
  let any = false;
  holeScores.forEach((s, i) => {
    if (s == null || pars[i] == null) return;
    any = true;
    total += stablefordHole(s, pars[i]);
  });
  return any ? total : null;
}

export interface BonusInput {
  userId: string;
  points: number;
}

export interface PlayerResult {
  userId: string;
  /** Stableford points (Stableford matches only). */
  stableford: number | null;
  gross: number | null;
  net: number | null;
  /** The score the match is ranked on (gross or net). */
  score: number | null;
  /** 1-based finishing position. Shared positions mean a tie that was not broken. */
  position: number | null;
  tied: boolean;
  /** How the tie was settled, if there was one. */
  tiebreakNote: string | null;
  placePoints: number;
  bonusPoints: number;
  total: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function completeHoles(p: MatchPlayerInput, holes: number): number[] | null {
  const hs = p.holeScores;
  if (!hs || hs.length !== holes || hs.some((s) => s == null || s <= 0)) return null;
  return hs as number[];
}

export function grossOf(p: MatchPlayerInput, holes: number): number | null {
  const hs = completeHoles(p, holes);
  if (hs) return hs.reduce((a, b) => a + b, 0);
  return p.gross != null && p.gross > 0 ? p.gross : null;
}

/**
 * Countback segments: last 9, 6, 3 and 1 holes for 18; last 6, 3 and 1 for 9.
 * For net scoring each segment takes off the matching share of the handicap.
 */
export function countbackKey(
  p: MatchPlayerInput,
  holes: number,
  net: boolean,
  stablefordPars?: number[] | null,
): number[] | null {
  const hs = completeHoles(p, holes);
  if (!hs) return null;
  const segments = holes === 18 ? [9, 6, 3, 1] : [6, 3, 1];
  return segments.map((len) => {
    const from = holes - len;
    if (stablefordPars) {
      // More points is better, so negate to keep "lower wins".
      return -hs.slice(from).reduce((a, s, i) => a + stablefordHole(s, stablefordPars[from + i]), 0);
    }
    const sum = hs.slice(from).reduce((a, b) => a + b, 0);
    return net ? sum - (p.courseHandicap * len) / holes : sum;
  });
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** Split a tied group into ordered sub-groups. Players in the same sub-group stay tied. */
function breakTie(
  group: { p: MatchPlayerInput }[],
  match: MatchInput,
  settings: LeagueSettings,
): { groups: MatchPlayerInput[][]; note: string } {
  const players = group.map((g) => g.p);
  if (settings.tiebreak === 'countback') {
    const sf = match.format === 'stableford' ? match.holePars : null;
    const keys = new Map(players.map((p) => [p, countbackKey(p, match.holes, settings.scoring === 'net', sf)]));
    if ([...keys.values()].some((k) => k == null)) {
      return { groups: [players], note: 'Countback needs hole-by-hole scores, points split' };
    }
    return { groups: groupBy(players, (a, b) => compareKeys(keys.get(a)!, keys.get(b)!)), note: 'Countback' };
  }
  if (settings.tiebreak === 'playoff') {
    if (players.some((p) => p.playoffRank == null)) {
      return { groups: [players], note: 'Playoff result not entered, points split' };
    }
    return { groups: groupBy(players, (a, b) => a.playoffRank! - b.playoffRank!), note: 'Playoff' };
  }
  return { groups: [players], note: 'Points split' };
}

/** Sort, then gather neighbours that compare equal. */
function groupBy<T>(items: T[], cmp: (a: T, b: T) => number): T[][] {
  const sorted = [...items].sort(cmp);
  const out: T[][] = [];
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (last && cmp(last[0], it) === 0) last.push(it);
    else out.push([it]);
  }
  return out;
}

export function pointsFor(kind: MatchKind, settings: LeagueSettings): number[] {
  return kind === 'major' ? settings.majorPoints : settings.minorPoints;
}

export function scoreMatch(
  match: MatchInput,
  players: MatchPlayerInput[],
  settings: LeagueSettings,
  bonuses: BonusInput[] = [],
): PlayerResult[] {
  const net = settings.scoring === 'net';
  const table = pointsFor(match.kind, settings);
  const bonusBy = new Map<string, number>();
  for (const b of bonuses) bonusBy.set(b.userId, (bonusBy.get(b.userId) ?? 0) + b.points);

  const stableford = match.format === 'stableford';
  const scored = players.map((p) => {
    const gross = grossOf(p, match.holes);
    const netScore = gross == null ? null : gross - p.courseHandicap;
    // Stableford ranks on points over completed cards; negated so lower still ranks first.
    const sf = stableford && completeHoles(p, match.holes) ? stablefordPoints(p.holeScores, match.holePars) : null;
    const score = stableford ? (sf == null ? null : -sf) : net ? netScore : gross;
    return { p, gross, net: netScore, score, sf };
  });

  const finished = scored.filter((s) => s.score != null);
  const byScore = groupBy(finished, (a, b) => a.score! - b.score!);

  const results: PlayerResult[] = [];
  let place = 1;
  for (const group of byScore) {
    const { groups, note } =
      group.length > 1 ? breakTie(group, match, settings) : { groups: [[group[0].p]], note: '' };
    for (const sub of groups) {
      const slots = sub.map((_, i) => table[place - 1 + i] ?? 0);
      const each = round1(slots.reduce((a, b) => a + b, 0) / sub.length);
      for (const p of sub) {
        const s = scored.find((x) => x.p === p)!;
        const bonus = bonusBy.get(p.userId) ?? 0;
        results.push({
          userId: p.userId,
          stableford: s.sf,
          gross: s.gross,
          net: s.net,
          score: s.score,
          position: place,
          tied: sub.length > 1,
          tiebreakNote: group.length > 1 ? note : null,
          placePoints: each,
          bonusPoints: bonus,
          total: round1(each + bonus),
        });
      }
      place += sub.length;
    }
  }

  // Players with no score yet: no place points, but bonuses still count.
  for (const s of scored.filter((x) => x.score == null)) {
    const bonus = bonusBy.get(s.p.userId) ?? 0;
    results.push({
      userId: s.p.userId,
      stableford: null,
      gross: s.gross,
      net: null,
      score: null,
      position: null,
      tied: false,
      tiebreakNote: null,
      placePoints: 0,
      bonusPoints: bonus,
      total: bonus,
    });
  }
  return results;
}
