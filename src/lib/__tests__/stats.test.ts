import { describe, expect, it } from 'vitest';

import { matchHappenings, seasonAwards, type SeasonCard } from '../stats';

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
