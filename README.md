# Base Power

Progressive web app with two experiences:

1. **Homeowner risk analysis** — account → stepped onboarding → location-based planning
2. **Provider CRM** — manage leads that come from risk analysis planning

Built with **Next.js**, **shadcn/ui**, **Mapbox GL**, and **Three.js**.

## Getting started

```bash
cp .env.example .env.local
# add NEXT_MAPBOX_ACCESS_TOKEN and Supabase keys to .env.local

npm install
npm run dev
```

### Supabase setup

1. Create a project at [supabase.com](https://supabase.com)
2. Copy **Project URL** and **publishable/anon key** into `.env.local`
3. Run `supabase/migrations/20260326000000_profiles.sql` in the SQL editor
4. In Auth → Providers → Email, enable email OTP (password login is not used)
5. In Auth → Email Templates → **Magic Link**, include the code so users can type it in:

   ```html
   <p>Your Base Power code is: <strong>{{ .Token }}</strong></p>
   ```

6. Configure **Mailgun** as custom SMTP (required — built-in email is capped at ~2/hour):
   1. In Mailgun: verify a sending domain → **Sending → Domain settings → SMTP credentials** → create/copy user + password
   2. In Supabase: **Authentication → SMTP Settings** → enable custom SMTP:

   | Field | Value |
   | --- | --- |
   | Sender email | e.g. `noreply@yourdomain.com` (must be on the verified Mailgun domain) |
   | Sender name | `Base Power` |
   | Host | `smtp.mailgun.org` |
   | Port | `587` |
   | Username | Mailgun SMTP login (often `postmaster@mg.yourdomain.com`) |
   | Password | Mailgun SMTP password |

   3. After saving, raise the email rate limit under **Authentication → Rate Limits** if needed (custom SMTP defaults around 30/hour)

Auth protects `/onboarding`, `/risk`, and `/crm`. Sign-in lives at `/` and uses emailed one-time codes.

Open [http://localhost:3000](http://localhost:3000).

## Containers

```bash
docker compose up --build
```

| Service | Port | Health |
| --- | --- | --- |
| web | 3000 | `GET /api/health` |
| api | 4000 | `GET /health` |
| worker | — | `GET /health` inside the container |
| postgres | 5432 | `pg_isready -U postgres -h localhost` |
| redis | 6379 | `redis-cli ping` |

Local Postgres uses Supabase’s defaults: user `postgres`, password `postgres`, database `postgres`.

## Product flow (scaffold)

| Area | Routes |
| --- | --- |
| Sign in | `/` (also `/sign-in` → redirects here) |
| Sign up | `/sign-up` |
| Onboarding | `/onboarding` → address → household → goals |
| Risk analysis | `/risk` |
| Provider CRM | `/crm`, `/crm/leads`, `/crm/leads/[id]` |

The app opens on the login screen. Onboarding captures address, household details, and backup battery goals. Auth and persistence are stubbed so the stepped UX can be walked end-to-end.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm start` | Serve production build |
| `npm run lint` | ESLint |

## Project layout

```
src/
  app/
    (auth)/            # sign-in (/) + sign-up
    (consumer)/        # onboarding + risk analysis
    crm/               # provider CRM
  components/
    auth/
    onboarding/
    crm/
    layout/
    map/
    ui/
  lib/
    types/             # shared domain models
    onboarding/        # step config + option catalogs
    crm/               # mock leads for CRM scaffold
    map/
```
