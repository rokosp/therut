import type { PlayerResult } from './scoring';

export interface StandingRow {
  userId: string;
  rank: number;
  played: number;
  wins: number;
  placePoints: number;
  bonusPoints: number;
  total: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * League table from finished matches. Ordered by total points.
 * Players level on points share a rank (tie breakers only apply inside a match).
 */
export function buildStandings(memberIds: string[], matchResults: PlayerResult[][]): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    memberIds.map((id) => [id, { userId: id, rank: 0, played: 0, wins: 0, placePoints: 0, bonusPoints: 0, total: 0 }]),
  );
  for (const results of matchResults) {
    for (const r of results) {
      let row = rows.get(r.userId);
      if (!row) {
        // A player who left the league keeps their history in the table.
        row = { userId: r.userId, rank: 0, played: 0, wins: 0, placePoints: 0, bonusPoints: 0, total: 0 };
        rows.set(r.userId, row);
      }
      if (r.position != null) row.played += 1;
      if (r.position === 1 && !r.tied) row.wins += 1;
      row.placePoints = round1(row.placePoints + r.placePoints);
      row.bonusPoints = round1(row.bonusPoints + r.bonusPoints);
      row.total = round1(row.total + r.total);
    }
  }
  const sorted = [...rows.values()].sort((a, b) => b.total - a.total || b.wins - a.wins);
  sorted.forEach((row, i) => {
    row.rank = i > 0 && sorted[i - 1].total === row.total ? sorted[i - 1].rank : i + 1;
  });
  return sorted;
}
