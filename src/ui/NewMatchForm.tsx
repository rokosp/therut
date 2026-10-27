import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import {
  createMatch,
  displayName,
  getLeague,
  getProfiles,
  handicapsFor,
  listFriendships,
  type Course,
  type Member,
  holesFor,
  listCourses,
  playedCourseCounts,
  searchCoursesOnline,
  playingIndex,
  teeLabel,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { rankCourses } from '@/lib/courseSearch';
import { courseHandicap } from '@/lib/handicap';
import { withDefaults, type MatchFormat, type MatchKind } from '@/lib/types';
import { useAction, useLoad } from '@/lib/useLoad';
import { AddCourseModal } from '@/ui/AddCourse';
import { Button, Card, Chip, ErrorText, Field, Row, Screen, Segmented, T } from '@/ui/components';
import { MonthGrid } from '@/ui/MonthGrid';
import { brand, fonts, radius, space, usePalette } from '@/ui/theme';

/** One tee per colour: the ladies' ratings stay saved, but the picker only shows the main set. */
const teesOf = (c: Course) => {
  const current = c.course_tees.filter((t) => !t.retired);
  const main = current.filter((t) => !t.name.includes('Ladies'));
  return main.length ? main : current;
};

/** Move an HH:MM time by some minutes, staying within the day. */
const shiftTime = (t: string, mins: number) => {
  const [h, m] = t.split(':').map(Number);
  const total = Math.min(23 * 60 + 50, Math.max(0, h * 60 + m + mins));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Set up a match: in a league (leagueId), or a casual round with friends (leagueId null). */
export function NewMatchForm({ leagueId }: { leagueId: string | null }) {
  const { userId } = useAuth();
  const [playedOn, setPlayedOn] = useState(today());
  const [teeTime, setTeeTime] = useState('09:00');
  const [pickingDate, setPickingDate] = useState(false);
  const [gridMonth, setGridMonth] = useState<string | null>(null);
  const c = usePalette();
  const [courseId, setCourseId] = useState<string | null>(null);
  const [teeId, setTeeId] = useState<string | null>(null);
  const [kind, setKind] = useState<MatchKind>('major');
  const [format, setFormat] = useState<MatchFormat | null>(null); // null = league default
  const [nine, setNine] = useState<'front' | 'back'>('front');
  const [players, setPlayers] = useState<Record<string, string | null>>({}); // userId -> own tee (null = match tee)
  const { busy, error, run } = useAction();

  const [query, setQuery] = useState('');
  const [onlineNote, setOnlineNote] = useState<string | null>(null);
  const [solo, setSolo] = useState(false);
  const [adding, setAdding] = useState(false);
  // A course just added by hand: pick it once the list reloads.
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const online = useAction();
  const {
    data,
    error: loadError,
    reload,
  } = useLoad(async () => {
    const [bundle, courses, played] = await Promise.all([
      leagueId ? getLeague(leagueId) : casualBundle(userId!),
      listCourses(),
      playedCourseCounts(userId!).catch(() => ({}) as Record<string, number>),
    ]);
    const hcps = await handicapsFor(
      bundle.members.map((m) => m.user_id),
      courses,
    );
    return { ...bundle, courses, hcps, played };
  }, [leagueId, userId]);

  // Sensible first choices: the course I play most, its first tee, and me in the match.
  useEffect(() => {
    if (!data) return;
    const added = justAdded ? data.courses.find((x) => x.id === justAdded) : null;
    if (added) {
      setJustAdded(null);
      setCourseId(added.id);
      setTeeId(teesOf(added)[0]?.id ?? null);
      setQuery('');
    } else if (!courseId) {
      const first = rankCourses(data.courses, '', data.played, 1)[0];
      if (first) {
        setCourseId(first.id);
        setTeeId(teesOf(first)[0]?.id ?? null);
      }
    }
    if (userId && Object.keys(players).length === 0) setPlayers({ [userId]: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (!data) {
    return (
      <Screen>
        <ErrorText error={loadError} />
      </Screen>
    );
  }

  const { courses, members, settings, hcps, played } = data;
  // A date after today means planning ahead rather than playing now.
  const later = /^\d{4}-\d{2}-\d{2}$/.test(playedOn) && playedOn > today();
  const course = courses.find((c) => c.id === courseId) ?? null;
  const q = query.trim().toLowerCase();
  // While typing: the top 4 saved courses (ones I've played first). Otherwise just the picked course.
  const matching = rankCourses(courses, q, played, 4);
  const shownCourses = q ? matching : course ? [course] : matching;
  const noLocalMatch = !!q && matching.length === 0;
  const holes: 9 | 18 = kind === 'major' ? 18 : 9;
  const matchShape = {
    holes,
    nine: holes === 9 && course?.holes === 18 ? nine : null,
    course_id: courseId,
    tee_id: teeId,
  };

  const chFor = (uid: string) => {
    const m = members.find((x) => x.user_id === uid);
    const idx = playingIndex(settings, hcps.get(uid)?.index, m?.profiles.self_handicap);
    if (idx == null) return { ch: 0, idx: null };
    const { played } = holesFor(matchShape, courses, players[uid]);
    return { ch: courseHandicap(idx, played), idx };
  };

  // Ask GolfCourseAPI (uses the daily allowance), then show what it saved.
  const searchOnline = () =>
    online.run(async () => {
      const r = await searchCoursesOnline(query);
      await reload();
      setOnlineNote(
        r.source === 'saved'
          ? 'Already searched recently, so the results are in the list above.'
          : r.found
            ? `Found ${r.found} course${r.found === 1 ? '' : 's'} online. They're saved now.`
            : 'Nothing found online. The search only knows course and club names, so try the club or town (like "Mokrice") instead of a country.',
      );
    });

  const pickCourse = (cid: string) => {
    const c = courses.find((x) => x.id === cid);
    setCourseId(cid);
    setQuery('');
    setOnlineNote(null);
    setTeeId((c ? teesOf(c)[0]?.id : null) ?? null);
    // Player tee choices belong to the old course.
    setPlayers(Object.fromEntries(Object.keys(players).map((k) => [k, null])));
  };

  const togglePlayer = (uid: string) => {
    const next = { ...players };
    if (uid in next) delete next[uid];
    else next[uid] = null;
    setPlayers(next);
  };

  const create = () =>
    run(async () => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(playedOn)) throw new Error('Date should look like 2026-10-23.');
      if (later && !/^\d{1,2}:\d{2}$/.test(teeTime.trim())) throw new Error('Tee time should look like 09:30.');
      const ids = Object.keys(players);
      if (leagueId && ids.length < 2) throw new Error('Pick at least two players.');
      if (ids.length < 1) throw new Error('Pick at least one player.');
      const matchId = await createMatch({
        leagueId,
        courseId,
        teeId,
        playedOn,
        startsAt: later ? new Date(`${playedOn}T${teeTime.trim().padStart(5, '0')}:00`).toISOString() : null,
        kind,
        format: format ?? settings.defaultFormat,
        holes,
        nine: matchShape.nine,
        players: ids.map((uid) => ({ userId: uid, teeId: players[uid] ?? teeId, courseHandicap: chFor(uid).ch })),
      });
      if (ids.length === 1 && !later) {
        // Teeing it up alone.
        setSolo(true);
        await new Promise((r) => setTimeout(r, 1800));
        setSolo(false);
      }
      router.replace(`/match/${matchId}`);
    });

  return (
    <Screen>
      <Modal visible={solo} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
            backgroundColor: brand.rough,
          }}>
          <T variant="display" style={{ color: brand.blaze, textAlign: 'center' }}>
            Okay Steven Glansberg.
          </T>
        </View>
      </Modal>
      <Card>
        <T variant="title">Match type</T>
        <Segmented
          options={[
            { value: 'major', label: leagueId ? 'Major · 18 holes' : '18 holes' },
            { value: 'minor', label: leagueId ? 'Minor · 9 holes' : '9 holes' },
          ]}
          value={kind}
          onChange={setKind}
        />
        {leagueId ? (
          <T variant="label" muted>
            Points for 1st: {(kind === 'major' ? settings.majorPoints : settings.minorPoints)[0] ?? 0}
          </T>
        ) : null}
        <T variant="eyebrow" muted>
          Format
        </T>
        <Segmented
          options={[
            { value: 'stroke', label: 'Stroke play' },
            { value: 'stableford', label: 'Stableford' },
          ]}
          value={format ?? settings.defaultFormat}
          onChange={setFormat}
        />
        <T variant="label" muted>
          {(format ?? settings.defaultFormat) === 'stroke'
            ? 'Fewest strokes wins.'
            : 'Points per hole: par 2, birdie 3, eagle 4, bogey 1, worse 0. Most points wins. Needs hole-by-hole scores.'}
        </T>
        <T variant="eyebrow" muted>
          {later ? 'Date' : 'Date played'}
        </T>
        <Pressable
          onPress={() => setPickingDate(!pickingDate)}
          style={{
            minHeight: 48,
            borderRadius: radius.input,
            backgroundColor: c.bg,
            paddingHorizontal: space.m,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
          <T style={{ fontSize: 16 }}>
            {playedOn === today() ? 'Today · ' : ''}
            {new Date(`${playedOn}T12:00:00`).toLocaleDateString('en-GB', {
              weekday: 'short',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </T>
          <T variant="eyebrow" style={{ color: c.accentText }}>
            {pickingDate ? 'Done' : 'Change'}
          </T>
        </Pressable>
        {pickingDate ? (
          <MonthGrid
            compact
            year={+(gridMonth ?? playedOn).slice(0, 4)}
            month={+(gridMonth ?? playedOn).slice(5, 7) - 1}
            onStep={(d) => {
              const base = gridMonth ?? playedOn;
              const n = new Date(+base.slice(0, 4), +base.slice(5, 7) - 1 + d, 1);
              setGridMonth(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`);
            }}
            selected={playedOn}
            onPick={(d) => {
              setPlayedOn(d);
              setPickingDate(false);
              setGridMonth(null);
            }}
          />
        ) : null}
        {later ? (
          <>
            <T variant="eyebrow" muted>
              Tee time
            </T>
            <Row style={{ justifyContent: 'space-between' }}>
              <Button
                title="−"
                kind="secondary"
                compact
                onPress={() => setTeeTime(shiftTime(teeTime, -10))}
                style={{ width: 56 }}
              />
              <T style={{ fontFamily: fonts.num, fontSize: 32 }}>{teeTime}</T>
              <Button
                title="+"
                kind="secondary"
                compact
                onPress={() => setTeeTime(shiftTime(teeTime, 10))}
                style={{ width: 56 }}
              />
            </Row>
            <T variant="label" muted>
              This is a future date, so the match is scheduled. The players get an invite and it shows under Upcoming on
              their home page. Anyone in it can start it on the day.
            </T>
          </>
        ) : null}
      </Card>

      <Card>
        <T variant="title">Course</T>
        <Field
          label="Search courses"
          value={query}
          onChangeText={(v) => {
            setQuery(v);
            setOnlineNote(null);
          }}
          placeholder={course ? 'Type to pick a different course' : 'Course, club or city'}
        />
        <Row style={{ flexWrap: 'wrap' }}>
          {shownCourses.map((c) => (
            <Chip
              key={c.id}
              label={c.city && !c.name.includes(c.city) ? `${c.name} · ${c.city}` : c.name}
              on={c.id === courseId}
              onPress={() => pickCourse(c.id)}
            />
          ))}
        </Row>
        {noLocalMatch ? <T muted>None of the saved courses match that.</T> : null}
        {/* Saved courses first; the online search (which uses the daily allowance) only after that. */}
        {query.trim().length >= 3 ? (
          noLocalMatch ? (
            <Button
              title={`Search online for "${query.trim()}"`}
              kind="secondary"
              busy={online.busy}
              onPress={searchOnline}
            />
          ) : (
            <Pressable accessibilityRole="button" hitSlop={8} disabled={online.busy} onPress={searchOnline}>
              <T variant="label" style={{ color: c.accentText }}>
                Not listed? Search online for "{query.trim()}"
              </T>
            </Pressable>
          )
        ) : null}
        {noLocalMatch ? <Button title="Add a course" kind="secondary" onPress={() => setAdding(true)} /> : null}
        <AddCourseModal
          visible={adding}
          initialName={query.trim()}
          onClose={() => setAdding(false)}
          onSaved={(id) => {
            setAdding(false);
            setJustAdded(id);
            reload();
          }}
        />
        <ErrorText error={online.error} />
        {onlineNote ? (
          <T variant="label" muted>
            {onlineNote}
          </T>
        ) : null}
        {course && holes === 9 && course.holes === 18 ? (
          <>
            <T variant="label" muted>
              Which nine
            </T>
            <Segmented
              options={[
                { value: 'front', label: course.name.includes('Executive') ? 'Holes 1–9' : 'Front 9' },
                { value: 'back', label: course.name.includes('Executive') ? 'Second loop' : 'Back 9' },
              ]}
              value={nine}
              onChange={setNine}
            />
          </>
        ) : null}
        {course ? (
          <>
            <T variant="label" muted>
              Tees (default for everyone)
            </T>
            <Row style={{ flexWrap: 'wrap' }}>
              {teesOf(course).map((t) => (
                <Chip key={t.id} label={teeLabel(t)} on={t.id === teeId} onPress={() => setTeeId(t.id)} />
              ))}
            </Row>
          </>
        ) : null}
      </Card>

      <Card>
        <T variant="title">Players</T>
        {!leagueId ? (
          <T variant="label" muted>
            Your friends are listed here. Anyone else can join with the match code once it starts.
          </T>
        ) : null}
        <Row style={{ flexWrap: 'wrap' }}>
          {members.map((m) => (
            <Chip
              key={m.user_id}
              label={displayName(m.profiles)}
              on={m.user_id in players}
              onPress={() => togglePlayer(m.user_id)}
            />
          ))}
        </Row>
      </Card>

      {Object.keys(players).map((uid) => {
        const m = members.find((x) => x.user_id === uid);
        const { ch, idx } = chFor(uid);
        const own = players[uid];
        return (
          <Card key={uid}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T variant="title">{displayName(m?.profiles)}</T>
              <T variant="mono">{idx == null ? 'No HCP' : `HCP ${idx.toFixed(1)}`}</T>
            </Row>
            {course && teesOf(course).length > 1 ? (
              <View style={{ gap: space.xs }}>
                <T variant="label" muted>
                  Plays from
                </T>
                <Row style={{ flexWrap: 'wrap' }}>
                  {teesOf(course).map((t) => (
                    <Chip
                      key={t.id}
                      label={t.name}
                      on={(own ?? teeId) === t.id}
                      onPress={() => setPlayers({ ...players, [uid]: t.id === teeId ? null : t.id })}
                    />
                  ))}
                </Row>
              </View>
            ) : null}
          </Card>
        );
      })}

      <ErrorText error={error} />
      <Button title={later ? 'Schedule match' : 'Start match'} kind="accent" onPress={create} busy={busy} />
    </Screen>
  );
}

/** For a casual match the player list is me plus my friends, scored with the app defaults. */
async function casualBundle(me: string): Promise<{ members: Member[]; settings: ReturnType<typeof withDefaults> }> {
  const friendships = await listFriendships();
  const friends = friendships
    .filter((f) => f.status === 'accepted')
    .map((f) => (f.requester === me ? f.addressee : f.requester));
  const profiles = await getProfiles([me, ...friends]);
  profiles.sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : displayName(a).localeCompare(displayName(b))));
  return { members: profiles.map((p) => ({ user_id: p.id, role: 'member', profiles: p })), settings: withDefaults({}) };
}
