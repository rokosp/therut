/** Ranks saved courses for the course search box. */
export interface SearchableCourse {
  id: string;
  name: string;
  club_name: string;
  city?: string | null;
  country?: string | null;
}

const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** How well a course matches: 3 = name starts with it, 2 = a word starts with it, 1 = inside a name, 0.5 = place only. */
export function matchQuality(c: SearchableCourse, q: string): number {
  const query = norm(q).trim();
  if (!query) return 1;
  const names = [norm(c.name), norm(c.club_name)];
  if (names.some((n) => n.startsWith(query))) return 3;
  if (names.some((n) => n.split(/[^a-z0-9]+/).some((w) => w.startsWith(query)))) return 2;
  if (names.some((n) => n.includes(query))) return 1;
  if ([norm(c.city), norm(c.country)].some((n) => n.includes(query))) return 0.5;
  return 0;
}

/**
 * The best few matches. Strong matches (name or word starts with what was typed) come first,
 * and within those, courses you've played most come first.
 */
export function rankCourses<C extends SearchableCourse>(
  courses: C[],
  q: string,
  played: Record<string, number>,
  limit = 4,
): C[] {
  return courses
    .map((c) => ({ c, quality: matchQuality(c, q), played: played[c.id] ?? 0 }))
    .filter((x) => x.quality > 0)
    .sort(
      (a, b) =>
        Number(b.quality >= 2) - Number(a.quality >= 2) ||
        b.played - a.played ||
        b.quality - a.quality ||
        a.c.name.localeCompare(b.c.name),
    )
    .slice(0, limit)
    .map((x) => x.c);
}
