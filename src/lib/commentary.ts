import { strokesPerHole } from './handicap';
import type { ScoringBasis } from './types';

export interface CommentaryPlayer {
  userId: string;
  name: string;
  holeScores: (number | null)[] | null;
  courseHandicap: number;
}

export interface CommentaryLine {
  /** Hole index (0-based within the match). */
  hole: number;
  kind: 'hole' | 'great' | 'ouch' | 'lead';
  text: string;
}

const s = (n: number) => (n === 1 ? 'stroke' : 'strokes');

function joinNames(names: string[]) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Turns hole scores into a running commentary, newest first.
 * Hole wins and lead changes use the league's scoring basis (net uses strokes received per hole).
 * Shout-outs (birdies, blow-ups) are on gross scores.
 */
export function buildCommentary(opts: {
  players: CommentaryPlayer[];
  holes: number;
  holePars: number[] | null;
  strokeIndex: number[] | null;
  scoring: ScoringBasis;
  /** Added to the hole index for display, e.g. 9 for a back nine. */
  holeOffset?: number;
}): CommentaryLine[] {
  const { players, holes, holePars, strokeIndex, scoring } = opts;
  const offset = opts.holeOffset ?? 0;
  const lines: CommentaryLine[] = [];
  const strokes = new Map(players.map((p) => [p.userId, strokesPerHole(p.courseHandicap, holes, strokeIndex)]));
  const net = scoring === 'net';
  const running = new Map(players.map((p) => [p.userId, 0]));
  let leaders: string[] = [];
  let allInSoFar = true;

  for (let i = 0; i < holes; i++) {
    const label = `hole ${i + 1 + offset}`;
    const par = holePars?.[i] ?? null;
    const scored = players.filter((p) => p.holeScores?.[i] != null);

    // Shout-outs for anyone who has a score on this hole.
    for (const p of scored) {
      const g = p.holeScores![i] as number;
      if (g === 1) lines.push({ hole: i, kind: 'great', text: `HOLE IN ONE! ${p.name} aces ${label}!` });
      else if (par != null && g <= par - 3) lines.push({ hole: i, kind: 'great', text: `Albatross! ${p.name} makes ${g} on the par ${par} ${label}.` });
      else if (par != null && g === par - 2) lines.push({ hole: i, kind: 'great', text: `Eagle! ${p.name} makes ${g} on the par ${par} ${label}.` });
      else if (par != null && g === par - 1) lines.push({ hole: i, kind: 'great', text: `${p.name} birdies ${label}.` });
      else if (par != null ? g >= par + 4 : g >= 9) lines.push({ hole: i, kind: 'ouch', text: `${p.name} shot a ${g} on ${label}, yikes!` });
      else if (par != null && g === par + 3) lines.push({ hole: i, kind: 'ouch', text: `${p.name} takes a triple on ${label}. Shake it off.` });
    }

    // Head-to-head lines only once everyone has finished the hole.
    if (players.length < 2 || scored.length < players.length) {
      allInSoFar = false;
      continue;
    }
    const score = (p: CommentaryPlayer) => (p.holeScores![i] as number) - (net ? strokes.get(p.userId)![i] : 0);
    const sorted = [...players].sort((a, b) => score(a) - score(b));
    const best = score(sorted[0]);
    const winners = sorted.filter((p) => score(p) === best);
    if (winners.length === 1) {
      const margin = score(sorted[1]) - best;
      lines.push({
        hole: i,
        kind: 'hole',
        text: `${winners[0].name} wins ${label} by ${margin} ${s(margin)}${net ? ' net' : ''}${margin >= 3 ? '!' : '.'}`,
      });
    } else if (winners.length === players.length) {
      lines.push({ hole: i, kind: 'hole', text: `${label[0].toUpperCase()}${label.slice(1)} halved${net ? ' (net)' : ''}.` });
    } else {
      lines.push({ hole: i, kind: 'hole', text: `${joinNames(winners.map((p) => p.name))} share ${label}.` });
    }

    // Lead changes, only while every earlier hole is complete so totals are comparable.
    if (!allInSoFar) continue;
    for (const p of players) running.set(p.userId, running.get(p.userId)! + score(p));
    const low = Math.min(...running.values());
    const now = players.filter((p) => running.get(p.userId) === low).map((p) => p.userId);
    const same = now.length === leaders.length && now.every((id) => leaders.includes(id));
    if (!same) {
      const names = now.map((id) => players.find((p) => p.userId === id)!.name);
      const after = `after ${i + 1} ${i === 0 ? 'hole' : 'holes'}`;
      lines.push({
        hole: i,
        kind: 'lead',
        text:
          names.length === 1
            ? `${names[0]} ${leaders.length === 0 ? 'leads' : 'takes the lead'} ${after}.`
            : names.length === players.length
              ? `All square ${after}.`
              : `${joinNames(names)} tied for the lead ${after}.`,
      });
      leaders = now;
    }
  }
  return lines.reverse();
}
