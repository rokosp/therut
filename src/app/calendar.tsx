import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { listCourses, playerMatches } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLoad } from '@/lib/useLoad';
import { Button, ErrorText, Row, Screen, Section, T } from '@/ui/components';
import { MatchCard, PastMatchCard } from '@/ui/MatchCard';
import { fonts, radius, space, usePalette } from '@/ui/theme';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** Month calendar of the rounds I've played; tap a day to see its matches. */
export default function CalendarScreen() {
  const { userId } = useAuth();
  const c = usePalette();
  const today = new Date();
  const [month, setMonth] = useState<{ y: number; m: number } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const { data, error, loading, reload } = useLoad(async () => {
    const [mine, courses] = await Promise.all([playerMatches(userId!, 1000), listCourses()]);
    return { ...mine, courses };
  }, [userId]);

  // Open on the month of the latest round (or this month).
  const latest = data?.matches[0]?.played_on;
  const shown =
    month ??
    (latest ? { y: +latest.slice(0, 4), m: +latest.slice(5, 7) - 1 } : { y: today.getFullYear(), m: today.getMonth() });
  const byDay = new Map<string, NonNullable<typeof data>['matches']>();
  for (const m of data?.matches ?? []) byDay.set(m.played_on, [...(byDay.get(m.played_on) ?? []), m]);

  const first = new Date(shown.y, shown.m, 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const daysIn = new Date(shown.y, shown.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...[...Array(daysIn).keys()].map((d) => d + 1)];
  while (cells.length % 7) cells.push(null);
  const monthKey = `${shown.y}-${pad(shown.m + 1)}`;
  const inMonth = (data?.matches ?? []).filter((m) => m.played_on.startsWith(monthKey)).length;
  const step = (d: number) => {
    const n = new Date(shown.y, shown.m + d, 1);
    setMonth({ y: n.getFullYear(), m: n.getMonth() });
    setPicked(null);
  };
  const todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate());
  const dayMatches = picked ? (byDay.get(picked) ?? []) : [];

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <ErrorText error={error} />
      <Row style={{ justifyContent: 'space-between' }}>
        <Button title="‹" kind="secondary" compact onPress={() => step(-1)} style={{ width: 48 }} />
        <View style={{ alignItems: 'center' }}>
          <T variant="h1">
            {MONTHS[shown.m]} {shown.y}
          </T>
          <T variant="label" muted>
            {inMonth ? `${inMonth} round${inMonth === 1 ? '' : 's'}` : 'No rounds'}
          </T>
        </View>
        <Button title="›" kind="secondary" compact onPress={() => step(1)} style={{ width: 48 }} />
      </Row>

      <View>
        <Row style={{ gap: 0 }}>
          {DAYS.map((d) => (
            <View key={d} style={{ flex: 1, alignItems: 'center', paddingBottom: space.xs }}>
              <T variant="eyebrow" muted>
                {d}
              </T>
            </View>
          ))}
        </Row>
        {[...Array(cells.length / 7).keys()].map((w) => (
          <Row key={w} style={{ gap: 0 }}>
            {cells.slice(w * 7, w * 7 + 7).map((d, i) => {
              if (d == null) return <View key={i} style={{ flex: 1, aspectRatio: 1 }} />;
              const key = iso(shown.y, shown.m, d);
              const played = byDay.get(key);
              const on = picked === key;
              return (
                <Pressable
                  key={i}
                  onPress={() => setPicked(on ? null : key)}
                  style={{ flex: 1, aspectRatio: 1, padding: 2 }}>
                  <View
                    style={{
                      flex: 1,
                      borderRadius: radius.input,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: on ? c.primary : played ? c.surface : undefined,
                      borderWidth: key === todayIso ? 1.5 : 0,
                      borderColor: c.accent,
                    }}>
                    <T
                      style={{
                        fontFamily: fonts.num,
                        fontSize: 18,
                        color: on ? c.onPrimary : played ? c.text : c.muted,
                      }}>
                      {d}
                    </T>
                    {played ? (
                      <Row style={{ gap: 2, position: 'absolute', bottom: 5 }}>
                        {played.slice(0, 3).map((m) => (
                          <View
                            key={m.id}
                            style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.accent }}
                          />
                        ))}
                      </Row>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </Row>
        ))}
      </View>

      {picked ? (
        <>
          <Section
            title={new Date(`${picked}T12:00:00`).toLocaleDateString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          />
          {dayMatches.length === 0 ? <T muted>No golf that day.</T> : null}
          {dayMatches.map((m) =>
            m.status === 'final' ? (
              <PastMatchCard key={m.id} match={m} courses={data!.courses} profiles={data!.profiles} userId={userId!} />
            ) : (
              <MatchCard key={m.id} match={m} courses={data!.courses} profiles={data!.profiles} />
            ),
          )}
        </>
      ) : (
        <T variant="label" muted>
          Days with a dot are days you played. Tap one to see the match.
        </T>
      )}
    </Screen>
  );
}
