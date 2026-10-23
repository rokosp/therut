import { describe, expect, it } from 'vitest';
import { buildCommentary } from '../commentary';

const base = { holes: 3, holePars: [4, 3, 5], strokeIndex: null, scoring: 'gross' as const };

describe('buildCommentary', () => {
  it('calls hole wins, shout-outs and lead changes, newest first', () => {
    const lines = buildCommentary({
      ...base,
      players: [
        { userId: 'a', name: 'Ana', holeScores: [4, 6, 9], courseHandicap: 0 },
        { userId: 'b', name: 'Bo', holeScores: [6, 2, 5], courseHandicap: 0 },
      ],
    }).map((l) => l.text);
    expect(lines).toEqual([
      'Bo wins hole 3 by 4 strokes!',
      'Ana shot a 9 on hole 3, yikes!',
      'Bo takes the lead after 2 holes.',
      'Bo wins hole 2 by 4 strokes!',
      'Bo birdies hole 2.',
      'Ana takes a triple on hole 2. Shake it off.',
      'Ana leads after 1 hole.',
      'Ana wins hole 1 by 2 strokes.',
    ]);
  });

  it('waits for everyone before calling a hole, and handles halves', () => {
    const lines = buildCommentary({
      ...base,
      players: [
        { userId: 'a', name: 'Ana', holeScores: [4, 3, null], courseHandicap: 0 },
        { userId: 'b', name: 'Bo', holeScores: [4, null, null], courseHandicap: 0 },
      ],
    }).map((l) => l.text);
    expect(lines).toEqual(['All square after 1 hole.', 'Hole 1 halved.']);
  });

  it('uses net strokes when the league plays net', () => {
    const lines = buildCommentary({
      ...base,
      holes: 1,
      holePars: [4],
      scoring: 'net',
      players: [
        { userId: 'a', name: 'Ana', holeScores: [4], courseHandicap: 0 },
        { userId: 'b', name: 'Bo', holeScores: [4], courseHandicap: 1 },
      ],
    }).map((l) => l.text);
    expect(lines[1]).toBe('Bo wins hole 1 by 1 stroke net.');
  });
});
