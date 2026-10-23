import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import {
  createMatch,
  displayName,
  getLeague,
  handicapsFor,
  holesFor,
  listCourses,
  playingIndex,
  teeLabel,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { courseHandicap } from '@/lib/handicap';
import type { MatchKind } from '@/lib/types';
import { useAction, useLoad } from '@/lib/useLoad';
import { Button, Card, Chip, ErrorText, Field, Row, Screen, Segmented, T } from '@/ui/components';
import { space } from '@/ui/theme';

const today = () => new Date().toISOString().slice(0, 10);

export default function NewMatch() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const [playedOn, setPlayedOn] = useState(today());
  const [courseId, setCourseId] = useState<string | null>(null);
  const [teeId, setTeeId] = useState<string | null>(null);
  const [kind, setKind] = useState<MatchKind>('major');
  const [nine, setNine] = useState<'front' | 'back'>('front');
  const [players, setPlayers] = useState<Record<string, string | null>>({}); // userId -> own tee (null = match tee)
  const { busy, error, run } = useAction();

  const { data, error: loadError } = useLoad(async () => {
    const [bundle, courses] = await Promise.all([getLeague(id), listCourses()]);
    const hcps = await handicapsFor(bundle.members.map((m) => m.user_id), courses);
    return { ...bundle, courses, hcps };
  }, [id]);

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
      if (ids.length < 2) throw new Error('Pick at least two players.');
      const matchId = await createMatch({
        leagueId: id,
        courseId,
        teeId,
        playedOn,
        kind,
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
            { value: 'major', label: 'Major · 18 holes' },
            { value: 'minor', label: 'Minor · 9 holes' },
          ]}
          value={kind}
          onChange={setKind}
        />
        <T variant="label" muted>
          Points for 1st: {(kind === 'major' ? settings.majorPoints : settings.minorPoints)[0] ?? 0}
        </T>
        <Field label="Date played" value={playedOn} onChangeText={setPlayedOn} placeholder="YYYY-MM-DD" />
      </Card>

      <Card>
        <T variant="title">Course</T>
        <Row style={{ flexWrap: 'wrap' }}>
          {courses.map((c) => (
            <Chip key={c.id} label={c.name} on={c.id === courseId} onPress={() => pickCourse(c.id)} />
          ))}
        </Row>
        {courses.length === 0 ? <T muted>No courses loaded yet.</T> : null}
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
              <T variant="mono">{idx == null ? 'No hcp' : `HCP ${idx.toFixed(1)} → ${ch}`}</T>
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

      <T variant="label" muted>
        Strokes received are worked out from each player's {settings.handicapSource === 'app' ? 'app' : 'own'} handicap and
        their tees, and stay fixed for this match.
      </T>
      <ErrorText error={error} />
      <Button title="Start match" kind="accent" onPress={create} busy={busy} />
    </Screen>
  );
}
