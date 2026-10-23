import { playedHoles, type CourseInfo, type TeeInfo } from './course';
import { calculateHandicap, type HandicapResult, type HandicapRound } from './handicap';
import { scoreMatch, type PlayerResult } from './scoring';
import { supabase } from './supabase';
import { withDefaults, type LeagueSettings, type MatchKind } from './types';

// Row shapes --------------------------------------------------------------

export interface Profile {
  id: string;
  display_name: string;
  nickname: string | null;
  self_handicap: number | null;
}

export interface Tee extends TeeInfo {
  id: string;
  course_id: string;
  name: string;
  sort_order: number;
}

export interface Course extends CourseInfo {
  id: string;
  name: string;
  club_name: string;
  course_tees: Tee[];
}

export interface League {
  id: string;
  name: string;
  season: string | null;
  join_code: string;
  settings: Partial<LeagueSettings>;
  created_by: string;
}

export interface Member {
  user_id: string;
  role: 'admin' | 'member';
  profiles: Profile;
}

export interface MatchPlayerRow {
  match_id: string;
  user_id: string;
  tee_id: string | null;
  hole_scores: (number | null)[] | null;
  gross: number | null;
  course_handicap: number;
  playoff_rank: number | null;
}

export interface BonusRow {
  id: string;
  match_id: string;
  user_id: string;
  type_key: string | null;
  label: string;
  points: number;
  hole: number | null;
  created_by: string;
}

export interface MatchRow {
  id: string;
  league_id: string;
  course_id: string | null;
  tee_id: string | null;
  played_on: string;
  kind: MatchKind;
  holes: 9 | 18;
  nine: 'front' | 'back' | null;
  status: 'open' | 'final';
  notes: string | null;
  created_by: string;
  match_players: MatchPlayerRow[];
  bonus_awards: BonusRow[];
}

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

const MATCH_SELECT = '*, match_players(*), bonus_awards(*)';

// Profiles ----------------------------------------------------------------

export async function getProfile(id: string): Promise<Profile> {
  return check(await supabase.from('profiles').select('id, display_name, nickname, self_handicap').eq('id', id).single());
}

export async function updateProfile(id: string, patch: Partial<Omit<Profile, 'id'>>) {
  check(await supabase.from('profiles').update(patch).eq('id', id));
}

// Courses -----------------------------------------------------------------

export async function listCourses(): Promise<Course[]> {
  const rows = check(await supabase.from('courses').select('*, course_tees(*)').order('name'));
  return rows.map((c: Course) => ({ ...c, course_tees: [...c.course_tees].sort((a, b) => a.sort_order - b.sort_order) }));
}

export function teeLabel(t: Tee): string {
  if (t.course_rating == null || t.slope == null) return t.name;
  return `${t.name} · ${Number(t.course_rating).toFixed(1)} / ${t.slope}`;
}

// Leagues -----------------------------------------------------------------

export async function listLeagues(): Promise<League[]> {
  return check(await supabase.from('leagues').select('*').order('created_at', { ascending: false }));
}

export async function createLeague(name: string, season: string | null): Promise<League> {
  return check(await supabase.from('leagues').insert({ name, season }).select().single());
}

export async function joinLeague(code: string): Promise<string> {
  return check(await supabase.rpc('join_league', { code }));
}

export async function updateLeague(id: string, patch: Partial<Pick<League, 'name' | 'season' | 'settings'>>) {
  check(await supabase.from('leagues').update(patch).eq('id', id));
}

export async function removeMember(leagueId: string, userId: string) {
  check(await supabase.from('league_members').delete().eq('league_id', leagueId).eq('user_id', userId));
}

export async function setMemberRole(leagueId: string, userId: string, role: 'admin' | 'member') {
  check(await supabase.from('league_members').update({ role }).eq('league_id', leagueId).eq('user_id', userId));
}

export interface LeagueBundle {
  league: League;
  settings: LeagueSettings;
  members: Member[];
  matches: MatchRow[];
}

export async function getLeague(id: string): Promise<LeagueBundle> {
  const [league, members, matches] = await Promise.all([
    supabase.from('leagues').select('*').eq('id', id).single(),
    supabase
      .from('league_members')
      .select('user_id, role, profiles(id, display_name, nickname, self_handicap)')
      .eq('league_id', id),
    supabase.from('matches').select(MATCH_SELECT).eq('league_id', id).order('played_on', { ascending: false }),
  ]);
  const l = check(league) as League;
  return {
    league: l,
    settings: withDefaults(l.settings),
    members: check(members) as unknown as Member[],
    matches: check(matches) as MatchRow[],
  };
}

// Matches -----------------------------------------------------------------

export async function getMatch(id: string): Promise<MatchRow> {
  return check(await supabase.from('matches').select(MATCH_SELECT).eq('id', id).single());
}

