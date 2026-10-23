import { describe, expect, it } from 'vitest';

import { computeAchievements, type AchRound } from '../achievements';

const pars9 = [4, 3, 5, 4, 4, 3, 5, 4, 4];
const round = (scores: number[], extra: Partial<AchRound> = {}): AchRound => ({
  matchId: Math.random().toString(),
  playedOn: '2026-10-21',
  teeHour: 10,
  courseId: 'c1',
  courseHoles: 9,
  firstHole: 1,
  holes: scores.length,
  holeScores: scores,
  holePars: scores.length === 9 ? pars9 : [...pars9, ...pars9],
  gross: scores.reduce((a, b) => a + b, 0),
  par: scores.length === 9 ? 36 : 72,
  final: true,
  won: false,
  solo: false,
  bonuses: 0,
  ...extra,
});
const get = (list: ReturnType<typeof computeAchievements>, id: string) => list.find((a) => a.id === id)!;

describe('computeAchievements', () => {
  it('starts with nothing earned', () => {
    const list = computeAchievements({ rounds: [], leagueWins: 0 });
    expect(list.every((a) => !a.earned)).toBe(true);
    expect(new Set(list.map((a) => a.id)).size).toBe(list.length);
  });

  it('counts holes, strokes and rounds', () => {
    const list = computeAchievements({
      rounds: [round([3, 2, 5, 3, 8, 3, 5, 4, 1], { won: true })],
      leagueWins: 1,
    });
    expect(get(list, 'played-1').earned).toBe(true);
    expect(get(list, 'birdie').earned).toBe(true);
    expect(get(list, 'ace').earned).toBe(true);
    expect(get(list, 'eagle').earned).toBe(false); // an ace isn't also an eagle
    expect(get(list, 'snowman').earned).toBe(true);
    expect(get(list, 'double-ds').earned).toBe(false);
    expect(get(list, 'birdie-party').earned).toBe(true);
    expect(get(list, 'comeback').earned).toBe(true);
    expect(get(list, 'champion').earned).toBe(true);
    expect(get(list, 'strokes-100').value).toBe(34);
    expect(get(list, 'even-keel').earned).toBe(true);
  });

  it("tracks hat tricks, par'd courses and weekends", () => {
    const evens = round(pars9, { won: true, playedOn: '2026-10-24' }); // Saturday
    const list = computeAchievements({
      rounds: [
        round(
          pars9.map((p, i) => (i < 5 ? p : p + 1)),
          { won: true, playedOn: '2026-10-20' },
        ),
        round(
          pars9.map((p, i) => (i >= 5 ? p : p + 1)),
          { won: true, playedOn: '2026-10-22' },
        ),
        evens,
        round(
          pars9.map((p) => p + 1),
          { playedOn: '2026-10-25' },
        ), // Sunday
      ],
      leagueWins: 0,
    });
    expect(get(list, 'hat-trick').earned).toBe(true);
    expect(get(list, 'every-hole').earned).toBe(true);
    expect(get(list, 'weekend').earned).toBe(true);
    expect(get(list, 'bogey-free').earned).toBe(true);
    expect(get(list, 'played-10').value).toBe(4);
  });

  it('needs an 18-hole round to break 100', () => {
    const nine = computeAchievements({ rounds: [round(pars9)], leagueWins: 0 });
    expect(get(nine, 'broke-100').earned).toBe(false);
    const eighteen = computeAchievements({ rounds: [round([...pars9, ...pars9].map((p) => p + 1))], leagueWins: 0 });
    expect(get(eighteen, 'broke-100').earned).toBe(true);
    expect(get(eighteen, 'broke-90').earned).toBe(false);
    expect(get(eighteen, 'broke-140').earned).toBe(true);
  });

  it('reads margins, rivals, long days and wild rounds', () => {
    const r18 = (extra: Partial<AchRound>) => round([...pars9, ...pars9], extra);
    const list = computeAchievements({
      rounds: [
        r18({ won: true, winMargin: 1, playedOn: '2026-10-01', opponents: [{ id: 'jela', result: 'won' }] }),
        r18({
          playedOn: '2026-10-01',
          teeHour: 18,
          opponents: [
            { id: 'jela', result: 'lost' },
            { id: 'adrian', result: 'lost' },
          ],
        }),
        r18({ playedOn: '2026-10-02', opponents: [{ id: 'jela', result: 'lost' }] }),
        round([3, 3, 8, 4, 4, 3, 5, 4, 4]),
      ],
      leagueWins: 0,
    });
    expect(get(list, 'photo-finish').earned).toBe(true);
    expect(get(list, 'blowout').earned).toBe(false);
    expect(get(list, 'iron-man').earned).toBe(true);
    expect(get(list, 'night-owl').earned).toBe(true);
    expect(get(list, 'roller-coaster').earned).toBe(true);
    expect(get(list, 'nemesis').earned).toBe(true); // Jela beat me twice, but I beat her once
    expect(get(list, 'rivalry').value).toBe(3);
  });
});
