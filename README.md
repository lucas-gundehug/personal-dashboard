# 🌤️ Personal Dashboard

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React_19-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38BDF8?style=flat&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=flat&logo=supabase&logoColor=white)](https://supabase.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

_Your own start page, not an empty browser tab._

> **Archived.** This project is no longer maintained. It's published as a
> template: copy it, put in your own details (see
> [Make it yours](#make-it-yours)) and deploy it yourself.

A personal "new tab" dashboard: weather, news, Outlook calendar, Spotify,
and your own shortcuts — all in one place, with a background that lives and
breathes with the weather and time of day. The same app also hosts a
login-gated weekly workout plan (`/workout`), a public CV (`/cv`), and a
drink calculator for parties/events (`/calculate`).

Built with [TanStack Start](https://tanstack.com/start), made to deploy on
[Vercel](https://vercel.com). The user interface is in Danish.

---

## 📑 Table of Contents

- [Features](#-features)
  - [Dashboard](#-dashboard--login-gated)
  - [Workout](#-workout-workout-login-gated)
  - [CV](#-cv-cv-public)
  - [Drink calculator](#-drink-calculator-calculate-public)
  - [Diagnostics](#-diagnostics)
- [Tech Stack](#tech-stack)
- [Getting Started](#-getting-started)
  - [Make it yours](#make-it-yours)
  - [Environment Variables](#environment-variables)
  - [Tests](#-tests)
  - [Build](#build)
- [Security](#security)
- [License](#-license)

---

## ✨ Features

### 🏠 Dashboard (`/`, login-gated)

- **Weather** — local weather via Open-Meteo, with an hourly forecast and a
  sunrise/sunset bar.
- **Procedural sky** — the background is a living canvas sky: the sun/moon
  move across the day, stars fade in at night, clouds drift by, and storms
  darken the sky and flash with lightning — all computed from the actual
  weather and time of day, not a static background.
- **Google search box** — right under the header; searches open in a new
  tab so the dashboard itself stays put.
- **Nav bar** to `/cv` and `/calculate` (see below).
- **Shortcuts** — an editable icon grid with favicon fallback, drag-and-drop
  reordering (mouse), and toast confirmations. The "Edit" button is
  invisible until clicked.
- **News** — latest headlines from DR, fetched server-side.
- **Today's appointments** — your Outlook calendar events via an ICS feed
  (the URL is kept secret server-side), with a calendar dropdown to pick a
  different day.
- **Login gate** — a four-digit code, checked server-side (the code never
  ships in the client bundle). A temporary token is kept only in the page's
  memory, so a refresh always shows the login screen again — see
  [Security](#security).
- **Offline banner** — a red bar at the top when `navigator.onLine` is
  false, so it's clear you're looking at cached content.
- **PWA** — installable as an app on desktop/phone (manifest + service
  worker, app shell cached, data always fetched live).
- **Spotify "now playing"** — shows what's playing on your account right
  now (whether it's the desktop app, phone, or browser, via Spotify
  Connect), with cover art, title, artist, a progress bar, and playback
  controls (play/pause, previous/next, add to favorites).
- **Hidden things** — press `?` for a cheat sheet, or find them yourself:
  - Click the clock 3× → 🟩 Wordle
  - Click the greeting 3× → 🔢 2048
  - Click the date 3× → 🐍 Snake
  - Hold `m` for 2 sec. → 💻 Matrix rain
  - Hold `t` for 2 sec. → 🧱 Tetris

  2048/Snake/Tetris high scores sync across devices via
  `/api/public/highscores` when a database is connected (see
  [Environment Variables](#environment-variables)), and otherwise fall back
  to just this browser. All five are lazy-loaded — the code is only fetched
  once one is actually unlocked, not on a regular visit (see
  [Tech Stack](#tech-stack)).

### 💪 Workout (`/workout`, login-gated)

A weekly home workout plan — running and strength sessions (just a pull-up
bar and dumbbells, no bench), as checkboxes that reset automatically every
Monday (the key is the ISO week number, e.g. `2026-W34`, so a new week is
just a new, empty key). Reached from the dashboard via a small tab with a
footprint icon in the top-right corner, not via the
[nav bar](#-dashboard--login-gated) — it's a personal habit tracker, not
something meant to compete for attention with the rest of the dashboard.

- Behind the same login code as the dashboard (its own `LoginGate`
  instance, since it's a standalone route) — see [Security](#security).
- The plan itself — which sessions and exercises exist, in what order —
  lives in Supabase (`workout_plan_sessions`/`workout_plan_exercises`)
  instead of being hardcoded, and is editable from `/workout-edit` (the
  small gear icon next to the clock): add/remove/reorder sessions and
  exercises, rename them, or change a rep target, all from the phone. See
  `WorkoutPlanEditor` in `src/components/workout-plan-editor.tsx`.
- A progress ring, a streak counter, and an 8-week heatmap (newest week
  farthest left) — all history is read from `workout_sessions` rows.
- After checking off a strength session, rate **each exercise separately**
  as nemt / passende / svært. Each exercise's rating drives its own next
  week's reps/seconds independently — one exercise can climb while another
  holds steady — instead of one rating moving the whole session together.
  See `getWeekView` in `src/lib/workout-store.ts`. Runs aren't rated —
  they're progressed by an external couch-to-5k app.
- An ❄️ badge appears next to an exercise rated svært 3 weeks running — a
  suggestion to back off, never an automatic change; you stay in control of
  when to actually lower a target.
- A small ⓘ toggle next to a rated exercise shows the last few weeks'
  ratings that produced today's number, so the adaptive step never feels
  like a black box.
- A small dot on the dashboard tab shows whether the week's goals are
  incomplete, and a short confetti animation celebrates a fully-checked
  week (both purely cosmetic, no new server state).
- Every session has a detail line per exercise. On desktop it's always
  shown; on phone it's hidden behind an arrow to save space (along with
  that session's per-exercise ratings, since rating needs to see which
  exercise you're rating).
- Checkboxes are saved to `localStorage` immediately (instant, works
  offline) and synced in the background to Supabase Postgres via
  `/api/public/workout` (see
  [Environment Variables](#environment-variables)) — check off a workout on
  your phone, and it follows you when you open the computer, as long as the
  same database is connected.
- Its own `workout-manifest.json` (`start_url: "/workout"`), so "Add to
  Home Screen" on iPhone actually opens `/workout` instead of always
  falling back to `/`. `__root.tsx` sets no default manifest link — each
  of the four pages (`/`, `/workout`, `/cv`, `/calculate`) declares its own
  instead, since TanStack Router layers route-level `<link rel="manifest">`
  tags on top of each other rather than replacing them.
- The page forces its own dark theme on mount (removes the `day` class on
  `document.documentElement`), independent of the dashboard's day/night
  logic — otherwise that class can carry over from an earlier dashboard
  visit in the same browser session.

### 📄 CV (`/cv`, public)

A standalone, shareable CV — not behind login, meant to be sent directly to
people (Messenger, LinkedIn, email).

- Experience, skills, languages, and education — all data lives in
  `src/data/cv.ts`.
- `schema.org/Person` JSON-LD in `<head>` for richer search results.
- "Save as contact" (downloads a `.vcf`), "Copy" email, and "Download as
  PDF" (uses the browser's print with a dedicated print stylesheet).
- Dedicated Open Graph image (`public/cv-og.jpg`) and `og:`/`twitter:`
  tags, so a shared link shows name + tagline instead of just the app icon.

### 🍺 Drink calculator (`/calculate`, public)

An estimation tool for draft beer, cocktails (spirits + mixer), and shots
— enter guests and duration, get a suggested number of kegs/bottles to
order. All consumption rates are editable rules of thumb.

- **Save calculation** / **History** — the 5 most recent calculations, with
  an optional name and timestamp, shared via the database (see
  [Environment Variables](#environment-variables)).
- **Copy** / **Download to Excel** — both gather data from all three cards.
  The "Excel" file is technically a CSV with a UTF-8 BOM (semicolon-
  separated, Danish characters intact) — see [Security](#security) for why
  it isn't a real `.xlsx`.

### 🩺 Diagnostics

`/api/public/health` checks
whether the calendar feed, the Spotify integration, and the database are
actually responding right now (not just whether the environment variables
are set), without requiring login.

## Tech Stack

[TanStack Start](https://tanstack.com/start) (React 19, file-based
routing, SSR) + [Vite](https://vitejs.dev) + [Tailwind CSS
v4](https://tailwindcss.com) + a handful of [shadcn/ui](https://ui.shadcn.com)
components (Dialog, Popover, Calendar, Skeleton, Sonner). Package
management with [Bun](https://bun.sh).

Optional persistence via [Upstash Redis](https://upstash.com)
(`@upstash/redis`) — the login rate limiter, the games' high scores, and the
calculate history use it when connected, and otherwise fall back to
in-memory. The [workout plan](#-workout-workout-login-gated) uses
[Supabase](https://supabase.com) Postgres (`@supabase/supabase-js`) instead,
for its per-session history and difficulty ratings; same fallback-to-memory
behavior when it's not connected (see
[Environment Variables](#environment-variables)).

**⚡ Performance** — navigation between `/`, `/cv`, and `/calculate`
cross-fades via the browser's native [View Transitions
API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API)
(`src/router.tsx`) instead of a hard page change, and automatically falls
back to a plain change in browsers without support (e.g. Firefox < 129,
Safari < 18). The five hidden games and the calendar's date picker
(`react-day-picker` + `date-fns`, ~90 KB) are lazy-loaded, so a regular
visitor never downloads code for something they don't open themselves —
`bun run check:bundle-size` keeps the rest of the client bundle under a
budget in CI (see [Build](#build)).

## 🚀 Getting Started

```bash
bun install
bun run dev
```

The site runs on `http://localhost:8080`. Set `DASHBOARD_ACCESS_CODE` first
(see below): there is no built-in code, so without it nobody can log in.

### Make it yours

- **`src/site.config.ts`** — your first name (shown in the greetings), the
  address the site will live at, and the city the weather shows by default.
- **`src/data/cv.ts`** — the CV. It holds a made-up example person; replace
  it with your own details, or remove the `/cv` page.
- **`public/cv-og.jpg`** — the preview image shown when the CV link is
  shared (1200×630). Replace it with one showing your own name.
- **`public/icon.svg`, `icon-192.png`, `icon-512.png`, `favicon.ico`** — the
  app icon.
- **Workout plan (optional)** — create a Supabase project, open its SQL
  Editor and run [`supabase/schema.sql`](supabase/schema.sql), then set
  `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`. A new database starts with
  an empty plan: add your sessions and exercises on `/workout-edit`. Without
  a database the app uses the built-in example plan from
  `src/lib/workout-store.ts`, kept in memory only.
- **Deploy** — import the repo in Vercel and add the environment variables
  below in the project settings.

### Environment Variables

Copy `.env.example` to `.env.local` and fill in what you need:

```bash
cp .env.example .env.local
```

| Variable                                                                                           | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DASHBOARD_ACCESS_CODE`                                                                            | The login code for the start page (4 digits). Only read server-side (see `src/lib/auth.ts`). **Required:** there is no default, so without it every code is refused.                                                                                                                                                                                                                                                                                                                                                         |
| `AUTH_TOKEN_SECRET`                                                                                | Optional but recommended: a random string (e.g. `openssl rand -hex 32`) mixed into the login token's HMAC key alongside `DASHBOARD_ACCESS_CODE`. Without it, the token is signed with only the code itself, which has just 10,000 possible values — a leaked token could then in theory be brute-forced offline to forge a new, non-expiring token. The code is always mixed in regardless, so rotating it always logs everyone out.                                                                                         |
| `OUTLOOK_ICS_URL`                                                                                  | Your Outlook calendar's published ICS feed URL (Outlook Web → Settings → Calendar → Shared calendars → Publish). Only read server-side — set it in `.env.local` locally and in Vercel's project settings. Without it, "Today's appointments" just shows as not configured.                                                                                                                                                                                                                                                   |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`                                                      | From an app created at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard). Add the redirect URI `<your-domain>/api/public/spotify-callback` in the app settings.                                                                                                                                                                                                                                                                                                                                     |
| `SPOTIFY_REFRESH_TOKEN`                                                                            | One-time setup: visit `/api/public/spotify-login` (requires the two above to already be set), authorize on Spotify's page, and copy the token shown afterwards on `/api/public/spotify-callback`.                                                                                                                                                                                                                                                                                                                            |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) | Set automatically if you connect an Upstash Redis database via Vercel's Storage tab (Marketplace Database Providers → Upstash). Used for the login rate limiter, the games' high scores, and the calculate history (`src/lib/login-rate-limit.ts`, `highscore-store.ts`, `calc-history-store.ts`) — without them, all three fall back to an in-memory version that resets on cold starts and isn't shared between devices.                                                                                                   |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`                                                       | Your Supabase project's API URL and **service-role** key (Project Settings → API) — never the anon/publishable key, since this is used server-only with no Supabase Auth session (`src/lib/supabase.ts`). Powers the [workout plan](#-workout-workout-login-gated)'s session history and adaptive difficulty progression (`src/lib/workout-store.ts`) — without them, it falls back to an in-memory version that resets on cold starts and isn't shared between devices. Create the tables first with `supabase/schema.sql`. |
| `HOUSEKEEPING_SERVICE_SECRET`                                                                      | Optional. Lets the companion [housekeeping](https://github.com/lucas-gundehug/housekeeping) admin app change the login code via `/api/admin/change-code` (sent as an `X-Housekeeping-Secret` header). Use a long random value of its own.                                                                                                                                                                                                                                                                                    |

### 🧪 Tests

```bash
bun run test
```

Unit tests for the login logic (`src/lib/auth.ts`), the login rate limiter
(`src/lib/login-rate-limit.ts`), and the two other Redis-backed stores
(`highscore-store.ts`, `calc-history-store.ts`) with [Vitest](https://vitest.dev).

```bash
bun run test:coverage
```

Same tests, plus a coverage report for the four files above (`coverage/`,
gitignored). Also runs in CI, where the number lands in the run's summary
tab.

### Build

```bash
bun run build
```

Deploys to [Vercel](https://vercel.com) (the Nitro `vercel` preset is
already set up). A [GitHub Actions workflow](.github/workflows/ci.yml) runs lint, type
check, tests, build, and `bun run check:bundle-size` (fails if the client
bundle grows significantly, see [Tech Stack](#tech-stack)) on every
push/PR to `main`.

## Security

The login code is verified server-side (`src/lib/auth.ts`) — it never
ships in the client bundle, and is therefore not visible via devtools or
"view source". A correct code check yields a signed (HMAC) token with a
built-in expiry (24 hours), kept only in the page's memory (not a cookie,
not `localStorage`) — close the tab or reload the page, and the login
screen is back. Also set `AUTH_TOKEN_SECRET`
(see [Environment Variables](#environment-variables)) so the signing
doesn't rely only on the code's 10,000 possible values.

Data endpoints that show or control personal things —
`/api/public/calendar`, `/api/public/spotify-now-playing`,
`/api/public/spotify-control`, `/api/public/highscores`, and
`/api/public/workout` — require a valid token and otherwise reject with
`401`. `/api/public/spotify-login` and `/api/public/spotify-callback` are
deliberately exempt: they're one-time setup you visit manually yourself to
connect the Spotify account (see `SPOTIFY_REFRESH_TOKEN` above), not
something the dashboard itself calls. `/api/public/calc-history` is also
deliberately without auth — it belongs to `/calculate`, which is itself a
public page (meant to also be usable by guests), so anyone who saves a
calculation lands in the same shared list of up to 5 entries.

Set `DASHBOARD_ACCESS_CODE` to your own code in Vercel's project settings
(Settings → Environment Variables, feel free to mark it as _Sensitive_) —
without it, nobody can log in.

The login endpoint locks a client out for 10 minutes after 5 wrong codes
(`src/lib/login-rate-limit.ts`). With an Upstash Redis database connected
(see `KV_REST_API_URL` above), the lock applies properly across Vercel's
serverless instances; without a database, it's an in-memory version that
only protects one warm instance and resets on cold starts.

`/calculate`'s "Download to Excel" button builds a CSV in the browser
instead of a real `.xlsx` — the only npm release of the `xlsx` package has
an unpatched vulnerability (prototype pollution/ReDoS), and a CSV with a
UTF-8 BOM opens fine in Excel without that risk.

Every response (HTML pages and `/api/*` JSON) gets a set of security
headers (`src/server.ts`): CSP, `X-Frame-Options`,
`X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`. They
live in the shared fetch wrapper instead of a platform-specific config
file, so they apply no matter where it's deployed. The CSP allows
`'unsafe-inline'` for scripts — TanStack Start's SSR hydration happens via
an inlined `<script>`, so a stricter policy without that would have
blocked the page from becoming interactive.

## 📜 License

MIT — see [LICENSE](LICENSE).
