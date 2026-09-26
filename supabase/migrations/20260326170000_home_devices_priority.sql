-- User-marked priority devices (always on the Priority list).
-- Medical loads are always priority and cannot be unmarked in the app.

alter table public.home_devices
  add column if not exists is_priority boolean not null default false;

-- Existing medical / medication loads start as priority.
update public.home_devices
set is_priority = true
where is_medical
   or needs_refrigeration
   or kind = 'medical'
   or category = 'medical';

create index if not exists home_devices_user_priority_idx
  on public.home_devices (user_id)
  where is_priority or is_medical or needs_refrigeration;

comment on column public.home_devices.is_priority is
  'User-marked priority for backup planning. Medical devices are always treated as priority in the app.';
