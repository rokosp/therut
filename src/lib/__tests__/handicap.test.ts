import { describe, expect, it } from 'vitest';
import { adjustedGross, calculateHandicap, courseHandicap, indexRule, strokesPerHole, type HandicapRound } from '../handicap';

const r = (id: string, gross: number, extra: Partial<HandicapRound> = {}): HandicapRound => ({
  id, playedOn: `2026-05-${id.padStart(2, '0')}`, holes: 18, gross, courseRating: 72, slope: 113, par: 72, ...extra,
});

describe('handicap', () => {
  it('needs three 18-hole rounds before giving an index', () => {
    expect(calculateHandicap([r('1', 90), r('2', 92)]).index).toBeNull();
    // 3 rounds: lowest 1 differential minus 2
    expect(calculateHandicap([r('1', 90), r('2', 92), r('3', 88)]).index).toBe(14);
  });

  it('averages the lowest 8 of the latest 20', () => {
    const rounds = Array.from({ length: 22 }, (_, i) => r(String(i + 1), 80 + i));
    // Latest 20 are gross 82..101, lowest 8 differentials are 10..17, average 13.5
    expect(calculateHandicap(rounds).index).toBe(13.5);
  });

  it('scales by slope and rating', () => {
    const res = calculateHandicap([r('1', 95, { courseRating: 73.5, slope: 130 }), r('2', 99), r('3', 99)]);
    expect(res.differentials[0].differential).toBe(18.7); // 113/130 x 21.5 = 18.69
  });

  it('falls back to par and slope 113 when ratings are unknown', () => {
    const res = calculateHandicap([r('1', 40, { holes: 9, par: 30, courseRating: null, slope: null }), r('2', 38, { holes: 9, par: 30, courseRating: null, slope: null })]);
    expect(res.differentials).toHaveLength(1);
    expect(res.differentials[0].differential).toBe(18);
    expect(res.pendingNine).toBe(false);
  });

  it('keeps a lone 9-hole round pending', () => {
    expect(calculateHandicap([r('1', 40, { holes: 9, par: 36, courseRating: 36 })]).pendingNine).toBe(true);
  });

  it('caps holes at par + 5 before an index exists', () => {
    const round = r('1', 0, { holeScores: [10, ...new Array(17).fill(4)], holePars: new Array(18).fill(4) });
    expect(adjustedGross(round, null)).toBe(9 + 68);
  });

  it('caps holes at net double bogey with an index', () => {
    const si = Array.from({ length: 18 }, (_, i) => i + 1);
    const round = r('1', 0, { holeScores: [10, 10, ...new Array(16).fill(4)], holePars: new Array(18).fill(4), strokeIndex: si });
    // index 1 at slope 113, rating=par -> CH 1, stroke on SI 1 (hole 1): caps 7 and 6
    expect(adjustedGross(round, 1)).toBe(7 + 6 + 64);
  });

  it('computes course handicap and stroke allocation', () => {
    expect(courseHandicap(10, { holes: 18, courseRating: 73.5, slope: 130, par: 72 })).toBe(13);
    expect(courseHandicap(10, { holes: 9, courseRating: 36, slope: 113, par: 36 })).toBe(5);
    expect(strokesPerHole(20, 18).reduce((a, b) => a + b, 0)).toBe(20);
    expect(indexRule(6)).toEqual({ use: 2, adjust: -1 });
  });
});

import { playedHoles } from '../course';

describe('playedHoles', () => {
  const champ = { holes: 18 as const, par: 72 };
  const tee = { course_rating: 73.5, slope: 130, hole_pars: [4,4,3,5,4,4,3,4,5, 4,4,3,5,4,4,3,4,5], stroke_index: [1,3,5,7,9,11,13,15,17, 2,4,6,8,10,12,14,16,18] };
  it('uses the full tee for a full round', () => {
    expect(playedHoles({ holes: 18 }, champ, tee)).toMatchObject({ par: 72, courseRating: 73.5, slope: 130 });
  });
  it('halves rating and re-ranks stroke index for a back nine', () => {
    const p = playedHoles({ holes: 9, nine: 'back' }, champ, tee);
    expect(p).toMatchObject({ holes: 9, par: 36, courseRating: 36.8, slope: 130 });
    expect(p.strokeIndex).toEqual([1,2,3,4,5,6,7,8,9]);
  });
  it('falls back gracefully when the tee has no data', () => {
    expect(playedHoles({ holes: 9 }, { holes: 9, par: 30 }, { course_rating: null, slope: null, hole_pars: null, stroke_index: null }))
      .toEqual({ holes: 9, par: 30, courseRating: null, slope: null, holePars: null, strokeIndex: null });
  });
});
