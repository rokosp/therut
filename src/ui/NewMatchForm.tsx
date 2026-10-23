import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import {
  createMatch,
  displayName,
  getLeague,
  getProfiles,
  handicapsFor,
  listFriendships,
  type Member,
  holesFor,
  listCourses,
  searchCoursesOnline,
  playingIndex,
  teeLabel,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { courseHandicap } from '@/lib/handicap';
import { withDefaults, type MatchFormat, type MatchKind } from '@/lib/types';
import { useAction, useLoad } from '@/lib/useLoad';
import { Button, Card, Chip, ErrorText, Field, Row, Screen, Segmented, T } from '@/ui/components';
import { space } from '@/ui/theme';

const today = () => new Date().toISOString().slice(0, 10);

/** Set up a match: in a league (leagueId), or a casual round with friends (leagueId null). */
export function NewMatchForm({ leagueId }: { leagueId: string | null }) {
  const { userId } = useAuth();
  const [playedOn, setPlayedOn] = useState(today());
  const [courseId, setCourseId] = useState<string | null>(null);
  const [teeId, setTeeId] = useState<string | null>(null);
  const [kind, setKind] = useState<MatchKind>('major');
  const [format, setFormat] = useState<MatchFormat | null>(null); // null = league default
  const [nine, setNine] = useState<'front' | 'back'>('front');
  const [players, setPlayers] = useState<Record<string, string | null>>({}); // userId -> own tee (null = match tee)
  const { busy, error, run } = useAction();

  const [query, setQuery] = useState('');
  const [onlineNote, setOnlineNote] = useState<string | null>(null);
  const online = useAction();
  const { data, error: loadError, reload } = useLoad(async () => {
    const [bundle, courses] = await Promise.all([leagueId ? getLeague(leagueId) : casualBundle(userId!), listCourses()]);
    const hcps = await handicapsFor(bundle.members.map((m) => m.user_id), courses);
    return { ...bundle, courses, hcps };
  }, [leagueId, userId]);

  // Sensible first choices: first course, its first tee, and me in the match.
  useEffect(() => {
    if (!data) return;
    if (!courseId && data.courses[0]) {
      setCourseId(data.courses[0].id);
      setTeeId(data.courses[0].course_tees[0]?.id ?? null);
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

  const { courses, members, settings, hcps } = data;
  const course = courses.find((c) => c.id === courseId) ?? null;
  const q = query.trim().toLowerCase();
  const matching = q
    ? courses.filter((c) => [c.name, c.club_name, c.city ?? ''].some((x) => x.toLowerCase().includes(q)))
    : courses;
  // Keep the picked course visible, then the matches (a handful when nothing is typed).
  const shownCourses = [
    ...(course ? [course] : []),
    ...matching.filter((c) => c.id !== courseId).slice(0, q ? 12 : 5),
  ];
  const holes: 9 | 18 = kind === 'major' ? 18 : 9;
  const matchShape = { holes, nine: holes === 9 && course?.holes === 18 ? nine : null, course_id: courseId, tee_id: teeId };

  const chFor = (uid: string) => {
    const m = members.find((x) => x.user_id === uid);
    const idx = playingIndex(settings, hcps.get(uid)?.index, m?.profiles.self_handicap);
    if (idx == null) return { ch: 0, idx: null };
    const { played } = holesFor(matchShape, courses, players[uid]);
    return { ch: courseHandicap(idx, played), idx };
  };

  const pickCourse = (cid: string) => {
    const c = courses.find((x) => x.id === cid);
    setCourseId(cid);
    setTeeId(c?.course_tees[0]?.id ?? null);
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
      const ids = Object.keys(players);
      if (leagueId && ids.length < 2) throw new Error('Pick at least two players.');
      if (ids.length < 1) throw new Error('Pick at least one player.');
      const matchId = await createMatch({
        leagueId,
        courseId,
        teeId,
        playedOn,
        kind,
        format: format ?? settings.defaultFormat,
        holes,
        nine: matchShape.nine,
        players: ids.map((uid) => ({ userId: uid, teeId: players[uid] ?? teeId, courseHandicap: chFor(uid).ch })),
      });
      router.replace(`/match/${matchId}`);
    });

  return (
    <Screen>
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
        <Field label="Date played" value={playedOn} onChangeText={setPlayedOn} placeholder="YYYY-MM-DD" />
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
          placeholder="Course, club or city"
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
        {query.trim() && shownCourses.length === (course ? 1 : 0) ? <T muted>No saved course matches that.</T> : null}
        {query.trim().length >= 3 ? (
          <Button
            title={`Search online for "${query.trim()}"`}
            kind="secondary"
            busy={online.busy}
            onPress={() =>
              online.run(async () => {
                const r = await searchCoursesOnline(query);
                await reload();
                setOnlineNote(
                  r.source === 'saved'
                    ? 'Already searched recently, so the results are in the list above.'
                    : r.found
                      ? `Found ${r.found} course${r.found === 1 ? '' : 's'} online. They're saved now.`
                      : 'Nothing found online. Try a shorter name, like the club or city.',
                );
              })
            }
          />
        ) : null}
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
              {course.course_tees.map((t) => (
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
            {course && course.course_tees.length > 1 ? (
              <View style={{ gap: space.xs }}>
                <T variant="label" muted>
                  Plays from
                </T>
                <Row style={{ flexWrap: 'wrap' }}>
                  {course.course_tees.map((t) => (
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
      <Button title="Start match" kind="accent" onPress={create} busy={busy} />
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
