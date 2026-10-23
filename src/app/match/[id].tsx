import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';

import {
  addBonus,
  deleteMatch,
  displayName,
  getLeague,
  getMatch,
  holesFor,
  listCourses,
  removeBonus,
  resultsFor,
  saveScore,
  setMatchStatus,
  type MatchPlayerRow,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { buildCommentary, type CommentaryLine } from '@/lib/commentary';
import { strokesPerHole } from '@/lib/handicap';
import { useAction, useLoad } from '@/lib/useLoad';
import { Button, Card, Chip, ErrorText, Field, Row, Screen, Segmented, T } from '@/ui/components';
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
  const action = useAction();

  const { data, error, loading, reload, setData } = useLoad(async () => {
    const match = await getMatch(id);
    const [bundle, courses] = await Promise.all([getLeague(match.league_id), listCourses()]);
    return { match, courses, ...bundle };
  }, [id], {
    // Keep the scorecard live for everyone, but never overwrite a score someone is entering.
    pollMs: 5000,
    shouldSkip: () => pendingSaves.current > 0 || Date.now() - lastEdit.current < 4000,
  });

  if (!data) {
    return (
      <Screen refreshing={loading} onRefresh={reload}>
        <ErrorText error={error} />
      </Screen>
    );
  }

  const { match, courses, members, settings } = data;
  const isAdmin = members.some((m) => m.user_id === userId && m.role === 'admin');
  const canManage = isAdmin || match.created_by === userId;
  const isPlayer = match.match_players.some((p) => p.user_id === userId);
  // Anyone playing (or whoever set the match up) can keep score for everyone. Others watch.
  const editable = isAdmin || (match.status === 'open' && (isPlayer || match.created_by === userId));
  const { course, tee, played } = holesFor(match, courses);
  const nameOf = (uid: string) => displayName(members.find((m) => m.user_id === uid)?.profiles);
  const results = resultsFor(match, settings);
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
  const confirmDelete = () =>
    Alert.alert('Delete match?', 'Scores and bonuses for this match are removed for good.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          action.run(async () => {
            await deleteMatch(match.id);
            router.back();
          }),
      },
    ]);

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <Stack.Screen options={{ title: (course?.name ?? 'Match').toUpperCase() }} />
      <Row style={{ justifyContent: 'space-between' }}>
        <T muted>
          {match.played_on} · {tee?.name ?? 'No tee'} · {match.holes} holes
          {match.nine ? ` (${match.nine})` : ''}
        </T>
        <T variant="label" style={{ color: match.kind === 'major' ? c.accentText : c.muted }}>
          {match.kind.toUpperCase()}
          {match.status === 'final' ? ' · FINAL' : ''}
        </T>
      </Row>
      <ErrorText error={saveError ?? error} />
      {!editable && match.status === 'open' ? (
        <T variant="label" style={{ color: c.danger }}>
          ● WATCHING LIVE · scores update on their own
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
                <Button title="‹" kind="secondary" disabled={hole === 0} onPress={() => setHole(hole - 1)} />
                <View style={{ alignItems: 'center' }}>
                  <T variant="h1">Hole {hole + 1 + holeOffset}</T>
                  <T variant="label" muted>
                    {parOf(hole) != null ? `Par ${parOf(hole)}` : 'Par –'}
                    {played.strokeIndex ? ` · SI ${played.strokeIndex[hole]}` : ''}
                  </T>
                </View>
                <Button
                  title="›"
                  kind="secondary"
                  disabled={hole === played.holes - 1}
                  onPress={() => setHole(hole + 1)}
                />
              </Row>
              {match.match_players.map((p) => {
                const value = p.hole_scores?.[hole] ?? null;
                const par = parOf(hole) ?? 4;
                const shots = strokesPerHole(p.course_handicap, played.holes, played.strokeIndex)[hole];
                return (
                  <Row key={p.user_id} style={{ justifyContent: 'space-between', minHeight: 56 }}>
                    <View style={{ flex: 1 }}>
                      <T style={{ fontFamily: fonts.bodyBold }}>{nameOf(p.user_id)}</T>
                      <T variant="label" muted>
                        {shots > 0 ? `${'•'.repeat(shots)} gets ${shots}` : ' '}
                      </T>
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
                  updatePlayer(p.user_id, { gross: Number.isNaN(n) ? null : n });
                }}
              />
            ))
          )}
        </Card>
      ) : null}

      <Scorecard
        holes={played.holes}
        offset={holeOffset}
        pars={played.holePars}
        players={match.match_players.map((p) => ({ name: nameOf(p.user_id), scores: p.hole_scores ?? [] }))}
        current={mode === 'holes' && editable ? hole : null}
        onPickHole={setHole}
      />

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

      <Card>
        <T variant="h2">{match.status === 'final' ? 'Result' : 'Standings so far'}</T>
        {results.map((r) => {
          const p = match.match_players.find((x) => x.user_id === r.userId)!;
          return (
            <Row key={r.userId} style={{ minHeight: 48 }}>
              <T variant="mono" style={{ width: 36 }}>
                {r.position == null ? '–' : `${r.tied ? 'T' : ''}${r.position}`}
              </T>
              <View style={{ flex: 1 }}>
                <T style={{ fontFamily: fonts.bodyBold }}>{nameOf(r.userId)}</T>
                <T variant="label" muted>
                  {teeOf(p)?.name ?? ''} · CH {p.course_handicap}
                  {r.gross != null ? ` · ${r.gross} gross · ${r.net} net` : ' · no score yet'}
                </T>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <T variant="mono" style={{ fontSize: 18 }}>
                  {r.total}
                </T>
                {r.bonusPoints ? (
                  <T variant="label" muted>
                    incl. +{r.bonusPoints} bonus
                  </T>
                ) : null}
              </View>
            </Row>
          );
        })}
        {results.some((r) => r.tiebreakNote) ? (
          <T variant="label" muted>
            Tie: {[...new Set(results.map((r) => r.tiebreakNote).filter(Boolean))].join(', ')}
          </T>
        ) : null}
        <T variant="label" muted>
          Ranked on {settings.scoring} score
          {match.kind === 'minor' ? `, minor points × ${settings.minorMultiplier}` : ''}.
        </T>
      </Card>

      {settings.tiebreak === 'playoff' && editable && (tied.length > 0 || match.match_players.some((p) => p.playoff_rank != null)) ? (
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
                    updatePlayer(p.user_id, { playoff_rank: Number.isNaN(n) ? null : n });
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

      <Bonuses
        editable={editable}
        canRemove={(createdBy) => isAdmin || createdBy === userId}
        bonuses={match.bonus_awards}
        players={match.match_players.map((p) => ({ id: p.user_id, name: nameOf(p.user_id) }))}
        types={settings.bonusTypes}
        maxHole={played.holes + holeOffset}
        onAdd={(b) => action.run(async () => (await addBonus({ matchId: match.id, ...b }), await reload()))}
        onRemove={(bid) => action.run(async () => (await removeBonus(bid), await reload()))}
      />

      <ErrorText error={action.error} />
      {canManage ? (
        match.status === 'open' ? (
          <Button
            title="Finish match"
            onPress={() =>
              action.run(async () => {
                await setMatchStatus(match.id, 'final');
                await reload();
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
      {match.status === 'open' ? (
        <T variant="label" muted>
          Points count in the league table once the match is finished.
        </T>
      ) : null}
      {canManage ? <Button title="Delete match" kind="danger" onPress={confirmDelete} /> : null}
    </Screen>
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
  const c = usePalette();
  const under = value != null && par != null && value < par;
  return (
    <Row>
      <Button title="−" kind="secondary" onPress={onMinus} style={{ paddingHorizontal: space.l }} />
      <Pressable onLongPress={onClear} style={{ width: 52, alignItems: 'center' }}>
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: under ? 2 : 0,
            borderColor: c.danger,
          }}>
          <T variant="mono" style={{ fontSize: 26, color: under ? c.danger : c.text }}>
            {value ?? '–'}
          </T>
        </View>
      </Pressable>
      <Button title="+" kind="secondary" onPress={onPlus} style={{ paddingHorizontal: space.l }} />
    </Row>
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
  players: { name: string; scores: (number | null)[] }[];
  current: number | null;
  onPickHole: (i: number) => void;
}) {
  const c = usePalette();
  const cols = [...Array(holes).keys()];
  const cell = { width: 34, alignItems: 'center' as const, justifyContent: 'center' as const, height: 34 };
  const sum = (xs: (number | null | undefined)[]) =>
    xs.every((x) => x != null) && xs.length ? (xs as number[]).reduce((a, b) => a + b, 0) : '';
  return (
    <Card style={{ padding: space.s }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <Row style={{ gap: 0 }}>
            <View style={{ width: 84 }}>
              <T variant="label" muted>
                HOLE
              </T>
            </View>
            {cols.map((i) => (
              <Pressable
                key={i}
                onPress={() => onPickHole(i)}
                style={[cell, current === i && { backgroundColor: c.accent, borderRadius: radius.small }]}>
                <T variant="label" style={current === i ? { color: c.onAccent } : undefined}>
                  {i + 1 + offset}
                </T>
              </Pressable>
            ))}
            <View style={[cell, { width: 44 }]}>
              <T variant="label">TOT</T>
            </View>
          </Row>
          {pars ? (
            <Row style={{ gap: 0 }}>
              <View style={{ width: 84 }}>
                <T variant="label" muted>
                  PAR
                </T>
              </View>
              {cols.map((i) => (
                <View key={i} style={cell}>
                  <T variant="label" muted>
                    {pars[i]}
                  </T>
                </View>
              ))}
              <View style={[cell, { width: 44 }]}>
                <T variant="label" muted>
                  {sum(pars)}
                </T>
              </View>
            </Row>
          ) : null}
          {players.map((p) => (
            <Row key={p.name} style={{ gap: 0, borderTopWidth: 1, borderColor: c.border }}>
              <View style={{ width: 84 }}>
                <T variant="label" numberOfLines={1}>
                  {p.name}
                </T>
              </View>
              {cols.map((i) => {
                const s = p.scores[i];
                const under = s != null && pars && s < pars[i];
                return (
                  <View key={i} style={cell}>
                    <T variant="mono" style={{ fontSize: 14, color: under ? c.danger : c.text }}>
                      {s ?? '·'}
                    </T>
                  </View>
                );
              })}
              <View style={[cell, { width: 44 }]}>
                <T variant="mono" style={{ fontSize: 14 }}>
                  {sum(cols.map((i) => p.scores[i]))}
                </T>
              </View>
            </Row>
          ))}
        </View>
      </ScrollView>
    </Card>
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
  bonuses: { id: string; user_id: string; label: string; points: number; hole: number | null; created_by: string }[];
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
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '';

  const add = () => {
    setErr(null);
    if (!who) return setErr('Pick who earned it.');
    const h = hole.trim() ? parseInt(hole, 10) : null;
    if (h != null && (Number.isNaN(h) || h < 1 || h > maxHole)) return setErr(`Hole should be 1 to ${maxHole}.`);
    if (typeKey) {
      const t = types.find((x) => x.key === typeKey)!;
      onAdd({ userId: who, typeKey: t.key, label: t.label, points: t.points, hole: h });
    } else {
      const pts = Number(customPoints.replace(',', '.'));
      if (!customLabel.trim() || Number.isNaN(pts)) return setErr('Give the bonus a name and points.');
      onAdd({ userId: who, typeKey: null, label: customLabel.trim(), points: pts, hole: h });
    }
    setHole('');
    setCustomLabel('');
  };

  return (
    <Card>
      <T variant="h2">Bonus points</T>
      {bonuses.length === 0 ? <T muted>None yet.</T> : null}
      {bonuses.map((b) => (
        <Row key={b.id} style={{ justifyContent: 'space-between' }}>
          <T style={{ flex: 1 }}>
            {nameOf(b.user_id)}: {b.label}
            {b.hole ? ` (hole ${b.hole})` : ''}
          </T>
          <T variant="mono">+{Number(b.points)}</T>
          {editable && canRemove(b.created_by) ? (
            <Button title="✕" kind="secondary" style={{ paddingHorizontal: space.m }} onPress={() => onRemove(b.id)} />
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
              <Chip key={t.key} label={`${t.label} +${t.points}`} on={typeKey === t.key} onPress={() => setTypeKey(t.key)} />
            ))}
            <Chip label="Custom" on={typeKey === null} onPress={() => setTypeKey(null)} />
          </Row>
          {typeKey === null ? (
            <Row style={{ alignItems: 'flex-start' }}>
              <View style={{ flex: 2 }}>
                <Field label="What happened" value={customLabel} onChangeText={setCustomLabel} placeholder="e.g. Drove the green" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Points" value={customPoints} onChangeText={setCustomPoints} keyboardType="numbers-and-punctuation" />
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
  const color = { great: c.accentText, ouch: c.danger, lead: c.primary, hole: c.text };
  const shown = all ? lines : lines.slice(0, 6);
  return (
    <Card>
      <T variant="h2">Commentary</T>
      {shown.map((l, i) => (
        <Row key={i} style={{ alignItems: 'flex-start' }}>
          <T variant="label" muted style={{ width: 32, paddingTop: 3 }}>
            #{l.hole + 1 + offset}
          </T>
          <T style={{ flex: 1, color: color[l.kind], fontFamily: l.kind === 'hole' ? fonts.body : fonts.bodyBold }}>
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
