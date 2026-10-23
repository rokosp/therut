/**
 * Simplified World Handicap System.
 *
 * - Score differential = (113 / slope) x (adjusted gross - course rating)
 * - Each hole is capped at net double bogey when hole pars are known
 *   (par + 2 + strokes received; par + 5 before a player has an index).
 * - Two 9-hole rounds are combined into one 18-hole differential.
 * - Index = average of the lowest differentials from the latest 20, using the WHS table.
 * - Missing course rating falls back to par, missing slope to 113.
 */

export const STANDARD_SLOPE = 113;
export const MAX_INDEX = 54;

export interface HandicapRound {
  id: string;
  playedOn: string; // ISO date
  holes: 9 | 18;
  gross: number;
  holeScores?: (number | null)[] | null;
  holePars?: number[] | null;
  strokeIndex?: number[] | null;
  /** Rating and par for the holes actually played (9-hole values for a 9-hole round). */
  courseRating?: number | null;
  slope?: number | null;
  par: number;
}

export interface RoundDifferential {
  roundIds: string[];
  playedOn: string;
  differential: number;
  adjustedGross: number;
}

export interface HandicapResult {
  index: number | null;
  /** Differentials in date order, oldest first. */
  differentials: RoundDifferential[];
  /** Differentials that made up the current index. */
  counting: RoundDifferential[];
  /** True when a single 9-hole round is waiting for a partner. */
  pendingNine: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** How many lowest differentials count, and the adjustment, by number of differentials (WHS table). */
export function indexRule(count: number): { use: number; adjust: number } | null {
  if (count < 3) return null;
  if (count === 3) return { use: 1, adjust: -2 };
  if (count === 4) return { use: 1, adjust: -1 };
  if (count === 5) return { use: 1, adjust: 0 };
  if (count === 6) return { use: 2, adjust: -1 };
  if (count <= 8) return { use: 2, adjust: 0 };
  if (count <= 11) return { use: 3, adjust: 0 };
  if (count <= 14) return { use: 4, adjust: 0 };
  if (count <= 16) return { use: 5, adjust: 0 };
  if (count <= 18) return { use: 6, adjust: 0 };
  if (count === 19) return { use: 7, adjust: 0 };
  return { use: 8, adjust: 0 };
}

/** Course handicap for the holes being played. For 9 holes, pass 9-hole rating and par. */
export function courseHandicap(
  index: number,
  opts: { holes: 9 | 18; courseRating?: number | null; slope?: number | null; par: number },
): number {
  const rating = opts.courseRating ?? opts.par;
  const slope = opts.slope ?? STANDARD_SLOPE;
  const idx = opts.holes === 9 ? index / 2 : index;
  return Math.round(idx * (slope / STANDARD_SLOPE) + (rating - opts.par));
}

/** Strokes a player gets on each hole, given course handicap and stroke index. */
export function strokesPerHole(ch: number, holes: number, strokeIndex?: number[] | null): number[] {
  const out = new Array(holes).fill(0);
  if (ch <= 0) return out;
  // Order holes hardest first. Without a stroke index, use hole order.
  const order =
    strokeIndex && strokeIndex.length === holes
      ? [...out.keys()].sort((a, b) => strokeIndex[a] - strokeIndex[b])
      : [...out.keys()];
  for (let s = 0; s < ch; s++) out[order[s % holes]] += 1;
  return out;
}

/** Gross score with each hole capped at net double bogey. Returns gross unchanged if holes are unknown. */
export function adjustedGross(round: HandicapRound, indexBefore: number | null): number {
  const { holeScores, holePars } = round;
  if (
    !holeScores ||
    !holePars ||
    holeScores.length !== round.holes ||
    holePars.length !== round.holes ||
    holeScores.some((s) => s == null)
  ) {
    return round.gross;
  }
  const ch =
    indexBefore == null
      ? null
      : courseHandicap(indexBefore, {
          holes: round.holes,
          courseRating: round.courseRating,
          slope: round.slope,
          par: round.par,
        });
  const strokes = ch == null ? null : strokesPerHole(ch, round.holes, round.strokeIndex);
  return holeScores.reduce<number>((sum, s, i) => {
    const cap = strokes ? holePars[i] + 2 + strokes[i] : holePars[i] + 5;
    return sum + Math.min(s as number, cap);
  }, 0);
}

export function differential(round: HandicapRound, indexBefore: number | null): { diff: number; adj: number } {
  const adj = adjustedGross(round, indexBefore);
  const rating = round.courseRating ?? round.par;
  const slope = round.slope ?? STANDARD_SLOPE;
  return { diff: (STANDARD_SLOPE / slope) * (adj - rating), adj };
}

function indexFrom(diffs: RoundDifferential[]): { index: number | null; counting: RoundDifferential[] } {
  const recent = diffs.slice(-20);
  const rule = indexRule(recent.length);
  if (!rule) return { index: null, counting: [] };
  const counting = [...recent].sort((a, b) => a.differential - b.differential).slice(0, rule.use);
  const avg = counting.reduce((s, d) => s + d.differential, 0) / counting.length;
  return { index: Math.min(MAX_INDEX, round1(avg + rule.adjust)), counting };
}

export function calculateHandicap(rounds: HandicapRound[]): HandicapResult {
  const sorted = [...rounds].sort((a, b) => a.playedOn.localeCompare(b.playedOn) || a.id.localeCompare(b.id));
  const diffs: RoundDifferential[] = [];
  let pending: { round: HandicapRound; diff: number; adj: number } | null = null;

  for (const r of sorted) {
    const before = indexFrom(diffs).index;
    const { diff, adj } = differential(r, before);
    if (r.holes === 18) {
      diffs.push({ roundIds: [r.id], playedOn: r.playedOn, differential: round1(diff), adjustedGross: adj });
    } else if (pending) {
      diffs.push({
        roundIds: [pending.round.id, r.id],
        playedOn: r.playedOn,
        differential: round1(pending.diff + diff),
        adjustedGross: pending.adj + adj,
      });
      pending = null;
    } else {
      pending = { round: r, diff, adj };
    }
  }

  const { index, counting } = indexFrom(diffs);
  return { index, differentials: diffs, counting, pendingNine: pending != null };
}
