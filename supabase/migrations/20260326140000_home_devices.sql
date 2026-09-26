-- Persist scanned / manual home devices for each signed-in user.
-- Device-level fields only (no patient names or medical conditions).

create table if not exists public.home_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  -- Stable client key for upserts (e.g. device-1790450021911-0)
  client_key text not null,

  name text not null,
  kind text not null
    check (kind in (
      'appliance', 'panel', 'battery', 'generator', 'medical', 'unknown'
    )),
  category text not null
    check (category in (
      'kitchen', 'living_room', 'bedroom', 'bathroom', 'garage',
      'laundry', 'office', 'outdoor', 'panel', 'generator', 'medical', 'other'
    )),

  brand text,
  model text,

  -- Continuous draw (appliances) or rated output (generators), watts
  watts integer not null default 0 check (watts >= 0),
  watts_exact boolean not null default false,

  confidence real not null default 0.5
    check (confidence >= 0 and confidence <= 1),
  notes text,

  is_medical boolean not null default false,
  needs_refrigeration boolean not null default false,

  -- Public Storage URL (bucket home-devices) or legacy path
  thumbnail_url text,

  -- Nameplate grid rows: [{ "key", "label", "value" }, ...]
  specs jsonb not null default '[]'::jsonb,
  -- Full nameplate OCR payload when available
  nameplate jsonb,
  nameplate_scanned_at timestamptz,

  scanned_at timestamptz not null default now(),
  source text not null default 'scan'
    check (source in ('scan', 'manual')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, client_key)
);

create index if not exists home_devices_user_id_idx
  on public.home_devices (user_id);

create index if not exists home_devices_user_kind_idx
  on public.home_devices (user_id, kind);

create index if not exists home_devices_user_medical_idx
  on public.home_devices (user_id)
  where is_medical or needs_refrigeration;

comment on table public.home_devices is
  'Homeowner-scanned devices (appliances, panel, battery, generator, medical loads). Device-only; no PHI.';
comment on column public.home_devices.client_key is
  'Idempotent key from the client so rescan/nameplate updates upsert cleanly.';
comment on column public.home_devices.watts is
  'Draw estimate for loads, or rated output for generators.';
comment on column public.home_devices.watts_exact is
  'True when watts came from a nameplate scan rather than an estimate.';
comment on column public.home_devices.specs is
  'Flattened nameplate / detail grid fields as JSON array.';
comment on column public.home_devices.nameplate is
  'Optional raw DeviceNameplateResult JSON from OCR.';
comment on column public.home_devices.is_medical is
  'Device is powered medical equipment — not a diagnosis or patient record.';

alter table public.home_devices enable row level security;

create policy "Home devices are viewable by owner"
  on public.home_devices
  for select
  using (auth.uid() = user_id);

create policy "Home devices are insertable by owner"
  on public.home_devices
  for insert
  with check (auth.uid() = user_id);

create policy "Home devices are updatable by owner"
  on public.home_devices
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Home devices are deletable by owner"
  on public.home_devices
  for delete
  using (auth.uid() = user_id);

create or replace function public.set_home_devices_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists home_devices_set_updated_at on public.home_devices;

create trigger home_devices_set_updated_at
  before update on public.home_devices
  for each row execute function public.set_home_devices_updated_at();
