import { router } from 'expo-router';
import { View } from 'react-native';

import { displayName, holesFor, type Course, type LiveMatch, type Profile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { buildCommentary } from '@/lib/commentary';
import { stablefordPoints } from '@/lib/scoring';
import { strokesPerHole } from '@/lib/handicap';
import { withDefaults } from '@/lib/types';
import { Card, Row, T, Tag } from '@/ui/components';
import { fonts, space, usePalette } from '@/ui/theme';

/** Match summary with a mini leaderboard and the latest commentary line. */
export function MatchCard({ match, profiles, courses }: { match: LiveMatch; profiles: Profile[]; courses: Course[] }) {
  const c = usePalette();
  const { userId } = useAuth();
  const settings = withDefaults(match.leagues?.settings);
  const { course, played } = holesFor(match, courses);
  const net = settings.scoring === 'net';
  const stableford = match.format === 'stableford';
  const nameOf = (id: string) => displayName(profiles.find((p) => p.id === id));

  const rows = match.match_players
    .map((p) => {
      const shots = strokesPerHole(p.course_handicap, played.holes, played.strokeIndex);
      let thru = 0;
      let toPar = 0;
      let total = 0;
      (p.hole_scores ?? []).forEach((s, i) => {
        if (s == null) return;
        thru += 1;
        const adj = s - (net ? shots[i] : 0);
        total += adj;
        toPar += adj - (played.holePars?.[i] ?? 0);
      });
      const sf = stablefordPoints(p.hole_scores, played.holePars) ?? 0;
      return { id: p.user_id, thru, total, toPar, sf };
    })
    .sort((a, b) =>
      (stableford ? b.sf - a.sf : played.holePars ? a.toPar - b.toPar : a.total - b.total) || b.thru - a.thru,
    );

  const feed = buildCommentary({
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
    holeOffset: match.nine === 'back' ? 9 : 0,
  });

  const fmt = (n: number) => (n === 0 ? 'E' : n > 0 ? `+${n}` : String(n));

  return (
    <Card onPress={() => router.push(`/match/${match.id}`)}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row>
          {match.status === 'open' ? <Tag kind="live" label="● Live" /> : <Tag kind="final" label="Final" />}
          <Tag kind={match.kind} label={match.league_id ? `${match.kind} · ${match.holes}` : `${match.holes} holes`} />
        </Row>
        <T variant="eyebrow" muted>
          {leagueLabel(match)} · {match.played_on}
        </T>
      </Row>
      <T variant="h2">{course?.name ?? 'Match'}</T>
      {rows.map((r, i) => (
        <Row key={r.id} style={{ minHeight: 36 }}>
          <T style={{ width: 24, fontFamily: fonts.num, fontSize: 20 }}>{i + 1}</T>
          <T style={{ flex: 1, fontFamily: fonts.bodyBold }}>{nameOf(r.id)}</T>
          <T variant="label" muted style={{ width: 64, textAlign: 'right' }}>
            {r.thru === 0 ? 'not started' : r.thru === played.holes ? 'F' : `thru ${r.thru}`}
          </T>
          <T style={{ width: 52, textAlign: 'right', fontFamily: fonts.num, fontSize: 24 }}>
            {r.thru === 0 ? '–' : stableford ? `${r.sf}` : played.holePars ? fmt(r.toPar) : r.total}
          </T>
        </Row>
      ))}
      {feed.length > 0 &&
      !(match.status === 'open' && userId && match.match_players.some((p) => p.user_id === userId)) ? (
        <View style={{ borderTopWidth: 1, borderColor: c.border, paddingTop: space.s, gap: space.xs }}>
          {feed.slice(0, 2).map((l, i) => (
            <T key={i} muted={i > 0}>
              {l.text}
            </T>
          ))}
        </View>
      ) : null}
      <T variant="label" muted>
        {stableford ? 'Stableford points' : 'Stroke play, to par'} · {match.status === 'open' ? 'tap to watch' : 'tap for the card'}
      </T>
    </Card>
  );
}

const leagueLabel = (m: LiveMatch) => (m.league_id ? (m.leagues?.name ?? "Friend's league") : 'Casual round');

/**
 * A finished match, kept short: tags, course, and one player's score against par.
 * Tapping opens the summary (top 3) rather than the full card.
 */
export function PastMatchCard({ match, courses, userId }: { match: LiveMatch; courses: Course[]; userId: string }) {
  const c = usePalette();
  const { course, played } = holesFor(match, courses);
  const mine = match.match_players.find((p) => p.user_id === userId);
  const scores = mine?.hole_scores ?? [];
  const complete = scores.length === played.holes && scores.every((s) => s != null);
  const gross = complete ? (scores as number[]).reduce((a, b) => a + b, 0) : (mine?.gross ?? null);
  const pts = match.format === 'stableford' ? stablefordPoints(mine?.hole_scores, played.holePars) : null;
  return (
    <Card onPress={() => router.push(`/match/${match.id}/summary`)}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: space.s }}>
          <Row style={{ flexWrap: 'wrap' }}>
            <Tag kind="final" label="Final" />
            <Tag kind={match.kind} label={match.league_id ? `${match.kind} · ${match.holes}` : `${match.holes} holes`} />
            <T variant="eyebrow" muted>
              {leagueLabel(match)} · {match.played_on}
            </T>
          </Row>
          <T variant="h2">{course?.name ?? 'Match'}</T>
        </View>
        <View style={{ alignItems: 'flex-end', marginLeft: space.m }}>
          <T style={{ fontFamily: fonts.num, fontSize: 36, lineHeight: 38, color: c.text }}>{gross ?? '–'}</T>
          <T variant="eyebrow" muted>
            Par {played.par}
            {pts != null ? ` · ${pts} pts` : ''}
          </T>
        </View>
      </Row>
    </Card>
  );
}
