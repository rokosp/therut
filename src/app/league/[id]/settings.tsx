import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { deleteLeague, displayName, getLeague, removeMember, setMemberRole, updateLeague } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { BonusType, LeagueSettings } from '@/lib/types';
import { useAction, useLoad } from '@/lib/useLoad';
import { Button, Card, ErrorText, Field, Row, Screen, Segmented, T } from '@/ui/components';
import { confirmAction } from '@/ui/confirm';
import { fonts, radius, space, usePalette } from '@/ui/theme';

/** Numbers are edited as text so half-typed values like "0." don't fight the user. */
type Draft = {
  name: string;
  season: string;
  majorPoints: string[];
  minorPoints: string[];
  scoring: LeagueSettings['scoring'];
  handicapSource: LeagueSettings['handicapSource'];
  tiebreak: LeagueSettings['tiebreak'];
  bonusTypes: { key: string; label: string; points: string }[];
};

const num = (s: string) => Number(s.trim().replace(',', '.'));

export default function LeagueSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const c = usePalette();
  const [draft, setDraft] = useState<Draft | null>(null);
  const save = useAction();
  const memberAction = useAction();

  const { data, error, reload } = useLoad(async () => {
    const b = await getLeague(id);
    const s = b.settings;
    setDraft({
      name: b.league.name,
      season: b.league.season ?? '',
      majorPoints: s.majorPoints.map(String),
      minorPoints: s.minorPoints.map(String),
      scoring: s.scoring,
      handicapSource: s.handicapSource,
      tiebreak: s.tiebreak,
      bonusTypes: s.bonusTypes.map((t) => ({ ...t, points: String(t.points) })),
    });
    return b;
  }, [id]);

  if (!draft || !data) {
    return (
      <Screen>
        <ErrorText error={error} />
      </Screen>
    );
  }

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const input = { color: c.text, borderColor: c.border, backgroundColor: c.card };

  const onSave = () =>
    save.run(async () => {
      const majorPoints = draft.majorPoints.map(num);
      const minorPoints = draft.minorPoints.map(num);
      const bonusTypes: BonusType[] = draft.bonusTypes
        .filter((b) => b.label.trim())
        .map((b) => ({ key: b.key, label: b.label.trim(), points: num(b.points) }));
      const all = [...majorPoints, ...minorPoints, ...bonusTypes.map((b) => b.points)];
      if (all.some((n) => Number.isNaN(n))) throw new Error('Some points are not numbers.');
      if (!draft.name.trim()) throw new Error('The league needs a name.');
      const settings: LeagueSettings = {
        majorPoints,
        minorPoints,
        scoring: draft.scoring,
        handicapSource: draft.handicapSource,
        tiebreak: draft.tiebreak,
        bonusTypes,
      };
      await updateLeague(id, { name: draft.name.trim(), season: draft.season.trim() || null, settings });
      if (router.canGoBack()) router.back();
      else router.replace(`/league/${id}`);
    });

  const confirmRemove = (uid: string, name: string) =>
    confirmAction('Remove player?', `${name} leaves the league. Their past results stay in the table.`, 'Remove', () =>
      memberAction.run(async () => (await removeMember(id, uid), reload())),
    );

  const confirmDeleteLeague = () =>
    confirmAction(
      `Delete ${data.league.name}?`,
      'This removes the league, all its matches, scores and bonuses for everyone. It cannot be undone.',
      'Delete league',
      () =>
        memberAction.run(async () => {
          await deleteLeague(id);
          router.replace('/');
        }),
    );

  return (
    <Screen>
      <Card>
        <T variant="title">League</T>
        <Field label="Name" value={draft.name} onChangeText={(v) => set({ name: v })} />
        <Field label="Season" value={draft.season} onChangeText={(v) => set({ season: v })} />
      </Card>

      <PointsEditor
        title="Major points · 18 holes"
        values={draft.majorPoints}
        onChange={(v) => set({ majorPoints: v })}
      />
      <PointsEditor
        title="Minor points · 9 holes"
        values={draft.minorPoints}
        onChange={(v) => set({ minorPoints: v })}
      />

      <Card>
        <T variant="title">Scoring</T>
        <T variant="label" muted>
          Rank each match on
        </T>
        <Segmented
          options={[
            { value: 'net', label: 'Net (with handicap)' },
            { value: 'gross', label: 'Gross' },
          ]}
          value={draft.scoring}
          onChange={(v) => set({ scoring: v })}
        />
        <T variant="label" muted>
          Handicap used for net
        </T>
        <Segmented
          options={[
            { value: 'app', label: 'App handicap' },
            { value: 'self', label: "Player's own" },
          ]}
          value={draft.handicapSource}
          onChange={(v) => set({ handicapSource: v })}
        />
        <T variant="label" muted>
          If one is missing, the other is used. The handicap is fixed when a match is created.
        </T>
      </Card>

      <Card>
        <T variant="title">Tie breaker inside a match</T>
        <Segmented
          options={[
            { value: 'countback', label: 'Countback' },
            { value: 'playoff', label: 'Playoff' },
            { value: 'split', label: 'Split points' },
          ]}
          value={draft.tiebreak}
          onChange={(v) => set({ tiebreak: v })}
        />
        <T variant="label" muted>
          {
            {
              countback: 'Best last 9, then last 6, 3 and last hole (last 6, 3, 1 on a 9-hole match). Needs hole-by-hole scores, otherwise points are split.',
              playoff: 'You enter who won the playoff on the match screen. Until then, points are split.',
              split: 'Tied players share the points for the places they cover.',
            }[draft.tiebreak]
          }
        </T>
      </Card>

      <Card>
        <T variant="title">Bonus points</T>
        <T variant="label" muted>
          Shortcuts for logging cool shots. Any custom bonus can also be added on a match.
        </T>
        {draft.bonusTypes.map((b, i) => (
          <Row key={b.key}>
            <TextInput
              value={b.label}
              onChangeText={(v) => set({ bonusTypes: draft.bonusTypes.map((x, j) => (j === i ? { ...x, label: v } : x)) })}
              style={[styles.text, input]}
              placeholder="Name"
              placeholderTextColor={c.muted}
            />
            <TextInput
              value={b.points}
              keyboardType="numbers-and-punctuation"
              onChangeText={(v) => set({ bonusTypes: draft.bonusTypes.map((x, j) => (j === i ? { ...x, points: v } : x)) })}
              style={[styles.num, input]}
            />
            <Button
              title="✕"
              kind="secondary"
              style={{ paddingHorizontal: space.m }}
              onPress={() => set({ bonusTypes: draft.bonusTypes.filter((_, j) => j !== i) })}
            />
          </Row>
        ))}
        <Button
          title="Add bonus type"
          kind="secondary"
          onPress={() =>
            set({ bonusTypes: [...draft.bonusTypes, { key: `custom_${Date.now()}`, label: '', points: '5' }] })
          }
        />
      </Card>

      <ErrorText error={save.error} />
      <Button title="Save settings" onPress={onSave} busy={save.busy} />

      <Card>
        <T variant="title">Players</T>
        <ErrorText error={memberAction.error} />
        {data.members.map((m) => (
          <Row key={m.user_id} style={{ justifyContent: 'space-between' }}>
            <T style={{ flex: 1 }}>
              {displayName(m.profiles)} {m.role === 'admin' ? '(admin)' : ''}
            </T>
            {m.user_id !== userId ? (
              <Row>
                <Button
                  title={m.role === 'admin' ? 'Make member' : 'Make admin'}
                  kind="secondary"
                  style={{ paddingHorizontal: space.m }}
                  onPress={() =>
                    memberAction.run(async () => {
                      await setMemberRole(id, m.user_id, m.role === 'admin' ? 'member' : 'admin');
                      reload();
                    })
                  }
                />
                <Button
                  title="Remove"
                  kind="danger"
                  style={{ paddingHorizontal: space.m }}
                  onPress={() => confirmRemove(m.user_id, displayName(m.profiles))}
                />
              </Row>
            ) : null}
          </Row>
        ))}
      </Card>

      <Card>
        <T variant="title">Delete league</T>
        <T variant="label" muted>
          Removes the league and every match in it for all players.
        </T>
        <Button title="Delete league" kind="danger" onPress={confirmDeleteLeague} busy={memberAction.busy} />
      </Card>
    </Screen>
  );
}

