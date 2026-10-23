import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import {
  addBonus,
  deleteMatch,
  displayName,
  getMatchBundle,
  holesFor,
  leagueTitle,
  listCourses,
  removeBonus,
  resultsFor,
  saveScore,
  setMatchStatus,
  type MatchPlayerRow,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { buildCommentary, type CommentaryLine } from '@/lib/commentary';
import { stablefordHole, stablefordPoints } from '@/lib/scoring';
import { matchHappenings, type Happening } from '@/lib/stats';
import { useAction, useLoad } from '@/lib/useLoad';
import { Button, Card, Chip, ErrorText, Field, Row, Screen, Section, Segmented, T, Tag } from '@/ui/components';
import { confirmAction } from '@/ui/confirm';
import { Fireworks } from '@/ui/Fireworks';
import { PlayerLink } from '@/ui/PlayerLink';
import { fonts, radius, space, usePalette } from '@/ui/theme';

export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const c = usePalette();
  const [hole, setHole] = useState(0);
  const [mode, setMode] = useState<'holes' | 'totals'>('holes');
  const saveQueue = useRef(new Map<string, Promise<void>>());
  const pendingSaves = useRef(0);
  const lastEdit = useRef(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
  const action = useAction();

  const { data, error, loading, reload, setData } = useLoad(
    async () => {
      const [bundle, courses] = await Promise.all([getMatchBundle(id), listCourses()]);
      return { courses, ...bundle };
    },
    [id],
    {
      // Keep the scorecard live for everyone, but never overwrite a score someone is entering.
      pollMs: 5000,
      shouldSkip: () => pendingSaves.current > 0 || Date.now() - lastEdit.current < 4000,
    },
  );

  if (!data) {
    return (
      <Screen refreshing={loading} onRefresh={reload}>
        <ErrorText error={error} />
      </Screen>
    );
  }

  const { match, courses, members, settings, league, locked } = data;
  const casual = !match.league_id;
  const isAdmin = members.some((m) => m.user_id === userId && m.role === 'admin');
  const canManage = !locked && (isAdmin || match.created_by === userId);
  const isPlayer = match.match_players.some((p) => p.user_id === userId);
  // Anyone playing (or whoever set the match up) can keep score for everyone. Others watch.
  // A finished season locks everything.
  // Finished matches are read-only; the match admin can reopen them for edits.
  const editable = !locked && match.status === 'open' && (isAdmin || isPlayer || match.created_by === userId);
  const showScores = match.status === 'final';
  const { course, tee, played } = holesFor(match, courses);
  const nameOf = (uid: string) => displayName(members.find((m) => m.user_id === uid)?.profiles);
  const results = resultsFor(match, settings, courses);
  const isStableford = match.format === 'stableford';
  const holeOffset = match.nine === 'back' ? 9 : 0;

  /** Update one player's row locally straight away, then save in order. */
  const updatePlayer = (uid: string, patch: Partial<MatchPlayerRow>) => {
    setData({
      ...data,
      match: {
        ...match,
        match_players: match.match_players.map((p) => (p.user_id === uid ? { ...p, ...patch } : p)),
      },
    });
    lastEdit.current = Date.now();
    pendingSaves.current += 1;
    const prev = saveQueue.current.get(uid) ?? Promise.resolve();
    const next = prev
      .then(() => saveScore(match.id, uid, patch))
      .then(() => setSaveError(null))
      .catch((e: Error) => setSaveError(`Couldn't save: ${e.message}. Pull down to refresh.`))
      .finally(() => {
        pendingSaves.current -= 1;
      });
    saveQueue.current.set(uid, next);
  };

  const setHoleScore = (p: MatchPlayerRow, value: number | null) => {
    const scores = [...(p.hole_scores ?? new Array(played.holes).fill(null))];
    while (scores.length < played.holes) scores.push(null);
    scores[hole] = value;
    const complete = scores.every((s) => s != null);
    updatePlayer(p.user_id, {
      hole_scores: scores,
      gross: complete ? (scores as number[]).reduce((a, b) => a + b, 0) : p.gross,
    });
  };

  const parOf = (i: number) => played.holePars?.[i] ?? null;
  const teeOf = (p: MatchPlayerRow) => holesFor(match, courses, p.tee_id).tee;

  const tied = results.filter((r) => r.tied);
  const myResult = results.find((r) => r.userId === userId);
  const myStableford = stablefordPoints(
    match.match_players.find((p) => p.user_id === userId)?.hole_scores,
    played.holePars,
  );
  const confirmDelete = () =>
    confirmAction('Delete match?', 'Scores and bonuses for this match are removed for good.', 'Delete', () =>
      action.run(async () => {
        await deleteMatch(match.id);
        router.replace(match.league_id ? `/league/${match.league_id}` : '/matches');
      }),
    );

  const scorecard = (
    <Scorecard
      holes={played.holes}
      offset={holeOffset}
      pars={played.holePars}
      players={match.match_players.map((p) => ({
        id: p.user_id,
        name: nameOf(p.user_id),
        scores: p.hole_scores ?? [],
        bonusHoles: match.bonus_awards
          .filter((b) => b.user_id === p.user_id && b.hole != null)
          .map((b) => b.hole! - 1 - holeOffset),
      }))}
      current={mode === 'holes' && editable ? hole : null}
      onPickHole={setHole}
    />
  );

  return (
    <View
      style={{ flex: 1 }}
      onLayout={(e) => setFrame({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <Screen refreshing={loading} onRefresh={reload}>
        <Stack.Screen options={{ title: 'Match' }} />
        <View style={{ gap: space.s }}>
          <Row style={{ flexWrap: 'wrap' }}>
            <Tag kind={match.kind} label={`${match.kind} · ${match.holes}`} />
            <Tag kind="final" label={isStableford ? 'Stableford' : 'Stroke play'} />
            {match.bonus_awards.length ? <Tag kind="bonus" label="Bonus" /> : null}
            {match.status === 'open' ? <Tag kind="live" label="● Live" /> : <Tag kind="final" label="Final" />}
          </Row>
          <T variant="eyebrow" style={{ color: c.accentText }}>
            {league ? leagueTitle(league) : 'Casual round'}
          </T>
          <T variant="display" style={{ fontSize: 40, lineHeight: 40 }}>
            {course?.name ?? 'Match'}
          </T>
          <T muted>
            {[
              match.nine ? (match.nine === 'front' ? 'Front nine' : 'Back nine') : `${match.holes} holes`,
              `Par ${played.par}`,
              tee?.name,
              formatDay(match.played_on),
            ]
              .filter(Boolean)
              .join(' · ')}
          </T>
        </View>
        <ErrorText error={saveError ?? error} />
        {casual && match.status === 'open' && match.join_code ? (
          <Card
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
            <View style={{ flex: 1 }}>
              <T variant="eyebrow" muted>
                Match code
              </T>
              <T style={{ fontFamily: fonts.num, fontSize: 26, letterSpacing: 2 }}>{match.join_code}</T>
            </View>
            <T variant="label" muted style={{ flex: 1, textAlign: 'right' }}>
              Friends enter this under Matches → Join a match.
            </T>
          </Card>
        ) : null}
        {locked ? (
          <T variant="eyebrow" muted>
            Season finished · scores are locked
          </T>
        ) : null}
        {!editable && match.status === 'open' ? (
          <T variant="eyebrow" style={{ color: c.danger }}>
            ● Watching live · scores update on their own
          </T>
        ) : null}

        {editable ? (
          <Card>
            <Segmented
              options={[
                { value: 'holes', label: 'Hole by hole' },
                { value: 'totals', label: 'Totals only' },
              ]}
              value={mode}
              onChange={setMode}
            />
            {mode === 'holes' ? (
              <>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Button title="‹" kind="secondary" compact disabled={hole === 0} onPress={() => setHole(hole - 1)} />
                  <View style={{ alignItems: 'center' }}>
                    <T variant="eyebrow" muted>
                      Hole
                    </T>
                    <T variant="score">{hole + 1 + holeOffset}</T>
                    <T variant="label" muted>
                      {parOf(hole) != null ? `Par ${parOf(hole)}` : 'Par –'}
                      {played.strokeIndex ? ` · SI ${played.strokeIndex[hole]}` : ''}
                    </T>
                  </View>
                  <Button
                    title="›"
                    kind="secondary"
                    compact
                    disabled={hole === played.holes - 1}
                    onPress={() => setHole(hole + 1)}
                  />
                </Row>
                {match.match_players.map((p) => {
                  const value = p.hole_scores?.[hole] ?? null;
                  const par = parOf(hole) ?? 4;
                  return (
                    <Row key={p.user_id} style={{ justifyContent: 'space-between', minHeight: 56 }}>
                      <View style={{ flex: 1 }}>
                        <T style={{ fontFamily: fonts.bodyBold }}>{nameOf(p.user_id)}</T>
                        {isStableford && value != null && parOf(hole) != null ? (
                          <T variant="label" muted>
                            {stablefordHole(value, parOf(hole)!)} pts
                          </T>
                        ) : null}
                      </View>
                      <Stepper
                        value={value}
                        par={parOf(hole)}
                        onMinus={() => setHoleScore(p, value == null ? par : Math.max(1, value - 1))}
                        onPlus={() => setHoleScore(p, value == null ? par : Math.min(15, value + 1))}
                        onClear={() => setHoleScore(p, null)}
                      />
                    </Row>
                  );
                })}
                <T variant="label" muted>
                  Tap − or + to start at par. Long-press the score to clear it.
                </T>
              </>
            ) : (
              match.match_players.map((p) => (
                <Field
                  key={p.user_id}
                  label={`${nameOf(p.user_id)} total`}
                  keyboardType="number-pad"
                  defaultValue={p.gross != null ? String(p.gross) : ''}
                  onEndEditing={(e) => {
                    const n = parseInt(e.nativeEvent.text, 10);
                    updatePlayer(p.user_id, {
                      gross: Number.isNaN(n) ? null : n,
                    });
                  }}
                />
              ))
            )}
          </Card>
        ) : null}

        {match.status === 'final' ? (
          <>
            <Section
              title="Result"
              right={
                <T variant="eyebrow" muted>
                  {isStableford ? 'Stableford' : 'Stroke play'}
                </T>
              }
            />
            <View style={{ marginTop: -space.s }}>
              {results.map((r) => {
                const p = match.match_players.find((x) => x.user_id === r.userId)!;
                const lead = r.position === 1 && r.score != null;
                return (
                  <Row
                    key={r.userId}
                    style={{
                      gap: space.m,
                      paddingVertical: space.m,
                      paddingHorizontal: space.m,
                      borderRadius: lead ? radius.input : 0,
                      backgroundColor: lead ? c.leader : undefined,
                      borderBottomWidth: lead ? 0 : 1,
                      borderColor: c.border,
                    }}>
                    <T
                      style={{
                        width: 28,
                        textAlign: 'center',
                        fontFamily: fonts.num,
                        fontSize: 22,
                        color: lead ? c.onLeader : c.text,
                      }}>
                      {r.position == null ? '–' : `${r.tied ? 'T' : ''}${r.position}`}
                    </T>
                    <View style={{ flex: 1 }}>
                      <PlayerLink id={r.userId}>
                        <T
                          style={{
                            fontFamily: fonts.bodyBold,
                            fontSize: 16,
                            color: lead ? c.onLeader : c.text,
                          }}>
                          {nameOf(r.userId)}
                        </T>
                      </PlayerLink>
                      <T variant="label" style={{ color: lead ? c.onLeader : c.muted }}>
                        {teeOf(p)?.name ?? ''}
                        {showScores
                          ? [
                              isStableford && r.gross != null ? ` · ${r.gross} strokes` : '',
                              !casual ? ` · +${r.total} league pts` : '',
                              r.bonusPoints ? ` (${r.bonusPoints} bonus)` : '',
                              r.gross == null ? ' · card not finished' : '',
                            ].join('')
                          : [
                              isStableford && r.stableford != null && !casual ? ` · ${r.stableford} pts` : '',
                              r.gross != null
                                ? casual && !isStableford
                                  ? ''
                                  : ` · ${r.gross} strokes`
                                : ' · card not finished',
                              r.bonusPoints ? ` · +${r.bonusPoints} bonus` : '',
                            ].join('')}
                      </T>
                    </View>
                    <T
                      style={{
                        fontFamily: fonts.num,
                        fontSize: 28,
                        color: lead ? c.onLeader : c.text,
                      }}>
                      {casual || showScores ? ((isStableford ? r.stableford : r.gross) ?? '–') : r.total}
                    </T>
                  </Row>
                );
              })}
            </View>
            {results.some((r) => r.tiebreakNote) ? (
              <T variant="label" muted>
                Tie: {[...new Set(results.map((r) => r.tiebreakNote).filter(Boolean))].join(', ')}
              </T>
            ) : null}
            {scorecard}

            {match.status === 'final' ? (
              <Rundown
                summary={rundownText(results, nameOf, isStableford, played.par)}
                happenings={matchHappenings({
                  players: match.match_players.map((p) => ({
                    userId: p.user_id,
                    name: nameOf(p.user_id),
                    holeScores: p.hole_scores,
                  })),
                  holePars: played.holePars,
                  holeOffset,
                })}
              />
            ) : null}
          </>
        ) : (
          <>
            {scorecard}

            {/* Live updates are for people watching; players in the match don't need the distraction. */}
            {!isPlayer && match.status === 'open' ? (
              <Commentary
                lines={buildCommentary({
                  players: match.match_players.map((p) => ({
                    userId: p.user_id,
                    name: nameOf(p.user_id),
                    holeScores: p.hole_scores,
                    courseHandicap: p.course_handicap,
                  })),
                  holes: played.holes,
                  holePars: played.holePars,
                  strokeIndex: played.strokeIndex,
                  scoring: settings.scoring,
                  holeOffset,
                })}
                offset={holeOffset}
              />
            ) : null}

            {myResult ? (
              <Row
                style={{
                  justifyContent: 'space-between',
                  alignItems: 'flex-end',
                }}>
                <View>
                  <T variant="eyebrow" muted>
                    {isStableford ? 'Your Stableford' : 'Your strokes'}
                  </T>
                  <T variant="score" style={{ fontSize: 56, lineHeight: 54 }}>
                    {(isStableford ? myStableford : myResult.gross) ?? '–'}
                  </T>
                </View>
                {!casual ? (
                  <View style={{ alignItems: 'flex-end' }}>
                    <T variant="eyebrow" muted>
                      League points
                    </T>
                    <T
                      variant="score"
                      style={{
                        fontSize: 56,
                        lineHeight: 54,
                        color: c.accentText,
                      }}>
                      +{myResult.total}
                    </T>
                  </View>
                ) : null}
              </Row>
            ) : null}

            <Section
              title="Standings so far"
              right={
                <T variant="eyebrow" muted>
                  {isStableford ? 'Stableford' : 'Stroke play'}
                </T>
              }
            />
            <View style={{ marginTop: -space.s }}>
              {results.map((r) => {
                const p = match.match_players.find((x) => x.user_id === r.userId)!;
                const lead = r.position === 1 && r.score != null;
                return (
                  <Row
                    key={r.userId}
                    style={{
                      gap: space.m,
                      paddingVertical: space.m,
                      paddingHorizontal: space.m,
                      borderRadius: lead ? radius.input : 0,
                      backgroundColor: lead ? c.leader : undefined,
                      borderBottomWidth: lead ? 0 : 1,
                      borderColor: c.border,
                    }}>
                    <T
                      style={{
                        width: 28,
                        textAlign: 'center',
                        fontFamily: fonts.num,
                        fontSize: 22,
                        color: lead ? c.onLeader : c.text,
                      }}>
                      {r.position == null ? '–' : `${r.tied ? 'T' : ''}${r.position}`}
                    </T>
                    <View style={{ flex: 1 }}>
                      <PlayerLink id={r.userId}>
                        <T
                          style={{
                            fontFamily: fonts.bodyBold,
                            fontSize: 16,
                            color: lead ? c.onLeader : c.text,
                          }}>
                          {nameOf(r.userId)}
                        </T>
                      </PlayerLink>
                      <T variant="label" style={{ color: lead ? c.onLeader : c.muted }}>
                        {teeOf(p)?.name ?? ''}
                        {showScores
                          ? [
                              isStableford && r.gross != null ? ` · ${r.gross} strokes` : '',
                              !casual ? ` · +${r.total} league pts` : '',
                              r.bonusPoints ? ` (${r.bonusPoints} bonus)` : '',
                              r.gross == null ? ' · card not finished' : '',
                            ].join('')
                          : [
                              isStableford && r.stableford != null && !casual ? ` · ${r.stableford} pts` : '',
                              r.gross != null
                                ? casual && !isStableford
                                  ? ''
                                  : ` · ${r.gross} strokes`
                                : ' · card not finished',
                              r.bonusPoints ? ` · +${r.bonusPoints} bonus` : '',
                            ].join('')}
                      </T>
                    </View>
                    <T
                      style={{
                        fontFamily: fonts.num,
                        fontSize: 28,
                        color: lead ? c.onLeader : c.text,
                      }}>
                      {casual || showScores ? ((isStableford ? r.stableford : r.gross) ?? '–') : r.total}
                    </T>
                  </Row>
                );
              })}
            </View>
            {results.some((r) => r.tiebreakNote) ? (
              <T variant="label" muted>
                Tie: {[...new Set(results.map((r) => r.tiebreakNote).filter(Boolean))].join(', ')}
              </T>
            ) : null}
          </>
        )}

        {settings.tiebreak === 'playoff' &&
        editable &&
        (tied.length > 0 || match.match_players.some((p) => p.playoff_rank != null)) ? (
          <Card>
            <T variant="title">Playoff</T>
            <T variant="label" muted>
              Enter the playoff finishing order for tied players (1 = winner).
            </T>
            {match.match_players
              .filter((p) => tied.some((t) => t.userId === p.user_id) || p.playoff_rank != null)
              .map((p) => (
                <Row key={p.user_id} style={{ justifyContent: 'space-between' }}>
                  <T>{nameOf(p.user_id)}</T>
                  <TextInput
                    keyboardType="number-pad"
                    defaultValue={p.playoff_rank != null ? String(p.playoff_rank) : ''}
                    onEndEditing={(e) => {
                      const n = parseInt(e.nativeEvent.text, 10);
                      updatePlayer(p.user_id, {
                        playoff_rank: Number.isNaN(n) ? null : n,
                      });
                    }}
                    style={{
                      width: 64,
                      minHeight: 44,
                      borderWidth: 1,
                      borderColor: c.border,
                      borderRadius: radius.small,
                      color: c.text,
                      textAlign: 'center',
                      fontFamily: fonts.mono,
                    }}
                  />
                </Row>
              ))}
          </Card>
        ) : null}

        {casual ? null : (
          <Bonuses
            editable={editable}
            canRemove={(createdBy) => isAdmin || createdBy === userId}
            bonuses={match.bonus_awards}
            players={match.match_players.map((p) => ({
              id: p.user_id,
              name: nameOf(p.user_id),
            }))}
            types={settings.bonusTypes}
            maxHole={played.holes + holeOffset}
            onAdd={(b) => action.run(async () => (await addBonus({ matchId: match.id, ...b }), await reload()))}
            onRemove={(bid) => action.run(async () => (await removeBonus(bid), await reload()))}
          />
        )}

        <ErrorText error={action.error} />
        {canManage ? (
          match.status === 'open' ? (
            <Button
              title="Finish match"
              onPress={() =>
                action.run(async () => {
                  await setMatchStatus(match.id, 'final');
                  await reload();
                  setCelebrate(true);
                })
              }
              busy={action.busy}
            />
          ) : (
            <Button
              title="Reopen for edits"
              kind="secondary"
              onPress={() =>
                action.run(async () => {
                  await setMatchStatus(match.id, 'open');
                  await reload();
                })
              }
            />
          )
        ) : null}
        {match.status === 'open' && !casual ? (
          <T variant="label" muted>
            Points count in the league table once the match is finished.
          </T>
        ) : null}
        {canManage ? <Button title="Delete match" kind="danger" onPress={confirmDelete} /> : null}
      </Screen>
      {/* Fireworks over the whole screen when the match has just been finished. */}
      {celebrate && frame ? <Fireworks width={frame.w} height={frame.h * 0.7} bursts={6} /> : null}
    </View>
  );
}

function Stepper({
  value,
  par,
  onMinus,
  onPlus,
  onClear,
}: {
  value: number | null;
  par: number | null;
  onMinus: () => void;
  onPlus: () => void;
  onClear: () => void;
}) {
  return (
    <Row>
      <Button title="−" kind="secondary" compact onPress={onMinus} style={{ width: 48 }} />
      <Pressable onLongPress={onClear} style={{ width: 56, alignItems: 'center' }}>
        <ScoreMark score={value} par={par} size={46} fontSize={26} />
      </Pressable>
      <Button title="+" kind="secondary" compact onPress={onPlus} style={{ width: 48 }} />
    </Row>
  );
}

/**
 * Paper-scorecard marks from the brand book: birdie circled in red, eagle double circle,
 * bogey square, double bogey (or worse) double square, par plain.
 */
function ScoreMark({
  score,
  par,
  size = 24,
  fontSize = 16,
}: {
  score: number | null;
  par: number | null;
  size?: number;
  fontSize?: number;
}) {
  const c = usePalette();
  const diff = score != null && par != null ? score - par : 0;
  const red = diff < 0;
  const color = red ? c.danger : c.text;
  const line = red ? c.danger : c.muted;
  const round = diff < 0;
  const double = diff <= -2 || diff >= 2;
  const ring = diff !== 0;
  const inner = double ? size - 8 : size;
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: ring && double ? 1.5 : 0,
        borderColor: line,
        borderRadius: round ? size / 2 : 3,
      }}>
      <View
        style={{
          width: inner,
          height: inner,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: ring ? 1.5 : 0,
          borderColor: line,
          borderRadius: round ? inner / 2 : 2,
        }}>
        <Text
          style={{
            fontFamily: fonts.num,
            fontSize,
            color,
            lineHeight: fontSize * 1.1,
          }}>
          {score ?? '–'}
        </Text>
      </View>
    </View>
  );
}

function Scorecard({
  holes,
  offset,
  pars,
  players,
  current,
  onPickHole,
}: {
  holes: number;
  offset: number;
  pars: number[] | null;
  players: { id: string; name: string; scores: (number | null)[]; bonusHoles?: number[] }[];
  current: number | null;
  onPickHole: (i: number) => void;
}) {
  const c = usePalette();
  const blocks = holes === 18 ? [0, 9] : [0];
  const sum = (xs: (number | null | undefined)[]) =>
    xs.length && xs.every((x) => x != null) ? (xs as number[]).reduce((a, b) => a + b, 0) : '';
  const cell = {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };
  const nameW = 56;
  return (
    <View style={{ gap: space.s }}>
      {blocks.map((start) => {
        const cols = [...Array(9).keys()].map((k) => start + k);
        return (
          <View
            key={start}
            style={{
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: radius.input,
              overflow: 'hidden',
            }}>
            <Row style={{ gap: 0, backgroundColor: c.surface, height: 26 }}>
              <View style={{ width: nameW, paddingLeft: space.s }}>
                <T variant="eyebrow" muted>
                  {holes === 18 ? (start === 0 ? 'Out' : 'In') : 'Hole'}
                </T>
              </View>
              {cols.map((i) => (
                <Pressable
                  key={i}
                  onPress={() => onPickHole(i)}
                  style={[cell, { height: 26 }, current === i && { backgroundColor: c.accent }]}>
                  <T variant="eyebrow" style={{ color: current === i ? c.onAccent : c.muted }}>
                    {i + 1 + offset}
                  </T>
                </Pressable>
              ))}
              <View style={[cell, { maxWidth: 36 }]} />
            </Row>
            {pars ? (
              <Row style={{ gap: 0, backgroundColor: c.surface, height: 22 }}>
                <View style={{ width: nameW, paddingLeft: space.s }}>
                  <T variant="eyebrow" muted>
                    Par
                  </T>
                </View>
                {cols.map((i) => (
                  <View key={i} style={cell}>
                    <T variant="eyebrow" muted>
                      {pars[i]}
                    </T>
                  </View>
                ))}
                <View style={[cell, { maxWidth: 36 }]}>
                  <T variant="eyebrow" muted>
                    {sum(cols.map((i) => pars[i]))}
                  </T>
                </View>
              </Row>
            ) : null}
            {players.map((p) => (
              <Row
                key={p.id}
                style={{
                  gap: 0,
                  height: 38,
                  borderTopWidth: 1,
                  borderColor: c.border,
                }}>
                <PlayerLink id={p.id} style={{ width: nameW, paddingLeft: space.s }}>
                  <T variant="label" numberOfLines={1} style={{ fontFamily: fonts.bodyBold }}>
                    {p.name}
                  </T>
                </PlayerLink>
                {cols.map((i) => (
                  <View
                    key={i}
                    style={[
                      cell,
                      p.bonusHoles?.includes(i) && { backgroundColor: c.accent, borderRadius: 4, margin: 2 },
                    ]}>
                    {p.scores[i] != null ? <ScoreMark score={p.scores[i]!} par={pars?.[i] ?? null} /> : <T muted>·</T>}
                  </View>
                ))}
                <View style={[cell, { maxWidth: 36 }]}>
                  <T style={{ fontFamily: fonts.num, fontSize: 16 }}>{sum(cols.map((i) => p.scores[i]))}</T>
                </View>
              </Row>
            ))}
          </View>
        );
      })}
      {players.some((p) => p.bonusHoles?.length) ? (
        <Row style={{ gap: space.s }}>
          <View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: c.accent }} />
          <T variant="label" muted>
            Bonus earned on that hole
          </T>
        </Row>
      ) : null}
    </View>
  );
}

