/** One round a player has played, with what achievements need to know about it. */
export interface AchRound {
  matchId: string;
  playedOn: string;
  /** Local hour the round teed off (tee time if scheduled, otherwise when it was started). */
  teeHour: number | null;
  courseId: string | null;
  /** Holes on the course, so "par'd every hole" knows when it's done. */
  courseHoles: number | null;
  /** Course hole number of the first hole played (10 for a back nine). */
  firstHole: number;
  holes: number;
  holeScores: (number | null)[] | null;
  holePars: number[] | null;
  gross: number | null;
  par: number;
  final: boolean;
  /** Won outright (not tied) a finished match. */
  won: boolean;
  /** Nobody else in the match. */
  solo: boolean;
  bonuses: number;
}

export type AchGroup = 'Playing' | 'Strokes' | 'Winning' | 'Holes' | 'Rounds' | 'Fun';
export const ACH_GROUPS: AchGroup[] = ['Playing', 'Winning', 'Holes', 'Rounds', 'Strokes', 'Fun'];

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  group: AchGroup;
  /** Short text on the badge. */
  glyph: string;
  value: number;
  target: number;
  earned: boolean;
}

export const MAX_SHOWCASE = 4;

const scoresOf = (r: AchRound) => (r.holeScores ?? []).map((s) => (s != null && s > 0 ? s : null));
const complete = (r: AchRound) => {
  const s = scoresOf(r);
  return s.length === r.holes && s.every((x) => x != null);
};

