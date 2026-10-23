import { computeAchievements, type AchRound } from './achievements';
import { playedHoles, type CourseInfo, type TeeInfo } from './course';
import { calculateHandicap, type HandicapResult, type HandicapRound } from './handicap';
import { scoreMatch, type PlayerResult } from './scoring';
import { buildStandings } from './standings';
import { careerHighlights, type CareerRound } from './stats';
import { supabase } from './supabase';
import { withDefaults, type LeagueSettings, type MatchFormat, type MatchKind } from './types';

// Row shapes --------------------------------------------------------------

export interface Profile {
  id: string;
  display_name: string;
  nickname: string | null;
  self_handicap: number | null;
  /** Last app handicap the player's own app worked out, shown to non-friends. */
  app_handicap?: number | null;
  /** On scorecards but has no account yet; a league admin can share a claim code. */
  is_guest?: boolean;
  /** Public URL of the profile photo, if they added one. */
  avatar_url?: string | null;
  /** Achievement ids picked to show off on the profile (up to 4). */
  showcase?: string[] | null;
}

// app_handicap arrives with the friends migration; until that runs, fall back to the older columns.
// '*' so newer optional columns (app_handicap, is_guest) come along once their migration has run.
let PROFILE_COLS = '*';
async function withProfileCols<T>(
  run: (cols: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<{ data: T | null; error: { message: string } | null }> {
  const res = (await run(PROFILE_COLS)) as { data: T | null; error: { message: string } | null };
  if (res.error && PROFILE_COLS.includes('app_handicap') && res.error.message.includes('app_handicap')) {
    PROFILE_COLS = 'id, display_name, nickname, self_handicap';
    return (await run(PROFILE_COLS)) as { data: T | null; error: { message: string } | null };
  }
  return res;
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
  city?: string | null;
  country?: string | null;
  course_tees: Tee[];
}

export interface League {
  id: string;
  name: string;
  season: string | null;
  join_code: string;
  settings: Partial<LeagueSettings>;
  created_by: string;
  /** Set once the season is finished; everything in the league is locked after that. */
  finished_at?: string | null;
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
  /** Null for a casual match outside any league. */
  league_id: string | null;
  /** Code friends use to join (casual matches). */
  join_code?: string | null;
  course_id: string | null;
  tee_id: string | null;
  played_on: string;
  kind: MatchKind;
  /** Missing until the match format migration has run; treat as stroke play. */
  format?: MatchFormat | null;
  holes: 9 | 18;
  nine: 'front' | 'back' | null;
  /** scheduled = planned for later, open = being played, final = finished. */
  status: 'scheduled' | 'open' | 'final';
  /** Tee time for a scheduled match. */
  starts_at?: string | null;
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

export async function getProfile(id: string): Promise<Profile & { created_at: string }> {
  return check(
    await withProfileCols<Profile & { created_at: string }>((cols) =>
      supabase.from('profiles').select(`${cols}, created_at`).eq('id', id).single(),
    ),
  );
}

/** Matches played and won, plus leagues played and won (finished seasons only), that I can see. */
export async function playerStats(userId: string) {
  const empty = {
    rounds: 0,
    avg18: null as number | null,
    wins: 0,
    leagues: 0,
    leagueWins: 0,
    career: careerHighlights([]),
    achievements: computeAchievements({ rounds: [], leagueWins: 0 }),
  };
  const mine = check(await supabase.from('match_players').select('match_id').eq('user_id', userId)) as {
    match_id: string;
  }[];
  if (mine.length === 0) return empty;
  const matches = check(
    await supabase
      .from('matches')
      .select(`${MATCH_SELECT}, leagues(settings, finished_at)`)
      .in(
        'id',
        mine.map((m) => m.match_id),
      ),
  ) as (MatchRow & { leagues: { settings: Partial<LeagueSettings>; finished_at: string | null } | null })[];
  const courses = await listCourses();
  let rounds = 0;
  let wins = 0;
  const grosses: number[] = [];
  const careerRounds: CareerRound[] = [];
  const achRounds: AchRound[] = [];
  for (const m of matches) {
    const mp = m.match_players.find((p) => p.user_id === userId);
    if (mp) {
      const { played } = holesFor(m, courses, mp.tee_id);
      const complete = mp.hole_scores?.length === played.holes && mp.hole_scores.every((s) => s != null);
      careerRounds.push({
        holes: played.holes,
        holeScores: mp.hole_scores,
        holePars: played.holePars,
        gross: complete ? (mp.hole_scores as number[]).reduce((a, b) => a + b, 0) : mp.gross,
        par: played.par,
      });
    }
    const r = resultsFor(m, withDefaults(m.leagues?.settings), courses).find((x) => x.userId === userId);
    if (mp) {
      const { course, played } = holesFor(m, courses, mp.tee_id);
      achRounds.push({
        matchId: m.id,
        playedOn: m.played_on,
        teeHour: teeHourOf(m),
        courseId: m.course_id,
        courseHoles: course?.holes ?? null,
        firstHole: m.nine === 'back' ? 10 : 1,
        holes: played.holes,
        holeScores: mp.hole_scores,
        holePars: played.holePars,
        gross: careerRounds[careerRounds.length - 1].gross,
        par: played.par,
        final: m.status === 'final',
        won: m.status === 'final' && r?.position === 1 && !r.tied && m.match_players.length > 1,
        solo: m.match_players.length === 1,
        bonuses: m.bonus_awards.filter((b) => b.user_id === userId).length,
      });
    }
    if (!r || r.gross == null) continue;
    rounds += 1;
    if (m.holes === 18) grosses.push(r.gross);
    if (m.status === 'final' && r.position === 1 && !r.tied) wins += 1;
  }
  const avg18 = grosses.length ? Math.round((grosses.reduce((a, b) => a + b, 0) / grosses.length) * 10) / 10 : null;

  // Leagues: any league they've played a match in; a win is top of the table when the season finished.
  const leagueIds = [...new Set(matches.map((m) => m.league_id).filter((x): x is string => !!x))];
  const finished = [...new Set(matches.filter((m) => m.league_id && m.leagues?.finished_at).map((m) => m.league_id!))];
  let leagueWins = 0;
  for (const lid of finished) {
    const { matches: all, settings, members } = await getLeague(lid);
    const table = buildStandings(
      members.map((x) => x.user_id),
      all.filter((x) => x.status === 'final').map((x) => resultsFor(x, settings, courses)),
    );
    if (table.find((t) => t.userId === userId)?.rank === 1) leagueWins += 1;
  }
  return {
    rounds,
    avg18,
    wins,
    leagues: leagueIds.length,
    leagueWins,
    career: careerHighlights(careerRounds),
    achievements: computeAchievements({ rounds: achRounds, leagueWins }),
  };
}

/** Local tee-off hour: the planned tee time, or when the match was started on the day itself. */
function teeHourOf(m: MatchRow & { created_at?: string }): number | null {
  if (m.starts_at) return new Date(m.starts_at).getHours();
  if (!m.created_at) return null;
  const d = new Date(m.created_at);
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return local === m.played_on ? d.getHours() : null;
}

export async function updateProfile(id: string, patch: Partial<Omit<Profile, 'id'>>) {
  check(await supabase.from('profiles').update(patch).eq('id', id));
}

export async function getProfiles(ids: string[]): Promise<Profile[]> {
  if (ids.length === 0) return [];
  return check(await withProfileCols<Profile[]>((cols) => supabase.from('profiles').select(cols).in('id', ids)));
}

/** Save my latest app handicap on my profile so non-friends can see it. */
export async function syncMyHandicap(id: string, index: number | null, rounds: number) {
  await supabase.from('profiles').update({ app_handicap: index, app_handicap_rounds: rounds }).eq('id', id);
}

// Friends -----------------------------------------------------------------

export interface Friendship {
  requester: string;
  addressee: string;
  status: 'pending' | 'accepted';
}

export type FriendState = 'none' | 'friends' | 'sent' | 'received';

export async function listFriendships(): Promise<Friendship[]> {
  return check(await supabase.from('friendships').select('requester, addressee, status'));
}

export function friendState(me: string, other: string, all: Friendship[]): FriendState {
  const f = all.find(
    (x) => (x.requester === me && x.addressee === other) || (x.requester === other && x.addressee === me),
  );
  if (!f) return 'none';
  if (f.status === 'accepted') return 'friends';
  return f.requester === me ? 'sent' : 'received';
}

export async function searchPlayers(q: string): Promise<Profile[]> {
  const term = q.trim().replace(/[%_,()]/g, '');
  if (term.length < 2) return [];
  return check(
    await withProfileCols<Profile[]>((cols) =>
      supabase.from('profiles').select(cols).or(`display_name.ilike.%${term}%,nickname.ilike.%${term}%`).limit(20),
    ),
  );
}

export async function sendFriendRequest(me: string, other: string) {
  check(await supabase.from('friendships').insert({ requester: me, addressee: other }));
}

export async function acceptFriend(me: string, requester: string) {
  check(
    await supabase.from('friendships').update({ status: 'accepted' }).eq('requester', requester).eq('addressee', me),
  );
}

export async function removeFriend(me: string, other: string) {
  check(
    await supabase
      .from('friendships')
      .delete()
      .or(`and(requester.eq.${me},addressee.eq.${other}),and(requester.eq.${other},addressee.eq.${me})`),
  );
}

/** Upload a picked photo as my profile picture and save its address on my profile. */
export async function uploadAvatar(userId: string, uri: string, mimeType = 'image/jpeg') {
  const body = await (await fetch(uri)).arrayBuffer();
  const ext = mimeType.includes('png') ? 'png' : 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;
  const up = await supabase.storage.from('avatars').upload(path, body, { contentType: mimeType, upsert: true });
  if (up.error) throw new Error(up.error.message);
  const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  check(await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId));
  return url;
}

// Guest players -----------------------------------------------------------

export async function addGuestPlayer(leagueId: string, name: string): Promise<string> {
  return check(await supabase.rpc('add_guest_player', { league: leagueId, name }));
}

export async function guestClaimCode(profileId: string): Promise<string> {
  return check(await supabase.rpc('guest_claim_code', { p: profileId }));
}

export async function claimGuest(code: string): Promise<string> {
  return check(await supabase.rpc('claim_guest', { code }));
}

// Courses -----------------------------------------------------------------

export async function listCourses(): Promise<Course[]> {
  const rows = check(await supabase.from('courses').select('*, course_tees(*)').order('name'));
  return rows.map((c: Course) => ({
    ...c,
    course_tees: [...c.course_tees].sort((a, b) => a.sort_order - b.sort_order),
  }));
}

/** Look a course up on GolfCourseAPI (through Supabase, which holds the key) and save what it finds. */
export async function searchCoursesOnline(q: string): Promise<{ source: 'api' | 'saved'; found: number }> {
  return check(await supabase.rpc('search_courses_online', { q }));
}

export function teeLabel(t: Tee): string {
  if (t.course_rating == null || t.slope == null) return t.name;
  return `${t.name} · ${Number(t.course_rating).toFixed(1)} / ${t.slope}`;
}

// Leagues -----------------------------------------------------------------

export async function listLeagues(): Promise<League[]> {
  return check(await supabase.from('leagues').select('*').order('created_at', { ascending: false }));
}

export async function createLeague(
  name: string,
  season: string | null,
  settings: Partial<LeagueSettings> = {},
): Promise<League> {
  return check(await supabase.from('leagues').insert({ name, season, settings }).select().single());
}

export async function joinLeague(code: string): Promise<string> {
  return check(await supabase.rpc('join_league', { code }));
}

export async function updateLeague(id: string, patch: Partial<Pick<League, 'name' | 'season' | 'settings'>>) {
  check(await supabase.from('leagues').update(patch).eq('id', id));
}

/** Lock the season: open matches are finished, then nothing in the league can change. */
export async function finishSeason(id: string) {
  check(await supabase.from('matches').update({ status: 'final' }).eq('league_id', id).eq('status', 'open'));
  check(await supabase.from('leagues').update({ finished_at: new Date().toISOString() }).eq('id', id));
}

export async function deleteLeague(id: string) {
  check(await supabase.from('leagues').delete().eq('id', id));
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
    supabase.from('league_members').select('user_id, role, profiles(*)').eq('league_id', id),
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
  leagueId: string | null;
  courseId: string | null;
  teeId: string | null;
  playedOn: string;
  kind: MatchKind;
  format: MatchFormat;
  holes: 9 | 18;
  nine: 'front' | 'back' | null;
  players: { userId: string; teeId: string | null; courseHandicap: number }[];
  /** Set for a match planned ahead: it starts as "scheduled" and players get an invite. */
  startsAt?: string | null;
}): Promise<string> {
  const row: Record<string, unknown> = {
    league_id: input.leagueId,
    course_id: input.courseId,
    tee_id: input.teeId,
    played_on: input.playedOn,
    kind: input.kind,
    format: input.format,
    holes: input.holes,
    nine: input.nine,
  };
  if (input.startsAt) {
    row.status = 'scheduled';
    row.starts_at = input.startsAt;
  }
  let res = await supabase.from('matches').insert(row).select('id').single();
  if (res.error?.message.includes('format') && input.format === 'stroke') {
    // Database hasn't had the match format update yet; stroke play is the default anyway.
    delete row.format;
    res = await supabase.from('matches').insert(row).select('id').single();
  }
  const match = check(res) as { id: string };
  check(
    await supabase.from('match_players').insert(
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

export async function joinMatch(code: string): Promise<string> {
  return check(await supabase.rpc('join_match', { code }));
}

/**
 * A match with what it needs to show: its league (or app defaults for a casual match),
 * the players' profiles as members, and whether the league's season is finished.
 */
export async function getMatchBundle(id: string) {
  const match = await getMatch(id);
  if (match.league_id) {
    const bundle = await getLeague(match.league_id);
    return { match, ...bundle, locked: !!bundle.league.finished_at };
  }
  const profiles = await getProfiles(match.match_players.map((p) => p.user_id));
  const members: Member[] = profiles.map((p) => ({ user_id: p.id, role: 'member', profiles: p }));
  return { match, league: null, settings: withDefaults({}), members, matches: [] as MatchRow[], locked: false };
}

export async function saveScore(
  matchId: string,
  userId: string,
  patch: Partial<Pick<MatchPlayerRow, 'hole_scores' | 'gross' | 'playoff_rank' | 'course_handicap' | 'tee_id'>>,
) {
  check(await supabase.from('match_players').update(patch).eq('match_id', matchId).eq('user_id', userId));
}

export async function startMatch(id: string) {
  check(await supabase.rpc('start_match', { m: id }));
}

/** Scheduled matches I'm playing in, soonest first. */
export async function listUpcoming(userId: string): Promise<{ matches: LiveMatch[]; profiles: Profile[] }> {
  const mine = check(await supabase.from('match_players').select('match_id').eq('user_id', userId)) as {
    match_id: string;
  }[];
  if (mine.length === 0) return { matches: [], profiles: [] };
  const matches = check(
    await supabase
      .from('matches')
      .select(`${MATCH_SELECT}, leagues(name, season, settings)`)
      .eq('status', 'scheduled')
      .in(
        'id',
        mine.map((m) => m.match_id),
      )
      .order('played_on', { ascending: true }),
  ) as LiveMatch[];
  matches.sort((a, b) => (a.starts_at ?? a.played_on).localeCompare(b.starts_at ?? b.played_on));
  const ids = [...new Set(matches.flatMap((m) => m.match_players.map((p) => p.user_id)))];
  return { matches, profiles: await getProfiles(ids) };
}

// Notifications ------------------------------------------------------------

export interface AppNotification {
  id: string;
  kind: 'invite' | 'live' | 'friend_request' | 'friend_accepted';
  title: string;
  body: string | null;
  match_id: string | null;
  from_user?: string | null;
  created_at: string;
  read_at: string | null;
}

export async function listNotifications(): Promise<AppNotification[]> {
  const res = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
  // Before the notifications update has run, just show none.
  if (res.error) return [];
  return res.data as AppNotification[];
}

export async function markNotificationsRead() {
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
}

export async function setMatchStatus(id: string, status: 'open' | 'final') {
  check(await supabase.from('matches').update({ status }).eq('id', id));
}

export async function deleteMatch(id: string) {
  check(await supabase.from('matches').delete().eq('id', id));
}

export async function addBonus(b: {
  matchId: string;
  userId: string;
  typeKey: string | null;
  label: string;
  points: number;
  hole?: number | null;
}) {
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

export interface LiveMatch extends MatchRow {
  /** Null when the match is in a league I'm not in (I see it through a friend). */
  leagues: { name: string; season?: string | null; settings: Partial<LeagueSettings> } | null;
}

/** Matches still being played in my leagues or by my friends, with player names. */
export async function listLiveMatches(): Promise<{ matches: LiveMatch[]; profiles: Profile[] }> {
  const matches = check(
    await supabase
      .from('matches')
      .select(`${MATCH_SELECT}, leagues(name, season, settings)`)
      .eq('status', 'open')
      .order('played_on', { ascending: false }),
  ) as LiveMatch[];
  const ids = [...new Set(matches.flatMap((m) => m.match_players.map((p) => p.user_id)))];
  return { matches, profiles: await getProfiles(ids) };
}

/** A player's matches, newest first (only ones I'm allowed to see). */
export async function playerMatches(
  userId: string,
  limit = 20,
): Promise<{ matches: LiveMatch[]; profiles: Profile[] }> {
  const mine = check(await supabase.from('match_players').select('match_id').eq('user_id', userId)) as {
    match_id: string;
  }[];
  if (mine.length === 0) return { matches: [], profiles: [] };
  const matches = check(
    await supabase
      .from('matches')
      .select(`${MATCH_SELECT}, leagues(name, season, settings)`)
      .in(
        'id',
        mine.map((m) => m.match_id),
      )
      .order('played_on', { ascending: false })
      .limit(limit),
  ) as LiveMatch[];
  const ids = [...new Set(matches.flatMap((m) => m.match_players.map((p) => p.user_id)))];
  return { matches, profiles: await getProfiles(ids) };
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

export function resultsFor(match: MatchRow, settings: LeagueSettings, courses: Course[] = []): PlayerResult[] {
  const format = match.format ?? 'stroke';
  return scoreMatch(
    {
      kind: match.kind,
      holes: match.holes,
      format,
      holePars: format === 'stableford' ? holesFor(match, courses).played.holePars : null,
    },
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
  ) as unknown as (MatchPlayerRow & {
    matches: Pick<MatchRow, 'id' | 'played_on' | 'holes' | 'nine' | 'course_id' | 'tee_id'>;
  })[];

  const byUser = new Map<string, HandicapRound[]>();
  for (const r of rows) {
    const m = r.matches;
    const { played } = holesFor(m, courses, r.tee_id);
    const complete =
      r.hole_scores && r.hole_scores.length === played.holes && r.hole_scores.every((s) => s != null && s > 0);
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
export function playingIndex(
  settings: LeagueSettings,
  app: number | null | undefined,
  self: number | null | undefined,
) {
  const a = app ?? null;
  const s = self != null ? Number(self) : null;
  return settings.handicapSource === 'self' ? (s ?? a) : (a ?? s);
}

/** "Backoutsideboyz · Season 2", or just the name when there's no season. */
export function leagueTitle(l: { name: string; season?: string | null } | null | undefined) {
  if (!l) return '';
  return l.season ? `${l.name} · Season ${l.season}` : l.name;
}

export function displayName(p: Pick<Profile, 'display_name' | 'nickname'> | undefined | null) {
  if (!p) return 'Unknown';
  return p.nickname || p.display_name || 'Player';
}
