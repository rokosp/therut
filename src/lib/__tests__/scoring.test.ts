import { describe, expect, it } from 'vitest';
import { scoreMatch, type MatchPlayerInput } from '../scoring';
import { buildStandings } from '../standings';
import { DEFAULT_SETTINGS, withDefaults, type LeagueSettings } from '../types';

const gross: LeagueSettings = { ...DEFAULT_SETTINGS, scoring: 'gross' };
const p = (userId: string, total: number, extra: Partial<MatchPlayerInput> = {}): MatchPlayerInput => ({
  userId, gross: total, courseHandicap: 0, ...extra,
});
const holes18 = (front: number[], back: number[]) => [...front, ...back];
const fours = (n: number) => new Array(n).fill(4);

describe('scoreMatch', () => {
  it('awards place points with full value for a major', () => {
    const r = scoreMatch({ kind: 'major', holes: 18 }, [p('a', 80), p('b', 75), p('c', 90)], gross);
    expect(r.map((x) => [x.userId, x.position, x.placePoints])).toEqual([
      ['b', 1, 100], ['a', 2, 70], ['c', 3, 50],
    ]);
  });

  it('uses the minor points list for a minor', () => {
    const r = scoreMatch({ kind: 'minor', holes: 9 }, [p('a', 40), p('b', 38)], gross);
    expect(r.map((x) => x.placePoints)).toEqual([50, 35]);
  });

  it('uses custom league points', () => {
    const s = { ...gross, minorPoints: [10, 5] };
    const r = scoreMatch({ kind: 'minor', holes: 9 }, [p('a', 40), p('b', 38), p('c', 45)], s);
    expect(r.map((x) => [x.userId, x.placePoints])).toEqual([['b', 10], ['a', 5], ['c', 0]]);
  });

  it('turns an older single list with multipliers into two lists', () => {
    const s = withDefaults({ placePoints: [100, 60], minorMultiplier: 0.5 } as never);
    expect([s.majorPoints, s.minorPoints]).toEqual([[100, 60], [50, 30]]);
    expect(withDefaults({ majorPoints: [9], minorPoints: [3] }).minorPoints).toEqual([3]);
  });

  it('ranks on net when the league uses net scoring', () => {
    const s = { ...DEFAULT_SETTINGS, scoring: 'net' as const };
    const r = scoreMatch({ kind: 'major', holes: 18 }, [p('low', 78, { courseHandicap: 2 }), p('high', 90, { courseHandicap: 18 })], s);
    expect(r[0].userId).toBe('high');
    expect(r[0].net).toBe(72);
  });

  it('breaks a tie by countback on the back nine', () => {
    const a = p('a', 0, { holeScores: holes18(fours(9), [...fours(8), 5]) }); // 37 front... 36+37=73
    const b = p('b', 0, { holeScores: holes18([...fours(8), 5], fours(9)) }); // 37+36=73
    const r = scoreMatch({ kind: 'major', holes: 18 }, [a, b], gross);
    expect(r.map((x) => [x.userId, x.position, x.placePoints, x.tiebreakNote])).toEqual([
      ['b', 1, 100, 'Countback'], ['a', 2, 70, 'Countback'],
    ]);
  });

  it('splits points when countback has no hole scores', () => {
    const r = scoreMatch({ kind: 'major', holes: 18 }, [p('a', 80), p('b', 80), p('c', 85)], gross);
    expect(r.map((x) => [x.userId, x.position, x.placePoints, x.tied])).toEqual([
      ['a', 1, 85, true], ['b', 1, 85, true], ['c', 3, 50, false],
    ]);
  });

  it('uses playoff ranks when that tie breaker is chosen', () => {
    const s = { ...gross, tiebreak: 'playoff' as const };
    const r = scoreMatch({ kind: 'major', holes: 18 }, [p('a', 80, { playoffRank: 2 }), p('b', 80, { playoffRank: 1 })], s);
    expect(r.map((x) => [x.userId, x.position])).toEqual([['b', 1], ['a', 2]]);
  });

  it('splits points when the league chooses split', () => {
    const s = { ...gross, tiebreak: 'split' as const };
    const r = scoreMatch({ kind: 'major', holes: 18 }, [p('a', 80), p('b', 80)], s);
    expect(r.every((x) => x.placePoints === 85)).toBe(true);
  });

  it('adds bonus points and keeps players with no score at zero place points', () => {
    const r = scoreMatch({ kind: 'major', holes: 18 }, [p('a', 80), { userId: 'b', courseHandicap: 0 }], gross, [
      { userId: 'a', points: 5 }, { userId: 'b', points: 15 },
    ]);
    expect(r.find((x) => x.userId === 'a')!.total).toBe(105);
    expect(r.find((x) => x.userId === 'b')).toMatchObject({ position: null, placePoints: 0, total: 15 });
  });
});

describe('buildStandings', () => {
  it('sums points across matches and shares rank on equal totals', () => {
    const m1 = scoreMatch({ kind: 'major', holes: 18 }, [p('a', 70), p('b', 75), p('c', 80)], gross);
    const m2 = scoreMatch({ kind: 'major', holes: 18 }, [p('a', 75), p('b', 70), p('c', 80)], gross);
    const t = buildStandings(['a', 'b', 'c', 'd'], [m1, m2]);
    expect(t.map((x) => [x.userId, x.rank, x.total, x.wins])).toEqual([
      ['a', 1, 170, 1], ['b', 1, 170, 1], ['c', 3, 100, 0], ['d', 4, 0, 0],
    ]);
  });
});

describe('stableford', () => {
  const pars = [4, 3, 5, 4, 4, 3, 4, 5, 4];
  const sf = (userId: string, holeScores: number[]) => ({ userId, holeScores, courseHandicap: 0 });
  const match = { kind: 'minor' as const, holes: 9 as const, format: 'stableford' as const, holePars: pars };

  it('scores points per hole and ranks the most points first', () => {
    // a: all pars = 18 pts. b: a birdie and a triple = 18 + 1 - 2 = 17 (triple scores 0, not -1).
    const r = scoreMatch(match, [sf('a', pars), sf('b', [3, 3, 5, 7, 4, 3, 4, 5, 4])], gross);
    expect(r.map((x) => [x.userId, x.stableford, x.position])).toEqual([['a', 18], ['b', 17]].map(([u, p], i) => [u, p, i + 1]));
  });

  it('breaks stableford ties by countback on points', () => {
    const a = sf('a', [3, 3, 5, 4, 4, 3, 4, 5, 5]); // birdie early, bogey on 9
    const b = sf('b', [5, 3, 5, 4, 4, 3, 4, 5, 3]); // bogey early, birdie on 9
    const r = scoreMatch(match, [a, b], gross);
    expect(r.map((x) => [x.userId, x.stableford, x.position])).toEqual([['b', 18, 1], ['a', 18, 2]]);
  });
});
