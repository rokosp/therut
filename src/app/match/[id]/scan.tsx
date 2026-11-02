import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';

import {
  displayName,
  getMatchBundle,
  holesFor,
  listCourses,
  saveScore,
  startScorecardScan,
  waitForScorecardScan,
} from '@/lib/api';
import { cleanScores, pairRows } from '@/lib/scan';
import { useAction, useLoad } from '@/lib/useLoad';
import { Button, Card, Chip, ErrorText, Row, Screen, T } from '@/ui/components';
import { fonts, radius, space, usePalette } from '@/ui/theme';

type ReviewRow = { name: string; scores: (number | null)[]; playerId: string | null };

/** Photograph a paper scorecard, check what was read, then save it into the match. */
export default function ScanScorecard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = usePalette();
  const { data, error } = useLoad(async () => {
    const [bundle, courses] = await Promise.all([getMatchBundle(id), listCourses()]);
    return { ...bundle, courses };
  }, [id]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [notes, setNotes] = useState('');
  const read = useAction();
  const save = useAction();
  const cancelled = useRef(false);
  useEffect(
    () => () => {
      cancelled.current = true;
    },
    [],
  );

  if (!data) {
    return (
      <Screen>
        <ErrorText error={error} />
      </Screen>
    );
  }
  const { match, members, courses } = data;
  const { played } = holesFor(match, courses);
  const holeOffset = match.nine === 'back' ? 9 : 0;
  const nameOf = (uid: string) => displayName(members.find((m) => m.user_id === uid)?.profiles);
  const people = match.match_players.map((p) => {
    const prof = members.find((m) => m.user_id === p.user_id)?.profiles;
    return { id: p.user_id, names: [prof?.nickname ?? '', prof?.display_name ?? ''].filter(Boolean) };
  });

  const pick = (source: 'camera' | 'library') =>
    read.run(async () => {
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) throw new Error('The camera is blocked for The Rut. Allow it in your phone settings.');
      }
      const res =
        source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets[0]) return;
      const a = res.assets[0];
      setPhoto(a.uri);
      setRows(null);
      setNotes('');
      // Big enough to read handwriting, small enough to send quickly.
      const long = 1568;
      const ctx = ImageManipulator.manipulate(a.uri);
      if (a.width && a.height && Math.max(a.width, a.height) > long) {
        ctx.resize(a.width >= a.height ? { width: long } : { height: long });
      }
      const img = await ctx.renderAsync();
      const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.75, base64: true });
      if (!out.base64) throw new Error('Could not prepare the photo. Try again.');
      const scanId = await startScorecardScan(match.id, out.base64);
      const card = await waitForScorecardScan(scanId, () => cancelled.current);
      if (!card.players.length) throw new Error('No scores found on that photo. Try a sharper, straight-on photo.');
      const cleaned = card.players.map((r) => ({ name: r.name, scores: cleanScores(r.scores, played.holes) }));
      const pairs = pairRows(cleaned, people);
      setRows(cleaned.map((r, i) => ({ ...r, playerId: pairs[i] })));
      setNotes(card.notes);
    });

  const setCell = (ri: number, hi: number, text: string) => {
    const n = parseInt(text, 10);
    setRows((rs) =>
      rs!.map((r, i) =>
        i === ri ? { ...r, scores: r.scores.map((s, j) => (j === hi ? (n >= 1 && n <= 20 ? n : null) : s)) } : r,
      ),
    );
  };
  const assign = (ri: number, playerId: string | null) =>
    setRows((rs) =>
      rs!.map((r, i) =>
        i === ri ? { ...r, playerId } : r.playerId === playerId && playerId != null ? { ...r, playerId: null } : r,
      ),
    );

  const toSave = (rows ?? []).filter((r) => r.playerId);
  const saveAll = () =>
    save.run(async () => {
      for (const r of toSave) {
        const p = match.match_players.find((x) => x.user_id === r.playerId)!;
        const scores = Array.from({ length: played.holes }, (_, i) => r.scores[i] ?? p.hole_scores?.[i] ?? null);
        const complete = scores.every((s) => s != null);
        await saveScore(match.id, p.user_id, {
          hole_scores: scores,
          gross: complete ? (scores as number[]).reduce((a, b) => a + b, 0) : p.gross,
        });
      }
      router.back();
    });

  if (match.status !== 'open') {
    return (
      <Screen>
        <T muted>Scores can only be added while the match is live.</T>
      </Screen>
    );
  }

  return (
    <Screen>
      {!rows ? (
        <Card>
          <T variant="title">Scan a paper scorecard</T>
          <T muted>
            Take a photo of the card and the app reads the scores for you. You check them before anything is
            saved.
          </T>
          <T variant="label" muted>
            Tips: lay the card flat in good light, get the whole card in the photo, and shoot from straight
            above.
          </T>
          <Button title="Take a photo" kind="accent" onPress={() => pick('camera')} disabled={read.busy} />
          <Button
            title="Choose from photos"
            kind="secondary"
            onPress={() => pick('library')}
            disabled={read.busy}
          />
        </Card>
      ) : null}

      {photo ? (
        <Image
          source={{ uri: photo }}
          contentFit="contain"
          style={{ width: '100%', height: rows ? 160 : 260, borderRadius: radius.input, backgroundColor: c.border }}
        />
      ) : null}

      {read.busy && photo ? (
        <Row style={{ justifyContent: 'center', gap: space.s }}>
          <ActivityIndicator color={c.accentText} />
          <T muted>Reading the card… usually well under a minute.</T>
        </Row>
      ) : null}
      <ErrorText error={read.error} />

      {rows ? (
        <>
          <T variant="title">Check the scores</T>
          <T variant="label" muted>
            Fix anything that was read wrong, and make sure each row is the right player. Holes left empty keep
            what&apos;s already in the app.
          </T>
          {notes ? (
            <T variant="label" style={{ color: c.accentText }}>
              Note from the reader: {notes}
            </T>
          ) : null}
          {rows.map((r, ri) => {
            const existing = match.match_players.find((p) => p.user_id === r.playerId)?.hole_scores ?? [];
            const total = r.scores.reduce<number>((a, b) => a + (b ?? 0), 0);
            return (
              <Card key={ri}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T variant="eyebrow" muted>
                    On the card: {r.name || 'no name'}
                  </T>
                  <T style={{ fontFamily: fonts.num, fontSize: 20 }}>{total || '–'}</T>
                </Row>
                <Row style={{ flexWrap: 'wrap', gap: space.xs }}>
                  {match.match_players.map((p) => (
                    <Chip
                      key={p.user_id}
                      label={nameOf(p.user_id)}
                      on={r.playerId === p.user_id}
                      onPress={() => assign(ri, p.user_id)}
                    />
                  ))}
                  <Chip label="Skip" on={r.playerId == null} onPress={() => assign(ri, null)} />
                </Row>
                {r.playerId ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {r.scores.map((s, hi) => {
                      const was = existing[hi] ?? null;
                      const changes = s != null && was != null && was !== s;
                      return (
                        <View key={hi} style={{ width: '10%', minWidth: 30, flexGrow: 1, alignItems: 'center' }}>
                          <T variant="label" muted style={{ fontSize: 10 }}>
                            {hi + 1 + holeOffset}
                          </T>
                          <TextInput
                            value={s != null ? String(s) : ''}
                            onChangeText={(t) => setCell(ri, hi, t)}
                            keyboardType="number-pad"
                            maxLength={2}
                            placeholder={was != null ? String(was) : '–'}
                            placeholderTextColor={c.muted}
                            selectTextOnFocus
                            style={{
                              width: '100%',
                              textAlign: 'center',
                              fontFamily: fonts.num,
                              fontSize: 18,
                              paddingVertical: 6,
                              borderRadius: radius.small,
                              borderWidth: changes || s == null ? 2 : 1,
                              borderColor: changes ? c.accent : s == null ? c.danger : c.border,
                              color: c.text,
                              backgroundColor: c.bg,
                            }}
                          />
                          <T variant="label" muted style={{ fontSize: 9 }}>
                            {played.holePars?.[hi] != null ? `P${played.holePars[hi]}` : ''}
                          </T>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </Card>
            );
          })}
          <T variant="label" muted>
            Red boxes couldn&apos;t be read. Orange boxes replace a score already in the app.
          </T>
          <ErrorText error={save.error} />
          <Button
            title={toSave.length ? `Save scores for ${toSave.length} player${toSave.length === 1 ? '' : 's'}` : 'Pick a player for a row first'}
            kind="accent"
            busy={save.busy}
            disabled={!toSave.length}
            onPress={saveAll}
          />
          <Button title="Try another photo" kind="secondary" onPress={() => (setRows(null), setPhoto(null))} />
        </>
      ) : null}
    </Screen>
  );
}