function Bonuses({
  editable,
  canRemove,
  bonuses,
  players,
  types,
  maxHole,
  onAdd,
  onRemove,
}: {
  editable: boolean;
  canRemove: (createdBy: string) => boolean;
  bonuses: {
    id: string;
    user_id: string;
    label: string;
    points: number;
    hole: number | null;
    created_by: string;
  }[];
  players: { id: string; name: string }[];
  types: { key: string; label: string; points: number }[];
  maxHole: number;
  onAdd: (b: { userId: string; typeKey: string | null; label: string; points: number; hole: number | null }) => void;
  onRemove: (id: string) => void;
}) {
  const [who, setWho] = useState<string | null>(null);
  const [typeKey, setTypeKey] = useState<string | null>(types[0]?.key ?? null);
  const [customLabel, setCustomLabel] = useState('');
  const [customPoints, setCustomPoints] = useState('5');
  const [hole, setHole] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const c = usePalette();
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '';

  const add = () => {
    setErr(null);
    if (!who) return setErr('Pick who earned it.');
    const h = hole.trim() ? parseInt(hole, 10) : null;
    if (h != null && (Number.isNaN(h) || h < 1 || h > maxHole)) return setErr(`Hole should be 1 to ${maxHole}.`);
    if (typeKey) {
      const t = types.find((x) => x.key === typeKey)!;
      onAdd({
        userId: who,
        typeKey: t.key,
        label: t.label,
        points: t.points,
        hole: h,
      });
    } else {
      const pts = Number(customPoints.replace(',', '.'));
      if (!customLabel.trim() || Number.isNaN(pts)) return setErr('Give the bonus a name and points.');
      onAdd({
        userId: who,
        typeKey: null,
        label: customLabel.trim(),
        points: pts,
        hole: h,
      });
    }
    setHole('');
    setCustomLabel('');
  };

  return (
    <Card>
      <T variant="h2">Bonus points</T>
      {bonuses.length === 0 ? <T muted>None yet. Log the cool shots here.</T> : null}
      {bonuses.map((b) => (
        <Row
          key={b.id}
          style={{
            justifyContent: 'space-between',
            backgroundColor: c.bg,
            borderRadius: radius.input,
            padding: space.m,
          }}>
          <View style={{ flex: 1 }}>
            <T>
              {b.label}
              {b.hole ? `, hole ${b.hole}` : ''}
            </T>
            <PlayerLink id={b.user_id}>
              <T variant="label" muted>
                {nameOf(b.user_id)}
              </T>
            </PlayerLink>
          </View>
          <T style={{ fontFamily: fonts.num, fontSize: 24, color: c.accentText }}>+{Number(b.points)}</T>
          {editable && canRemove(b.created_by) ? (
            <Button title="✕" kind="secondary" compact onPress={() => onRemove(b.id)} />
          ) : null}
        </Row>
      ))}
      {editable ? (
        <View style={{ gap: space.s, marginTop: space.s }}>
          <T variant="label" muted>
            WHO
          </T>
          <Row style={{ flexWrap: 'wrap' }}>
            {players.map((p) => (
              <Chip key={p.id} label={p.name} on={who === p.id} onPress={() => setWho(p.id)} />
            ))}
          </Row>
          <T variant="label" muted>
            FOR
          </T>
          <Row style={{ flexWrap: 'wrap' }}>
            {types.map((t) => (
              <Chip
                key={t.key}
                label={`${t.label} +${t.points}`}
                on={typeKey === t.key}
                onPress={() => setTypeKey(t.key)}
              />
            ))}
            <Chip label="Custom" on={typeKey === null} onPress={() => setTypeKey(null)} />
          </Row>
          {typeKey === null ? (
            <Row style={{ alignItems: 'flex-start' }}>
              <View style={{ flex: 2 }}>
                <Field
                  label="What happened"
                  value={customLabel}
                  onChangeText={setCustomLabel}
                  placeholder="e.g. Drove the green"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Points"
                  value={customPoints}
                  onChangeText={setCustomPoints}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </Row>
          ) : null}
          <Field label="Hole (optional)" value={hole} onChangeText={setHole} keyboardType="number-pad" />
          <ErrorText error={err} />
          <Button title="Add bonus" kind="secondary" onPress={add} />
        </View>
      ) : null}
    </Card>
  );
}

