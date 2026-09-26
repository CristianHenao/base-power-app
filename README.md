# Base Power

Progressive web app with two experiences:

1. **Homeowner risk analysis** — account → stepped onboarding → location-based planning
2. **Provider CRM** — manage leads that come from risk analysis planning

Built with **Next.js**, **shadcn/ui**, **Mapbox GL**, and **Three.js**.

## Getting started

```bash
cp .env.example .env.local
# add your Mapbox token to .env.local

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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
