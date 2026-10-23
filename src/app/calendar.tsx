import { useState } from 'react';

import { listCourses, playerMatches } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLoad } from '@/lib/useLoad';
import { ErrorText, Screen, Section, T } from '@/ui/components';
import { MatchCard, PastMatchCard } from '@/ui/MatchCard';
import { MonthGrid } from '@/ui/MonthGrid';

const pad = (n: number) => String(n).padStart(2, '0');

/** Month calendar of the rounds I've played; tap a day to see its matches. */
export default function CalendarScreen() {
  const { userId } = useAuth();
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

  const monthKey = `${shown.y}-${pad(shown.m + 1)}`;
  const inMonth = (data?.matches ?? []).filter((m) => m.played_on.startsWith(monthKey)).length;
  const step = (d: number) => {
    const n = new Date(shown.y, shown.m + d, 1);
    setMonth({ y: n.getFullYear(), m: n.getMonth() });
    setPicked(null);
  };
  const dayMatches = picked ? (byDay.get(picked) ?? []) : [];

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <ErrorText error={error} />
      <MonthGrid
        year={shown.y}
        month={shown.m}
        onStep={step}
        selected={picked}
        onPick={(d) => setPicked(picked === d ? null : d)}
        marks={new Map([...byDay.entries()].map(([k, v]) => [k, v.length]))}
        subtitle={inMonth ? `${inMonth} round${inMonth === 1 ? '' : 's'}` : 'No rounds'}
      />

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
