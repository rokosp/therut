import { describe, expect, it } from 'vitest';

import { careerHighlights, headToHead, holeStats, matchHappenings, seasonAwards, type SeasonCard } from '../stats';

const pars = [4, 3, 5, 4, 4, 3, 5, 4, 4];

describe('matchHappenings', () => {
  it('lists birdies, eagles, pars and the worst hole', () => {
    const lines = matchHappenings({
      holePars: pars,
      holeOffset: 9,
      players: [
        { userId: 'a', name: 'Jela', holeScores: [3, 3, 3, 4, 4, 3, 6, 5, 8] },
        { userId: 'b', name: 'Roko', holeScores: [5, 4, 6, 5, 5, 4, 6, 5, 5] },
      ],
    }).map((l) => l.text);
    expect(lines).toContain('Jela eagled hole 12.');
    expect(lines).toContain('Jela birdied hole 10.');
    expect(lines).toContain('Jela made 4 pars.');
    expect(lines).toContain("Jela's worst hole: an 8 on hole 18 (+4).");
    expect(lines.some((l) => l.startsWith("Roko's worst"))).toBe(false);
  });
});

describe('seasonAwards', () => {
  const card = (userId: string, scores: number[], won = false, matchId = 'm1'): SeasonCard => ({
    userId,
    matchId,
    playedOn: '2026-04-12',
    courseName: 'Riverside',
    holeOffset: 0,
    holeScores: scores,
    holePars: pars,
    gross: scores.reduce((a, b) => a + b, 0),
    par: 36,
    won,
  });

  it('picks winners and shares ties', () => {
    const awards = seasonAwards([
      card('a', [3, 3, 5, 4, 4, 3, 5, 4, 9], true),
      card('b', [3, 3, 5, 4, 4, 3, 5, 4, 5]),
      card('a', [4, 3, 5, 4, 4, 3, 5, 4, 4], true, 'm2'),
    ]);
    const by = Object.fromEntries(awards.map((a) => [a.key, a]));
    expect(by.wins.userIds).toEqual(['a']);
    expect(by.wins.value).toBe('2');
    expect(by.birdies.userIds).toEqual(['a', 'b']);
    expect(by.best.userIds).toEqual(['a', 'b']);
    expect(by.best.value).toBe('E');
    expect(by.worst.userIds).toEqual(['a']);
    expect(by.worst.value).toBe('9');
    expect(by.blowups.userIds).toEqual(['a']);
  });

  it('skips awards nobody earned', () => {
    const awards = seasonAwards([card('a', pars)]);
    expect(awards.find((a) => a.key === 'birdies')).toBeUndefined();
    expect(awards.find((a) => a.key === 'worst')).toBeUndefined();
  });
});

describe('careerHighlights', () => {
  it('adds up holes, strokes and scores against par', () => {
    const c = careerHighlights([
      { holes: 9, holeScores: [3, 3, 5, 4, 4, 1, 5, 4, 8], holePars: pars, gross: 37, par: 36 },
      { holes: 18, holeScores: null, holePars: null, gross: 90, par: 72 },
      { holes: 9, holeScores: [5, null, null, null, null, null, null, null, null], holePars: pars, gross: null, par: 36 },
    ]);
    expect(c.rounds).toBe(3);
    expect(c.holesPlayed).toBe(9 + 18 + 1);
    expect(c.strokes).toBe(37 + 90 + 5);
    expect(c.aces).toBe(1);
    expect(c.eagles).toBe(0); // the ace on a par 3 counts as an ace, not an eagle
    expect(c.birdies).toBe(1);
    expect(c.pars).toBe(6);
    expect(c.bogeys).toBe(1);
    expect(c.doubles).toBe(1);
    expect(c.best9).toEqual({ gross: 37, toPar: 1 });
    expect(c.best18).toEqual({ gross: 90, toPar: 18 });
  });
});

describe('headToHead', () => {
  it('counts wins, losses and ties, newest first', () => {
    const r = headToHead([
      { matchId: 'a', playedOn: '2026-01-01', mine: 1, theirs: 2, myScore: 80, theirScore: 85, stableford: false },
      { matchId: 'b', playedOn: '2026-02-01', mine: 2, theirs: 1, myScore: 90, theirScore: 88, stableford: false },
      { matchId: 'c', playedOn: '2026-03-01', mine: 1, theirs: 1, myScore: 84, theirScore: 84, stableford: false },
      { matchId: 'd', playedOn: '2026-04-01', mine: null, theirs: 1, myScore: null, theirScore: 70, stableford: false },
    ]);
    expect([r.wins, r.losses, r.ties]).toEqual([1, 1, 1]);
    expect(r.last?.matchId).toBe('c');
  });
});

describe('holeStats', () => {
  it('averages each course hole, with back nines in the right place', () => {
    const s = holeStats([
      { holeNumbers: [1, 2], holeScores: [4, 6], holePars: [4, 5] },
      { holeNumbers: [1, 2], holeScores: [6, null], holePars: [4, 5] },
      { holeNumbers: [10, 11], holeScores: [3, 3], holePars: [3, 4] },
    ]);
    expect(s.map((h) => h.hole)).toEqual([1, 2, 10, 11]);
    expect(s[0]).toMatchObject({ played: 2, average: 5, best: 4, overPar: 1 });
    expect(s[3]).toMatchObject({ overPar: -1 });
  });
});
