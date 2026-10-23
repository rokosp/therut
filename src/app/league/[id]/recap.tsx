import * as Sharing from 'expo-sharing';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useRef, type ComponentRef } from 'react';
import { Platform, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { displayName, getLeague, holesFor, leagueTitle, listCourses, resultsFor } from '@/lib/api';
import { buildStandings } from '@/lib/standings';
import { careerHighlights, seasonAwards, type SeasonCard } from '@/lib/stats';
import { useAction, useLoad } from '@/lib/useLoad';
import { Button, ErrorText, Row, Screen, T } from '@/ui/components';
import { brand, fonts, space } from '@/ui/theme';

const pts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** A season summary drawn as one card, made to be saved or shared to the group chat. */
export default function SeasonRecap() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const card = useRef<ComponentRef<typeof View>>(null);
  const share = useAction();

  const { data, error, loading, reload } = useLoad(async () => {
    const [bundle, courses] = await Promise.all([getLeague(id), listCourses()]);
    return { ...bundle, courses };
  }, [id]);

  if (!data) {
    return (
      <Screen refreshing={loading} onRefresh={reload}>
        <ErrorText error={error} />
      </Screen>
    );
  }

  const { league, members, matches, settings, courses } = data;
  const nameOf = (uid: string) => displayName(members.find((m) => m.user_id === uid)?.profiles);
  const finals = matches.filter((m) => m.status === 'final');
  const resultsByMatch = finals.map((m) => resultsFor(m, settings, courses));
  const table = buildStandings(
    members.map((m) => m.user_id),
    resultsByMatch,
  ).filter((r) => r.played > 0);
  const cards: SeasonCard[] = finals.flatMap((m, i) =>
    m.match_players.map((p) => {
      const { course, played } = holesFor(m, courses, p.tee_id);
      const r = resultsByMatch[i].find((x) => x.userId === p.user_id);
      return {
        userId: p.user_id,
        matchId: m.id,
        playedOn: m.played_on,
        courseName: course?.name ?? 'Match',
        holeOffset: m.nine === 'back' ? 9 : 0,
        holeScores: p.hole_scores,
        holePars: played.holePars,
        gross: r?.gross ?? null,
        par: played.par,
        won: r?.position === 1 && !r.tied,
      };
    }),
  );
  const awards = seasonAwards(cards).slice(0, 4);
  const birdiesOf = (uid: string) =>
    careerHighlights(
      cards
        .filter((x) => x.userId === uid)
        .map((x) => ({
          holes: x.holeScores?.length ?? 0,
          holeScores: x.holeScores,
          holePars: x.holePars,
          gross: x.gross,
          par: x.par,
        })),
    );
  const champ = table[0];

  const doShare = () =>
    share.run(async () => {
      const uri = await captureRef(card, {
        format: 'png',
        quality: 1,
        result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
      });
      const file = `the-rut-${league.name}-season-${league.season ?? ''}.png`.replace(/\s+/g, '-').toLowerCase();
      if (Platform.OS === 'web') {
        const blob = await (await fetch(uri)).blob();
        const f = new File([blob], file, { type: 'image/png' });
        const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
        if (nav.canShare?.({ files: [f] })) {
          await nav.share({ files: [f], title: leagueTitle(league) });
        } else {
          const a = document.createElement('a');
          a.href = uri;
          a.download = file;
          a.click();
        }
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share the season recap' });
    });

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <View
        ref={card}
        collapsable={false}
        style={{
          backgroundColor: brand.rough,
          borderRadius: 18,
          padding: space.xl,
          gap: space.l,
          alignSelf: 'center',
          width: '100%',
          maxWidth: 420,
        }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <T variant="eyebrow" style={{ color: brand.blaze }}>
              Season recap
            </T>
            <T variant="display" style={{ color: brand.bone, fontSize: 36, lineHeight: 38 }}>
              {league.name}
            </T>
            <T variant="eyebrow" style={{ color: brand.bone, opacity: 0.7 }}>
              {[league.season ? `Season ${league.season}` : null, `${finals.length} matches`]
                .filter(Boolean)
                .join(' · ')}
            </T>
          </View>
          <Image
            source={require('@/assets/images/logo-mark-blaze.png')}
            style={{ width: 56, height: 56 }}
            contentFit="contain"
          />
        </Row>

        {champ ? (
          <View style={{ backgroundColor: brand.blaze, borderRadius: 14, padding: space.l, gap: 2 }}>
            <T variant="eyebrow" style={{ color: brand.rough }}>
              {league.finished_at ? 'Champion' : 'Leading'}
            </T>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <T variant="display" style={{ color: brand.rough, fontSize: 40, lineHeight: 42, flex: 1 }}>
                {nameOf(champ.userId)}
              </T>
              <T style={{ fontFamily: fonts.num, fontSize: 36, color: brand.rough }}>{pts(champ.total)}</T>
            </Row>
            <T variant="label" style={{ color: brand.rough }}>
              {champ.wins} win{champ.wins === 1 ? '' : 's'} · {champ.played} played · points
            </T>
          </View>
        ) : null}

        <View>
          <Row style={{ paddingVertical: 6, borderBottomWidth: 1, borderColor: 'rgba(240,238,228,0.25)' }}>
            {['#', 'Player', 'Pts', 'W', 'Bird.'].map((h, i) => (
              <T
                key={h}
                variant="eyebrow"
                style={{
                  color: brand.bone,
                  opacity: 0.6,
                  width: [24, undefined, 56, 32, 44][i],
                  flex: i === 1 ? 1 : undefined,
                  textAlign: i > 1 ? 'right' : 'left',
                }}>
                {h}
              </T>
            ))}
          </Row>
          {table.map((r) => (
            <Row
              key={r.userId}
              style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: 'rgba(240,238,228,0.12)' }}>
              <T
                style={{
                  width: 24,
                  fontFamily: fonts.num,
                  fontSize: 20,
                  color: r.rank === 1 ? brand.blaze : brand.bone,
                }}>
                {r.rank}
              </T>
              <T numberOfLines={1} style={{ flex: 1, fontFamily: fonts.bodyBold, color: brand.bone }}>
                {nameOf(r.userId)}
              </T>
              <T style={{ width: 56, textAlign: 'right', fontFamily: fonts.num, fontSize: 20, color: brand.bone }}>
                {pts(r.total)}
              </T>
              <T style={{ width: 32, textAlign: 'right', fontFamily: fonts.num, fontSize: 20, color: brand.bone }}>
                {r.wins}
              </T>
              <T style={{ width: 44, textAlign: 'right', fontFamily: fonts.num, fontSize: 20, color: brand.bone }}>
                {birdiesOf(r.userId).birdies}
              </T>
            </Row>
          ))}
        </View>

        {awards.length ? (
          <View style={{ gap: space.s }}>
            {awards.map((a) => (
              <Row key={a.key} style={{ gap: space.m, alignItems: 'flex-start' }}>
                <View style={{ width: 6, alignSelf: 'stretch', borderRadius: 3, backgroundColor: brand.blaze }} />
                <View style={{ flex: 1 }}>
                  <T variant="eyebrow" style={{ color: brand.blaze }}>
                    {a.title}
                  </T>
                  <T style={{ color: brand.bone, fontFamily: fonts.bodyBold }}>
                    {a.userIds.map(nameOf).join(' & ')} · {a.value}
                  </T>
                </View>
              </Row>
            ))}
          </View>
        ) : null}

        <T variant="eyebrow" style={{ color: brand.bone, opacity: 0.5, textAlign: 'center' }}>
          The Rut · league scores for the boyz
        </T>
      </View>

      <Button title="Share recap" kind="accent" onPress={doShare} busy={share.busy} />
      <ErrorText error={share.error} />
    </Screen>
  );
}
