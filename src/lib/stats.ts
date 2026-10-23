import { an } from './commentary';

/** Fun facts from scorecards: notable holes in one match, and awards for a whole season. */

export interface CardInput {
  userId: string;
  name: string;
  holeScores: (number | null)[] | null;
}

export interface Happening {
  kind: 'great' | 'ouch' | 'info';
  text: string;
}

function joinList(xs: string[]) {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

const holesText = (hs: number[]) => `${hs.length === 1 ? 'hole' : 'holes'} ${joinList(hs.map(String))}`;
const toParText = (n: number) => (n === 0 ? 'E' : n > 0 ? `+${n}` : String(n));

/** Notable things that happened in one match: aces, eagles, birdies, pars and each player's worst hole. */
export function matchHappenings(opts: { players: CardInput[]; holePars: number[] | null; holeOffset?: number }): Happening[] {
  const { players, holePars } = opts;
  const offset = opts.holeOffset ?? 0;
  const out: Happening[] = [];
  if (!holePars) return out;
  for (const p of players) {
    const hs = p.holeScores ?? [];
    const by = (test: (s: number, par: number) => boolean) =>
      hs.flatMap((s, i) => (s != null && holePars[i] != null && test(s, holePars[i]) ? [i + 1 + offset] : []));
    const aces = by((s) => s === 1);
    const eagles = by((s, par) => s !== 1 && s <= par - 2);
    const birdies = by((s, par) => s === par - 1);
    if (aces.length) out.push({ kind: 'great', text: `${p.name} made a hole in one on ${holesText(aces)}!` });
    if (eagles.length) out.push({ kind: 'great', text: `${p.name} eagled ${holesText(eagles)}.` });
    if (birdies.length) out.push({ kind: 'great', text: `${p.name} birdied ${holesText(birdies)}.` });
  }
  for (const p of players) {
    const hs = p.holeScores ?? [];
    const pars = hs.filter((s, i) => s != null && s === holePars[i]).length;
    if (pars >= 3) out.push({ kind: 'info', text: `${p.name} made ${pars} pars.` });
  }
  for (const p of players) {
    let worst: { over: number; strokes: number; hole: number } | null = null;
    (p.holeScores ?? []).forEach((s, i) => {
      if (s == null || holePars[i] == null) return;
      const over = s - holePars[i];
      if (!worst || over > worst.over) worst = { over, strokes: s, hole: i + 1 + offset };
    });
    const w = worst as { over: number; strokes: number; hole: number } | null;
    if (w && w.over >= 2) {
      out.push({ kind: 'ouch', text: `${p.name}'s worst hole: ${an(w.strokes)} ${w.strokes} on hole ${w.hole} (${toParText(w.over)}).` });
    }
  }
  return out;
}

// Season ------------------------------------------------------------------

export interface SeasonCard {
  userId: string;
  matchId: string;
  playedOn: string;
  courseName: string;
  /** Hole numbers as shown on the course (e.g. 10-18 for a back nine). */
  holeOffset: number;
  holeScores: (number | null)[] | null;
  holePars: number[] | null;
  /** Total strokes, if the card is finished. */
  gross: number | null;
  par: number;
  won: boolean;
}

export interface Award {
  key: string;
  title: string;
  /** Everyone sharing the award. */
  userIds: string[];
  value: string;
  detail: string;
}

interface Tally {
  rounds: number;
  wins: number;
  birdies: number;
  eagles: number;
  pars: number;
  blowups: number;
  worst: { over: number; strokes: number; hole: number; course: string; playedOn: string } | null;
  best: { toPar: number; gross: number; par: number; course: string; playedOn: string } | null;
}

export function seasonTallies(cards: SeasonCard[]): Map<string, Tally> {
  const t = new Map<string, Tally>();
  for (const c of cards) {
    const x = t.get(c.userId) ?? { rounds: 0, wins: 0, birdies: 0, eagles: 0, pars: 0, blowups: 0, worst: null, best: null };
    x.rounds += 1;
    if (c.won) x.wins += 1;
    (c.holeScores ?? []).forEach((s, i) => {
      const par = c.holePars?.[i];
      if (s == null || par == null) return;
      const over = s - par;
      if (over === -1) x.birdies += 1;
      if (over <= -2) x.eagles += 1;
      if (over === 0) x.pars += 1;
      if (over >= 2) x.blowups += 1;
      if (!x.worst || over > x.worst.over || (over === x.worst.over && s > x.worst.strokes)) {
        x.worst = { over, strokes: s, hole: i + 1 + c.holeOffset, course: c.courseName, playedOn: c.playedOn };
      }
    });
    if (c.gross != null) {
      const toPar = c.gross - c.par;
      if (!x.best || toPar < x.best.toPar) x.best = { toPar, gross: c.gross, par: c.par, course: c.courseName, playedOn: c.playedOn };
    }
    t.set(c.userId, x);
  }
  return t;
}

/** Everyone tied for the top value (highest by default). Nobody wins with a zero count. */
function leaders<T>(entries: [string, T][], value: (t: T) => number | null, lowest = false) {
  const vals = entries.map(([id, t]) => [id, value(t)] as const).filter(([, v]) => v != null) as [string, number][];
  if (vals.length === 0) return null;
  const best = lowest ? Math.min(...vals.map(([, v]) => v)) : Math.max(...vals.map(([, v]) => v));
  if (!lowest && best <= 0) return null;
  return { ids: vals.filter(([, v]) => v === best).map(([id]) => id), best };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function seasonAwards(cards: SeasonCard[]): Award[] {
  const tallies = seasonTallies(cards);
  const e = [...tallies.entries()];
  const out: Award[] = [];
  const push = (key: string, title: string, l: { ids: string[]; best: number } | null, value: string, detail: string) => {
    if (l) out.push({ key, title, userIds: l.ids, value, detail });
  };

  const wins = leaders(e, (t) => t.wins);
  push('wins', 'Most wins', wins, String(wins?.best), wins ? plural(wins.best, 'match', 'matches') + ' won' : '');

  const birdies = leaders(e, (t) => t.birdies + t.eagles);
  push('birdies', 'Most birdies', birdies, String(birdies?.best), 'Birdies or better');

  const best = leaders(e, (t) => t.best?.toPar ?? null, true);
  if (best) {
    const b = tallies.get(best.ids[0])!.best!;
    push('best', 'Best round', best, toParText(best.best), `${b.gross} on par ${b.par}, ${b.course}`);
  }

  const pars = leaders(e, (t) => t.pars);
  push('pars', 'Par machine', pars, String(pars?.best), 'Most pars');

  const worst = leaders(e, (t) => t.worst?.over ?? null);
  if (worst) {
    const w = tallies.get(worst.ids[0])!.worst!;
    push('worst', 'Worst hole', worst, String(w.strokes), `${toParText(w.over)} on hole ${w.hole}, ${w.course}`);
  }

  const blowups = leaders(e, (t) => t.blowups);
  push('blowups', 'Blow-up king', blowups, String(blowups?.best), 'Double bogeys or worse');

  const rounds = leaders(e, (t) => t.rounds);
  push('rounds', 'Ironman', rounds, String(rounds?.best), 'Most rounds played');

  return out;
}


// Career ------------------------------------------------------------------

export interface CareerRound {
  holes: number;
  holeScores: (number | null)[] | null;
  holePars: number[] | null;
  /** Total strokes, when the card is finished. */
  gross: number | null;
  par: number;
}

export interface Career {
  rounds: number;
  holesPlayed: number;
  strokes: number;
  aces: number;
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubles: number;
  best18: { gross: number; toPar: number } | null;
  best9: { gross: number; toPar: number } | null;
}

/** Lifetime totals from every scorecard: holes, strokes and how each hole went against par. */
export function careerHighlights(rounds: CareerRound[]): Career {
  const out: Career = {
    rounds: 0, holesPlayed: 0, strokes: 0, aces: 0, eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubles: 0,
    best18: null, best9: null,
  };
  for (const r of rounds) {
    const scored = (r.holeScores ?? []).filter((s): s is number => s != null && s > 0);
    if (scored.length === 0 && r.gross == null) continue;
    out.rounds += 1;
    if (scored.length) {
      out.holesPlayed += scored.length;
      out.strokes += scored.reduce((a, b) => a + b, 0);
    } else {
      out.holesPlayed += r.holes;
      out.strokes += r.gross!;
    }
    (r.holeScores ?? []).forEach((s, i) => {
      const par = r.holePars?.[i];
      if (s == null || s <= 0) return;
      if (s === 1) out.aces += 1;
      if (par == null) return;
      const d = s - par;
      if (d <= -2 && s !== 1) out.eagles += 1;
      else if (d === -1) out.birdies += 1;
      else if (d === 0) out.pars += 1;
      else if (d === 1) out.bogeys += 1;
      else if (d >= 2) out.doubles += 1;
    });
    if (r.gross != null) {
      const key = r.holes === 18 ? 'best18' : 'best9';
      const cur = out[key];
      if (!cur || r.gross < cur.gross) out[key] = { gross: r.gross, toPar: r.gross - r.par };
    }
  }
  return out;
}

// Head to head and hole stats -----------------------------------------------

export interface H2HMatch {
  matchId: string;
  playedOn: string;
  /** Finishing positions in the match (lower is better). */
  mine: number | null;
  theirs: number | null;
  /** Strokes (or Stableford points) for the margin line. */
  myScore: number | null;
  theirScore: number | null;
  stableford: boolean;
}

/** My wins, losses and ties against one player, from finished matches we both played. */
export function headToHead(ms: H2HMatch[]) {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  const done = ms.filter((m) => m.mine != null && m.theirs != null).sort((a, b) => b.playedOn.localeCompare(a.playedOn));
  for (const m of done) {
    if (m.mine! < m.theirs!) wins += 1;
    else if (m.mine! > m.theirs!) losses += 1;
    else ties += 1;
  }
  return { wins, losses, ties, last: done[0] ?? null };
}

export interface HoleCard {
  /** Course hole numbers (1-based, already offset for a back nine). */
  holeNumbers: number[];
  holeScores: (number | null)[] | null;
  holePars: number[] | null;
}

export interface HoleStat {
  hole: number;
  par: number | null;
  played: number;
  average: number;
  best: number;
  overPar: number | null;
}

/** Average, best and score against par for each hole of one course. */
export function holeStats(cards: HoleCard[]): HoleStat[] {
  const by = new Map<number, { par: number | null; scores: number[] }>();
  for (const c of cards) {
    (c.holeScores ?? []).forEach((s, i) => {
      if (s == null || s <= 0) return;
      const n = c.holeNumbers[i];
      const e = by.get(n) ?? { par: c.holePars?.[i] ?? null, scores: [] };
      e.scores.push(s);
      by.set(n, e);
    });
  }
  return [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hole, e]) => {
      const average = e.scores.reduce((a, b) => a + b, 0) / e.scores.length;
      return {
        hole,
        par: e.par,
        played: e.scores.length,
        average: Math.round(average * 100) / 100,
        best: Math.min(...e.scores),
        overPar: e.par != null ? Math.round((average - e.par) * 100) / 100 : null,
      };
    });
}