/** Every achievement, with progress, from a player's rounds and league titles. */
export function computeAchievements(input: { rounds: AchRound[]; leagueWins: number }): Achievement[] {
  const rounds = input.rounds.filter((r) => r.gross != null || scoresOf(r).some((s) => s != null));
  const byDate = [...rounds].sort((a, b) => a.playedOn.localeCompare(b.playedOn));

  let strokes = 0;
  let pars = 0;
  let birdies = 0;
  let eagles = 0;
  let aces = 0;
  let snowmen = 0;
  let bestBirdiesInRound = 0;
  let bogeyFree9 = 0;
  let best18: number | null = null;
  let evenKeel = 0;
  let comeback = 0;
  const parredHoles = new Map<string, Set<number>>();
  let parredCourse = 0;

  for (const r of rounds) {
    const s = scoresOf(r);
    const scored = s.filter((x): x is number => x != null);
    strokes += scored.length ? scored.reduce((a, b) => a + b, 0) : (r.gross ?? 0);
    let roundBirdies = 0;
    let hadDouble = false;
    s.forEach((x, i) => {
      if (x == null) return;
      if (x === 1) aces += 1;
      if (x >= 8) snowmen += 1;
      const par = r.holePars?.[i];
      if (par == null) return;
      const d = x - par;
      if (d === 0) pars += 1;
      if (d === -1) ((birdies += 1), (roundBirdies += 1));
      if (d <= -2 && x !== 1) eagles += 1;
      if (d >= 2) hadDouble = true;
      if (d <= 0 && r.courseId) {
        const set = parredHoles.get(r.courseId) ?? new Set<number>();
        set.add(r.firstHole + i);
        parredHoles.set(r.courseId, set);
        if (r.courseHoles && set.size >= r.courseHoles) parredCourse = 1;
      }
    });
    bestBirdiesInRound = Math.max(bestBirdiesInRound, roundBirdies);
    if (r.holePars && complete(r)) {
      for (let start = 0; start + 9 <= r.holes; start += 9) {
        if (s.slice(start, start + 9).every((x, i) => x! <= r.holePars![start + i])) bogeyFree9 = 1;
      }
    }
    const total = complete(r) ? scored.reduce((a, b) => a + b, 0) : r.gross;
    if (total != null && complete(r) && total <= r.par) evenKeel = 1;
    if (total != null && r.holes === 18) best18 = best18 == null ? total : Math.min(best18, total);
    if (r.won && hadDouble) comeback = 1;
  }

  const finals = byDate.filter((r) => r.final);
  const wins = finals.filter((r) => r.won).length;
  let streak = 0;
  let bestStreak = 0;
  for (const r of finals) {
    streak = r.won ? streak + 1 : 0;
    bestStreak = Math.max(bestStreak, streak);
  }

  // Two rounds on the same weekend (Saturday and Sunday count as one weekend).
  const weekends = new Map<string, number>();
  for (const r of rounds) {
    const d = new Date(`${r.playedOn}T12:00:00`);
    const day = d.getDay();
    if (day !== 0 && day !== 6) continue;
    const sat = new Date(d);
    sat.setDate(d.getDate() - (day === 0 ? 1 : 0));
    const k = sat.toISOString().slice(0, 10);
    weekends.set(k, (weekends.get(k) ?? 0) + 1);
  }
  const bestWeekend = Math.max(0, ...weekends.values());
  const courses = new Set(rounds.map((r) => r.courseId).filter(Boolean)).size;
  const bonuses = rounds.reduce((a, r) => a + r.bonuses, 0);
  const n = rounds.length;
  const broke = (x: number) => (best18 != null && best18 < x ? 1 : 0);

  const a = (
    id: string,
    group: AchGroup,
    glyph: string,
    name: string,
    desc: string,
    value: number,
    target = 1,
  ): Achievement => ({ id, group, glyph, name, desc, value: Math.min(value, target), target, earned: value >= target });

  return [
    a('played-1', 'Playing', '1', 'First Tee', 'Play your first match.', n),
    a('played-10', 'Playing', '10', 'Regular', 'Play 10 matches.', n, 10),
    a('played-50', 'Playing', '50', 'Lifer', 'Play 50 matches.', n, 50),
    a('played-100', 'Playing', '100', 'Centurion', 'Play 100 matches.', n, 100),
    a('weekend', 'Playing', 'WKD', 'Weekend Warrior', 'Play twice in one weekend.', bestWeekend, 2),
    a('explorer', 'Playing', 'MAP', 'Explorer', 'Play 3 different courses.', courses, 3),

    a('win-1', 'Winning', 'W', 'First Win', 'Win a match outright.', wins),
    a('win-10', 'Winning', '10W', 'Closer', 'Win 10 matches.', wins, 10),
    a('hat-trick', 'Winning', '3W', 'Hat Trick', 'Win 3 matches in a row.', bestStreak, 3),
    a('champion', 'Winning', 'CUP', 'Champion', 'Win a league season.', input.leagueWins),
    a('dynasty', 'Winning', '2X', 'Dynasty', 'Win 2 league seasons.', input.leagueWins, 2),
    a('comeback', 'Winning', 'CB', 'Comeback Kid', 'Win a match with a double bogey or worse on your card.', comeback),

    a('par', 'Holes', 'PAR', 'Par Starter', 'Make your first par.', pars),
    a('birdie', 'Holes', '-1', 'Birdie', 'Make a birdie.', birdies),
    a('eagle', 'Holes', '-2', 'Eagle', 'Make an eagle.', eagles),
    a('ace', 'Holes', 'ACE', 'Hole in One', 'Hole out from the tee.', aces),
    a('birdie-party', 'Holes', '3B', 'Birdie Party', 'Make 3 birdies in one round.', bestBirdiesInRound, 3),
    a('pars-100', 'Holes', '100P', 'Par Machine', 'Make 100 pars.', pars, 100),

    a('broke-100', 'Rounds', '99', 'Broke 100', 'Shoot under 100 on 18 holes.', broke(100)),
    a('broke-90', 'Rounds', '89', 'Broke 90', 'Shoot under 90 on 18 holes.', broke(90)),
    a('broke-80', 'Rounds', '79', 'Broke 80', 'Shoot under 80 on 18 holes.', broke(80)),
    a('bogey-free', 'Rounds', 'BF9', 'Bogey-free 9', 'Nine holes in a row with no bogeys.', bogeyFree9),
    a('even-keel', 'Rounds', 'E', 'Even Keel', 'Finish a round at par or better.', evenKeel),
    a(
      'every-hole',
      'Rounds',
      'ALL',
      'Full Card',
      'Par (or better) every hole on a course, over any rounds.',
      parredCourse,
    ),

    a('strokes-1', 'Strokes', '1', 'First Swing', 'Hit your first stroke.', strokes),
    a('strokes-100', 'Strokes', '100', 'Warming Up', 'Hit 100 strokes.', strokes, 100),
    a('strokes-1k', 'Strokes', '1K', 'Grinder', 'Hit 1,000 strokes.', strokes, 1000),
    a('strokes-10k', 'Strokes', '10K', 'Stroked It 10K', 'Hit 10,000 strokes.', strokes, 10000),

    a('snowman', 'Fun', '8', 'Snowman', 'Card an 8 (or worse) on a hole.', snowmen),
    a('lone-wolf', 'Fun', 'SOLO', 'Lone Wolf', 'Play a round on your own.', rounds.filter((r) => r.solo).length),
    a(
      'early-bird',
      'Fun',
      'AM',
      'Early Bird',
      'Tee off before 8:00.',
      rounds.filter((r) => r.teeHour != null && r.teeHour < 8).length,
    ),
    a('bonus-hunter', 'Fun', '+', 'Bonus Hunter', 'Earn 5 bonuses.', bonuses, 5),
  ];
}
