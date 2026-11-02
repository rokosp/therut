/** Helpers for turning a scanned paper scorecard into match scores. */

export type CardRow = { name: string; scores: (number | null)[] };
export type MatchPerson = { id: string; names: string[] };

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** How well a name written on the card fits a player's names (0 = not at all). */
export function nameFit(written: string, names: string[]): number {
  const w = norm(written);
  if (!w) return 0;
  let best = 0;
  for (const raw of names) {
    const n = norm(raw);
    if (!n) continue;
    const words = n.split(' ');
    const initials = words.map((x) => x[0]).join('');
    let s = 0;
    if (w === n) s = 10;
    else if (words.includes(w) || w.split(' ').some((x) => x.length > 1 && words.includes(x))) s = 8;
    else if (n.startsWith(w) || w.startsWith(n)) s = 6;
    else if (w.replace(/ /g, '') === initials) s = 5;
    else if (w.length >= 3 && n.includes(w)) s = 4;
    else if (w[0] === n[0]) s = 1;
    best = Math.max(best, s);
  }
  return best;
}

/**
 * Pairs each card row with a match player, best fits first. A player gets at most one row.
 * Rows nobody fits stay unpaired (null) so the person reviewing can pick.
 */
export function pairRows(rows: CardRow[], people: MatchPerson[]): (string | null)[] {
  const pairs: { row: number; id: string; fit: number }[] = [];
  rows.forEach((r, i) => people.forEach((p) => pairs.push({ row: i, id: p.id, fit: nameFit(r.name, p.names) })));
  pairs.sort((a, b) => b.fit - a.fit || a.row - b.row);
  const out: (string | null)[] = rows.map(() => null);
  const used = new Set<string>();
  for (const p of pairs) {
    if (p.fit <= 0 || out[p.row] != null || used.has(p.id)) continue;
    out[p.row] = p.id;
    used.add(p.id);
  }
  // Same number of rows as players and only one left on each side: pair them.
  const freeRows = out.map((v, i) => (v == null ? i : -1)).filter((i) => i >= 0);
  const freePeople = people.filter((p) => !used.has(p.id));
  if (freeRows.length === 1 && freePeople.length === 1) out[freeRows[0]] = freePeople[0].id;
  return out;
}

/** Exactly `holes` scores, each a whole number from 1 to 20 or empty. */
export function cleanScores(scores: unknown[], holes: number): (number | null)[] {
  return Array.from({ length: holes }, (_, i) => {
    const v = scores?.[i];
    const n = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN;
    return Number.isInteger(n) && n >= 1 && n <= 20 ? n : null;
  });
}

/** The first hole (from 0) that someone still needs a score on, or the last hole if all are done. */
export function nextHoleToPlay(cards: ((number | null)[] | null | undefined)[], holes: number): number {
  for (let i = 0; i < holes; i++) {
    if (cards.some((c) => c?.[i] == null)) return i;
  }
  return Math.max(0, holes - 1);
}

/** "+3", "E" or "−1" against par for the holes played so far, and how many holes that is. */
export function toParSoFar(scores: (number | null)[] | null | undefined, pars: number[] | null | undefined) {
  let diff = 0;
  let thru = 0;
  (scores ?? []).forEach((s, i) => {
    const par = pars?.[i];
    if (s == null || par == null) return;
    diff += s - par;
    thru += 1;
  });
  const label = diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `−${-diff}`;
  return { diff, thru, label };
}
