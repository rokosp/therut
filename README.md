# The Rut

Golf league score tracker for a small crew. Android first (Expo / React Native), iPhone later from the same code. Logins and data live in Supabase.

## What it does

- Email login, a profile per player (name, nickname, own handicap).
- Leagues: create one, invite buddies with a 6-character code, admins manage players.
- Matches: major (18 holes) or minor (9 holes) on a course, with each player picking their own tees.
- Hole-by-hole scoring with a +/- stepper, or totals only.
- League table, FedEx style: points per finishing place, multiplier per match type, plus bonus points.
- Tie breakers inside a match: countback, playoff, or split points.
- App handicap (simplified WHS), shown next to the handicap a player enters themselves.

Every rule is per league, under League settings: major and minor points per place, gross or net, app or own handicap for net, tie breaker, and bonus types.

## Rules in detail

**Points.** Each league has two editable lists: points per finishing place for majors (default 100, 70, 50, 35, 25, 15) and for minors (default 50, 35, 25, 18, 12, 8). Places past the end of a list get 0. Bonus points are added on top. Only finished matches count toward the table. Changing settings re-scores past matches.

**Tie breakers (one match).** If players are level on the score the match is ranked on:
- Countback: best last 9, then last 6, last 3, last hole (last 6/3/1 for 9 holes). Net countback takes off 1/2, 1/3, 1/6, 1/18 of the handicap. Needs hole-by-hole scores, otherwise points are split.
- Playoff: someone enters the playoff order on the match screen.
- Split: tied players share the points for the places they cover.

Players level on total in the league table share a rank.

**Handicap.** Score differential = 113 / slope x (adjusted gross - course rating). Holes are capped at net double bogey when hole pars are known (par + 5 before a player has an index). Two 9-hole rounds combine into one differential. Index = average of the lowest differentials of the latest 20, using the WHS table (needs 3 rounds). Missing rating falls back to par, missing slope to 113. Course handicap = index x slope / 113 + (rating - par), fixed per player when a match is created.

The logic lives in `src/lib` (`scoring.ts`, `standings.ts`, `handicap.ts`, `course.ts`) and is covered by `npm test`.

## Setup

1. Supabase: open the SQL Editor and run `supabase/setup-all.sql` once. It creates the tables, security rules and both Riverside courses.
2. Supabase > Authentication > Sign In / Providers > Email: turn off "Confirm email" while testing, so buddies can sign in straight away.
3. Copy `.env.example` to `.env` and fill in the project URL and anon (publishable) key.
4. `npm install`, then `npx expo start` and open in Expo Go, or build an APK with EAS (below).

## Testers on Android

```
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview
```

This builds an installable APK and gives a link to share with the testers.

## Courses

Course data comes from the club scorecards in `data/courses/`. After editing that JSON, run `npm run seed:courses` and run the new `supabase/seed.sql` in Supabase.

## Checks

```
npm test          # rules and handicap
npm run typecheck
```
