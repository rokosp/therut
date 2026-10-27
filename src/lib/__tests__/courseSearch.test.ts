import { describe, expect, it } from 'vitest';

import { rankCourses } from '../courseSearch';

const c = (id: string, name: string, city = '', country = '') => ({ id, name, club_name: name, city, country });
const all = [
  c('rc', 'Riverside Championship', 'Zagreb', 'Croatia'),
  c('mk', 'Golf Castle Mokrice', 'Brežice', 'Slovenia'),
  c('pb', 'Pebble Beach', 'Pebble Beach', 'United States'),
  c('wm', 'Wimbledon Park', 'London'),
  c('ml', 'Mission Hills'),
  c('mt', 'Marriott Tudor Park'),
];

describe('rankCourses', () => {
  it('shows at most 4, played courses first among strong matches', () => {
    const r = rankCourses(all, 'm', { mk: 3, rc: 10 });
    expect(r.map((x) => x.id)).toEqual(['mk', 'mt', 'ml', 'rc']);
  });
  it('ignores accents and matches places last', () => {
    expect(rankCourses(all, 'brezice', {}).map((x) => x.id)).toEqual(['mk']);
    expect(rankCourses(all, 'slovenia', {}).map((x) => x.id)).toEqual(['mk']);
  });
  it('with nothing typed, lists played courses first', () => {
    expect(
      rankCourses(all, '', { pb: 1, rc: 5 })
        .map((x) => x.id)
        .slice(0, 2),
    ).toEqual(['rc', 'pb']);
  });
});