function Commentary({ lines, offset }: { lines: CommentaryLine[]; offset: number }) {
  const c = usePalette();
  const [all, setAll] = useState(false);
  if (lines.length === 0) return null;
  const color = {
    great: c.accentText,
    ouch: c.danger,
    lead: c.primary,
    hole: c.text,
  };
  const shown = all ? lines : lines.slice(0, 6);
  return (
    <Card>
      <T variant="h2">Live updates</T>
      {shown.map((l, i) => (
        <Row key={i} style={{ alignItems: 'flex-start' }}>
          <T variant="label" muted style={{ width: 32, paddingTop: 3 }}>
            #{l.hole + 1 + offset}
          </T>
          <T
            style={{
              flex: 1,
              color: color[l.kind],
              fontFamily: l.kind === 'hole' ? fonts.body : fonts.bodyBold,
            }}>
            {l.text}
          </T>
        </Row>
      ))}
      {lines.length > 6 ? (
        <Button title={all ? 'Show less' : `Show all ${lines.length}`} kind="secondary" onPress={() => setAll(!all)} />
      ) : null}
    </Card>
  );
}

const toParText = (n: number) => (n === 0 ? 'E' : n > 0 ? `+${n}` : String(n));

/** One or two sentences on how the match went. */
function rundownText(
  results: {
    userId: string;
    position: number | null;
    gross: number | null;
    stableford: number | null;
    tiebreakNote: string | null;
  }[],
  nameOf: (id: string) => string,
  stableford: boolean,
  par: number,
): string | null {
  const done = results.filter((r) => r.position != null && (stableford ? r.stableford != null : r.gross != null));
  if (done.length === 0) return null;
  const score = (r: (typeof done)[number]) =>
    stableford ? `${r.stableford} points` : `${r.gross} (${toParText(r.gross! - par)})`;
  const firsts = done.filter((r) => r.position === 1);
  const names = firsts.map((r) => nameOf(r.userId));
  if (done.length === 1) return `${names[0]} went round in ${score(done[0])}.`;
  if (firsts.length > 1) return `${names.join(' and ')} tied for the win on ${score(firsts[0])}.`;
  const win = firsts[0];
  const second = done.filter((r) => r.position !== 1).sort((a, b) => a.position! - b.position!)[0];
  const gap = stableford ? second.stableford! - win.stableford! : second.gross! - win.gross!;
  const margin = Math.abs(gap);
  const how =
    margin === 0
      ? `edging ${nameOf(second.userId)}${win.tiebreakNote ? ` on ${win.tiebreakNote}` : ''}`
      : `beating ${nameOf(second.userId)} by ${margin} ${stableford ? (margin === 1 ? 'point' : 'points') : margin === 1 ? 'stroke' : 'strokes'}`;
  const last = done.filter((r) => r.position !== 1).sort((a, b) => b.position! - a.position!)[0];
  const tail =
    done.length > 2 && last.userId !== second.userId
      ? ` ${nameOf(last.userId)} brought up the rear with ${score(last)}.`
      : '';
  return `${nameOf(win.userId)} won with ${score(win)}, ${how}.${tail}`;
}

function Rundown({ summary, happenings }: { summary: string | null; happenings: Happening[] }) {
  const c = usePalette();
  if (!summary && happenings.length === 0) return null;
  const color = { great: c.accentText, ouch: c.danger, info: c.text };
  return (
    <Card>
      <T variant="h2">Rundown</T>
      {summary ? <T>{summary}</T> : null}
      {happenings.length ? (
        <>
          <T variant="eyebrow" muted style={{ marginTop: space.s }}>
            Noted happenings
          </T>
          {happenings.map((h, i) => (
            <Row key={i} style={{ alignItems: 'flex-start' }}>
              <T style={{ width: 16, color: color[h.kind] }}>
                {h.kind === 'great' ? '★' : h.kind === 'ouch' ? '✕' : '·'}
              </T>
              <T
                style={{
                  flex: 1,
                  color: h.kind === 'info' ? c.text : color[h.kind],
                  fontFamily: fonts.bodyBold,
                }}>
                {h.text}
              </T>
            </Row>
          ))}
        </>
      ) : null}
    </Card>
  );
}

function formatDay(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
