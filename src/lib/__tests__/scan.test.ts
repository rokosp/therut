import { describe, expect, it } from 'vitest';
import { cleanScores, nameFit, nextHoleToPlay, pairRows, toParSoFar } from '../scan';

describe('scorecard scan helpers', () => {
  it('fits written names to players', () => {
    expect(nameFit('Roko', ['Roko Sp', 'Rokster'])).toBeGreaterThan(nameFit('Roko', ['Adrian']));
    expect(nameFit('AJ', ['Adrian Jurić'])).toBe(5);
    expect(nameFit('Jurić', ['Adrian Juric'])).toBe(8);
  });

  it('pairs each row with one player', () => {
    const people = [
      { id: 'r', names: ['Roko'] },
      { id: 'a', names: ['Adrian'] },
      { id: 'j', names: ['Jela'] },
    ];
    const rows = [
      { name: 'ADRIAN', scores: [] },
      { name: 'Rok', scores: [] },
      { name: 'xyz', scores: [] },
    ];
    expect(pairRows(rows, people)).toEqual(['a', 'r', 'j']);
  });

  it('cleans scores to the hole count', () => {
    expect(cleanScores([4, '5', null, 0, 25, 3.5], 4)).toEqual([4, 5, null, null]);
    expect(cleanScores([], 2)).toEqual([null, null]);
  });

  it('finds the next hole to play', () => {
    expect(nextHoleToPlay([[4, 5, null], [4, 4, 4]], 3)).toBe(2);
    expect(nextHoleToPlay([[4, 5, 3], [4, 4, 4]], 3)).toBe(2);
    expect(nextHoleToPlay([null, [4]], 3)).toBe(0);
  });

  it('works out score to par so far', () => {
    expect(toParSoFar([5, 3, null], [4, 4, 4])).toEqual({ diff: 0, thru: 2, label: 'E' });
    expect(toParSoFar([6, 5], [4, 4]).label).toBe('+3');
  });
});
