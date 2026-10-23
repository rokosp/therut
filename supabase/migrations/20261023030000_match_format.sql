-- Match format: stroke play (fewest strokes) or Stableford (most points).
alter table public.matches add column if not exists format text not null default 'stroke'
  check (format in ('stroke', 'stableford'));