export async function createMatch(input: {
  leagueId: string;
  courseId: string | null;
  teeId: string | null;
  playedOn: string;
  kind: MatchKind;
  holes: 9 | 18;
  nine: 'front' | 'back' | null;
  players: { userId: string; teeId: string | null; courseHandicap: number }[];
}): Promise<string> {
  const match = check(
    await supabase
      .from('matches')
      .insert({
        league_id: input.leagueId,
        course_id: input.courseId,
        tee_id: input.teeId,
        played_on: input.playedOn,
        kind: input.kind,
        holes: input.holes,
        nine: input.nine,
      })
      .select('id')
      .single(),
  ) as { id: string };
  check(
    await supabase
      .from('match_players')
      .insert(
        input.players.map((p) => ({
          match_id: match.id,
          user_id: p.userId,
          tee_id: p.teeId,
          course_handicap: p.courseHandicap,
        })),
      ),
  );
  return match.id;
}

export async function saveScore(
  matchId: string,
  userId: string,
  patch: Partial<Pick<MatchPlayerRow, 'hole_scores' | 'gross' | 'playoff_rank' | 'course_handicap' | 'tee_id'>>,
) {
  check(await supabase.from('match_players').update(patch).eq('match_id', matchId).eq('user_id', userId));
}

export async function setMatchStatus(id: string, status: 'open' | 'final') {
  check(await supabase.from('matches').update({ status }).eq('id', id));
}

export async function deleteMatch(id: string) {
  check(await supabase.from('matches').delete().eq('id', id));
}

export async function addBonus(b: { matchId: string; userId: string; typeKey: string | null; label: string; points: number; hole?: number | null }) {
  check(
    await supabase.from('bonus_awards').insert({
      match_id: b.matchId,
      user_id: b.userId,
      type_key: b.typeKey,
      label: b.label,
      points: b.points,
      hole: b.hole ?? null,
    }),
  );
}

export async function removeBonus(id: string) {
  check(await supabase.from('bonus_awards').delete().eq('id', id));
}

// Derived -----------------------------------------------------------------

/** Holes, par and rating for a match. Pass a player's own tee to get their numbers. */
export function holesFor(
  match: Pick<MatchRow, 'holes' | 'nine' | 'course_id' | 'tee_id'>,
  courses: Course[],
  playerTeeId?: string | null,
) {
  const course = courses.find((c) => c.id === match.course_id) ?? null;
  const tee = course?.course_tees.find((t) => t.id === (playerTeeId ?? match.tee_id)) ?? null;
  return { course, tee, played: playedHoles(match, course, tee) };
}

export function resultsFor(match: MatchRow, settings: LeagueSettings): PlayerResult[] {
  return scoreMatch(
    { kind: match.kind, holes: match.holes },
    match.match_players.map((p) => ({
      userId: p.user_id,
      holeScores: p.hole_scores,
      gross: p.gross,
      courseHandicap: p.course_handicap,
      playoffRank: p.playoff_rank,
    })),
    settings,
    match.bonus_awards.map((b) => ({ userId: b.user_id, points: Number(b.points) })),
  );
}

/** Every scored round for these players that the signed-in user can see, keyed by player. */
export async function handicapsFor(userIds: string[], courses: Course[]): Promise<Map<string, HandicapResult>> {
  const out = new Map<string, HandicapResult>();
  if (userIds.length === 0) return out;
  const rows = check(
    await supabase
      .from('match_players')
      .select('user_id, tee_id, hole_scores, gross, matches(id, played_on, holes, nine, course_id, tee_id)')
      .in('user_id', userIds),
  ) as unknown as (MatchPlayerRow & { matches: Pick<MatchRow, 'id' | 'played_on' | 'holes' | 'nine' | 'course_id' | 'tee_id'> })[];

  const byUser = new Map<string, HandicapRound[]>();
  for (const r of rows) {
    const m = r.matches;
    const { played } = holesFor(m, courses, r.tee_id);
    const complete = r.hole_scores && r.hole_scores.length === played.holes && r.hole_scores.every((s) => s != null && s > 0);
    const gross = complete ? (r.hole_scores as number[]).reduce((a, b) => a + b, 0) : r.gross;
    if (gross == null) continue;
    const list = byUser.get(r.user_id) ?? [];
    list.push({
      id: m.id,
      playedOn: m.played_on,
      holes: played.holes,
      gross,
      holeScores: complete ? r.hole_scores : null,
      holePars: played.holePars,
      strokeIndex: played.strokeIndex,
      courseRating: played.courseRating,
      slope: played.slope,
      par: played.par,
    });
    byUser.set(r.user_id, list);
  }
  for (const id of userIds) out.set(id, calculateHandicap(byUser.get(id) ?? []));
  return out;
}

/** The index a league uses for net scoring: app or self-entered, falling back to the other. */
export function playingIndex(settings: LeagueSettings, app: number | null | undefined, self: number | null | undefined) {
  const a = app ?? null;
  const s = self != null ? Number(self) : null;
  return settings.handicapSource === 'self' ? (s ?? a) : (a ?? s);
}

export function displayName(p: Pick<Profile, 'display_name' | 'nickname'> | undefined | null) {
  if (!p) return 'Unknown';
  return p.nickname || p.display_name || 'Player';
}
