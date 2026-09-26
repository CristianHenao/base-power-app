-- Persist consumer onboarding answers on profiles so returning users
-- skip the flow and land on risk analysis.

alter table public.profiles
  add column if not exists address jsonb,
  add column if not exists household jsonb,
  add column if not exists goals jsonb;

comment on column public.profiles.address is
  'Onboarding address snapshot (line1, city, state, postalCode, lat/lng, …).';
comment on column public.profiles.household is
  'Onboarding household snapshot (homeType, occupants, solar, …).';
comment on column public.profiles.goals is
  'Onboarding goals snapshot (primaryGoal, secondaryGoals, notes).';
comment on column public.profiles.onboarding_completed_at is
  'Set when the user finishes the goals step; null means onboarding required.';
