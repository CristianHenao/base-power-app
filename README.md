# Base Power

Progressive web app built with **Next.js**, **shadcn/ui**, **Mapbox GL**, and **Three.js**.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS v4
- shadcn/ui component primitives
- Serwist (`@serwist/turbopack`) for PWA / service worker
- Mapbox GL JS with a Three.js custom-layer scaffold

## Getting started

```bash
cp .env.example .env.local
# add your Mapbox token to .env.local

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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
  app/                 # routes, layout, PWA manifest + SW
  components/
    layout/            # app shell
    map/               # Mapbox + Three.js map views
    providers/         # Serwist + future providers
    ui/                # shadcn primitives
  lib/
    map/               # map config + Three.js layer helper
```

## PWA notes

- Manifest: `src/app/manifest.ts`
- Service worker: `src/app/sw.ts` (served via `/serwist/sw.js`)
- Offline fallback: `/~offline`
- Service worker registration is disabled in development