function PointsEditor({
  title,
  values,
  onChange,
}: {
  title: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const c = usePalette();
  return (
    <Card>
      <T variant="title">{title}</T>
      <T variant="label" muted>
        Points for each finishing place. Places past the end of the list get 0.
      </T>
      {values.map((p, i) => (
        <Row key={i}>
          <T variant="mono" style={{ width: 44 }}>
            {ordinal(i + 1)}
          </T>
          <TextInput
            value={p}
            keyboardType="decimal-pad"
            onChangeText={(v) => onChange(values.map((x, j) => (j === i ? v : x)))}
            style={[styles.num, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
          />
        </Row>
      ))}
      <Row>
        <Button title="Add place" kind="secondary" compact style={{ flex: 1 }} onPress={() => onChange([...values, '0'])} />
        <Button
          title="Remove last"
          kind="secondary"
          compact
          style={{ flex: 1 }}
          disabled={values.length <= 1}
          onPress={() => onChange(values.slice(0, -1))}
        />
      </Row>
    </Card>
  );
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const styles = {
  num: {
    width: 80,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.small,
    paddingHorizontal: space.m,
    fontFamily: fonts.mono,
    fontSize: 16,
    textAlign: 'right' as const,
  },
  text: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.small,
    paddingHorizontal: space.m,
    fontFamily: fonts.body,
    fontSize: 16,
  },
};
