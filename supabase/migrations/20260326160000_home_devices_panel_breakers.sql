-- Panel breaker directory from interior / label scans.

alter table public.home_devices
  add column if not exists breakers jsonb not null default '[]'::jsonb,
  add column if not exists panel_scanned_at timestamptz;

comment on column public.home_devices.breakers is
  'Breaker directory rows: [{ position, amps, label, side, isMain, isSpare, … }].';
comment on column public.home_devices.panel_scanned_at is
  'When the breaker directory was last scanned from the panel interior.';
