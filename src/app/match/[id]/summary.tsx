import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { displayName, getMatchBundle, holesFor, listCourses, resultsFor } from '@/lib/api';
import { useLoad } from '@/lib/useLoad';
import { Button, ErrorText, Row, Screen, Section, T, Tag } from '@/ui/components';
import { fonts, radius, space, usePalette } from '@/ui/theme';

const toPar = (n: number) => (n === 0 ? 'E' : n > 0 ? `+${n}` : String(n));

/** A finished match at a glance: the top three, then a way into the full card. */
export default function MatchSummary() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = usePalette();
  const { data, error, loading, reload } = useLoad(async () => {
    const [bundle, courses] = await Promise.all([getMatchBundle(id), listCourses()]);
    return { ...bundle, courses };
  }, [id]);

  if (!data) {
    return (
      <Screen refreshing={loading} onRefresh={reload}>
        <ErrorText error={error} />
      </Screen>
    );
  }

  const { match, members, settings, courses, league } = data;
  const { course, played } = holesFor(match, courses);
  const stableford = match.format === 'stableford';
  const nameOf = (uid: string) => displayName(members.find((m) => m.user_id === uid)?.profiles);
  const top = resultsFor(match, settings, courses)
    .filter((r) => r.position != null)
    .slice(0, 3);

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <View style={{ gap: space.s }}>
        <Row style={{ flexWrap: 'wrap' }}>
          {match.status === 'open' ? <Tag kind="live" label="● Live" /> : <Tag kind="final" label="Final" />}
          <Tag kind={match.kind} label={league ? `${match.kind} · ${match.holes}` : `${match.holes} holes`} />
          <Tag kind="final" label={stableford ? 'Stableford' : 'Stroke play'} />
        </Row>
        <T variant="display" style={{ fontSize: 40, lineHeight: 40 }}>
          {course?.name ?? 'Match'}
        </T>
        <T muted>{[league?.name ?? 'Casual round', match.played_on, `Par ${played.par}`].join(' · ')}</T>
      </View>

      <Section title="Top 3" />
      <View style={{ marginTop: -space.s }}>
        {top.length === 0 ? <T muted>No finished cards yet.</T> : null}
        {top.map((r) => {
          const lead = r.position === 1;
          const fg = lead ? c.onLeader : c.text;
          const big = stableford ? r.stableford : r.gross;
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
              <T style={{ width: 28, textAlign: 'center', fontFamily: fonts.num, fontSize: 24, color: fg }}>
                {`${r.tied ? 'T' : ''}${r.position}`}
              </T>
              <T style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 16, color: fg }}>{nameOf(r.userId)}</T>
              <T variant="label" style={{ color: lead ? c.onLeader : c.muted }}>
                {stableford ? 'pts' : r.gross != null ? toPar(r.gross - played.par) : ''}
              </T>
              <T style={{ width: 56, textAlign: 'right', fontFamily: fonts.num, fontSize: 30, color: fg }}>{big ?? '–'}</T>
            </Row>
          );
        })}
      </View>

      <Button title="View full match" onPress={() => router.push(`/match/${match.id}`)} />
    </Screen>
  );
}
