# Movie Memory

A small full-stack app: sign in with Google, tell it your favorite movie, and get a fun fact about it from OpenAI.

**Stack:** TypeScript, Next.js 16 (App Router), React, Tailwind CSS v4, Postgres, Prisma 6, Auth.js v5 (Google OAuth), OpenAI API, Redis (cache + lock), Vitest.

**Variant chosen: A, Backend-Focused (caching + correctness)**, see [Why Variant A](#why-variant-a).

---

## Setup

Prerequisites: Node 20+, a Postgres database, Redis (optional but recommended, see below), a Google OAuth client, and an OpenAI API key.

```bash
npm install
cp .env.example .env.local        # then fill in the values (next section)
npm run db:deploy                 # apply migrations (see "Database migrations")
npm run dev                       # http://localhost:3000
```

**Postgres:** any Postgres 14+ works. `docker compose up -d` starts one from `docker-compose.yml`.

**Redis** (optional):

```bash
docker run -d --name movie-memory-redis -p 6379:6379 redis:7
```

Without `REDIS_URL` the app still works, but there is no 60-second cache and no burst protection: every dashboard load generates a new fact.

**Google OAuth:** in Google Cloud Console, create an OAuth client (type: Web application) and add this authorized redirect URI (adjust the port if you change it):

```
http://localhost:3000/api/auth/callback/google
```

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `AUTH_SECRET` | yes | Auth.js session secret. Generate with `npx auth secret` |
| `AUTH_GOOGLE_ID` | yes | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | yes | Google OAuth client secret |
| `OPENAI_API_KEY` | yes | OpenAI key (server-side only, never sent to the browser) |
| `OPENAI_MODEL` | no | Defaults to `gpt-4o-mini` |
| `REDIS_URL` | no | e.g. `redis://localhost:6379`. Enables the fact cache and generation lock |

None of these are prefixed with `NEXT_PUBLIC_`, so none are exposed to client code. `.env*` files are git-ignored except `.env.example`.

### Database migrations

Migrations live in `prisma/migrations`.

```bash
npm run db:migrate    # development: apply + create new migrations (prisma migrate dev)
npm run db:deploy     # apply existing migrations (CI / production, prisma migrate deploy)
npm run db:studio     # optional: browse data
```

### Other scripts

```bash
npm test              # Vitest (no database, Redis or OpenAI needed)
npm run typecheck     # tsc --noEmit
npm run build && npm start
```

---

## Architecture overview

### Folder layout

```
prisma/schema.prisma        data model + migrations
src/
  app/                      routes only: pages, server action, API handlers
    page.tsx                landing (Sign in with Google)
    onboarding/             first-time favorite-movie form (+ server action)
    dashboard/              profile, favorite movie, fun fact, logout
    api/auth/[...nextauth]  Auth.js handlers
    api/me, api/me/movie    profile + movie update
    api/fact                fact endpoint (same service as the dashboard)
  config/                   auth, prisma, openai, redis clients (one place each)
  utils/                    validation, current-user, fact-cache, facts (business logic)
  components/               UI pieces used by the pages
  middleware.ts             protects /dashboard and /onboarding
tests/                      Vitest unit tests + an in-memory fake Redis
```

Pages stay thin; business rules live in `utils/` so they can be unit tested without rendering anything.

### Auth flow

- Auth.js with the Google provider and the Prisma adapter, using **database sessions** (the session cookie is an opaque token; the user, account and session rows are in Postgres).
- `/` shows "Sign in with Google" (signed-in users are redirected to `/dashboard`).
- `/dashboard` and `/onboarding` are guarded twice: middleware redirects logged-out visitors, and each page re-checks the session on the server (`requireUser`).
- A user with no `favoriteMovie` is sent to `/onboarding`; once saved they go to `/dashboard`. A returning user lands on the dashboard directly.
- The dashboard shows name, email, photo and favorite movie, with fallbacks for a missing name ("Movie fan") or photo (placeholder avatar).

### Data model

| Model | Notes |
| --- | --- |
| `User` | Auth.js fields (`name`, `email`, `image`) plus `favoriteMovie` (null until onboarding, so it doubles as the "needs onboarding" flag) |
| `Account`, `Session`, `VerificationToken` | Auth.js adapter tables |
| `Fact` | `userId`, `movie`, `content`, `createdAt`. Every generated fact is stored |

Design choices:
- `Fact.movie` stores the title the fact was generated for. If a user changes their movie, old facts stay correctly labeled, and "latest fact for this user + movie" is a simple filtered query.
- Index `(userId, movie, createdAt desc)` makes that query cheap.
- `onDelete: Cascade` from `User` removes a user's facts with their account.

### Fact generation (Variant A)

`getFact(userId, movie)` in `src/utils/facts.ts`, used by both the dashboard and `GET /api/fact`:

```
cache hit (< 60s)?  -> return it                              source: "cache"
miss -> take lock "generation in progress"
   lock busy      -> wait (poll cache) for the winner's fact  source: "cache"
   lock acquired  -> re-check cache, call OpenAI, save to
                     Postgres, cache for 60s, release lock    source: "generated"
any failure       -> latest stored fact for this user+movie   source: "stale-fallback"
                     else a friendly error (HTTP 502)
```

1. **60-second cache window.** The fact is cached in Redis under `fact:{userId}:{hash(movie)}` with `EX 60`; Redis expires it, so there is no timestamp arithmetic to get wrong. A fact exactly 60 seconds old is regenerated. Because the key includes the movie, changing the movie never returns the old movie's fact.
2. **Burst / idempotency protection.** The "generation in progress" flag is a Redis lock: `SET lock:fact:{user}:{movie} <token> NX PX 15000`. Only one request wins; the others poll the cache (200 ms interval, 10 s max) and return the winner's fact. After winning, a request re-checks the cache before calling OpenAI (another request may have just finished). The lock is released with a compare-and-delete Lua script so one request can never release a lock that expired and was taken by another. Two tabs or fast refreshes therefore produce one OpenAI call and one stored fact.
3. **Failure handling.** OpenAI errors or timeouts, a failed wait, or a Redis problem fall back to the most recent stored fact (always filtered by `userId`); if none exists the user sees "We could not generate a fun fact right now" and the API returns 502. The dashboard labels a fallback fact as previously saved. If Redis itself is down, the cache and lock are skipped and the request still works.
4. **Safe OpenAI usage.** Key is server-only; 8 s timeout, no retries (so a call always finishes inside the 15 s lock); `max_tokens` 150; the movie title is JSON-quoted and the system prompt says it is data, not instructions; raw errors are logged server-side and never shown to the user.

### API

All routes derive the user from the **session**, never from request input, so one user can't read or change another's data. Unauthenticated calls return 401.

| Route | Behavior |
| --- | --- |
| `GET /api/me` | `{ user: { name, email, image, favoriteMovie } }` |
| `PUT /api/me/movie` | Body `{ movie }`, validated server-side (trimmed, 1-100 chars). 400 on invalid input |
| `GET /api/fact` | `{ fact: { content, createdAt }, source }`. 409 if no movie set, 502 on generation failure |

The onboarding form uses a server action with the same validation (`src/utils/validation.ts`).

### Tests

`npm test` runs 18 tests with mocked Prisma and OpenAI and an in-memory fake Redis:
- **Cache window:** 59 s is a hit, exactly 60 s regenerates, a different movie is a miss.
- **Concurrency:** 5 simultaneous requests cause exactly one OpenAI call and one stored fact; the lock is released after a failure; Redis being down still works.
- **Failure handling:** stored-fact fallback, and a friendly error when none exists.
- **Authorization:** one user never receives another user's cached or stored fact; `/api/fact` returns 401 without a session and only queries the session user's id.

---

## Why Variant A

The criteria emphasize data modeling, security and error handling, and Variant A goes deepest on those: schema design, a correct time window, concurrency, and failure behavior. It also suits my C++ background in real-time systems, where I learned to define correctness at the boundaries (a fact 59 vs. 60 seconds old), reason about races before coding, and treat every lock and timeout as having a failure mode.

## Key tradeoffs

- **Redis lock vs. alternatives.** Compared with a Postgres transaction/advisory lock (holds a DB connection open during the OpenAI call), a unique-constraint-per-window (needs a schema change and awkward handling for the losing request), or an in-memory lock (breaks with more than one server), a Redis flag works across instances, needs no schema change and holds no DB connection. The cost is a Redis dependency.
- **The 60s window is measured by the cache TTL**, from when the fact was cached, not from `Fact.createdAt`. They differ by milliseconds. In exchange there is no clock math and expiry is atomic.
- **Best-effort lock.** It expires after 15 s so a crash can't wedge a user. The 8 s OpenAI timeout keeps generation inside that window, but this is not a fencing-token lock.
- **Redis is optional.** If it is down or unset, the app degrades to "generate every time" rather than failing, which also means no burst protection in that mode.
- **Fallback over freshness.** When OpenAI fails we show an older stored fact (labeled) instead of an error, because that is usually the better experience.
- **Facts are only stored, never pruned.** Simple, but the table grows without bound.
- **Database sessions** (not JWT) so sessions can be revoked server-side, at the cost of a DB read per authenticated request.

## What I would improve with 2 more hours

- Integration tests against real Postgres and Redis (a real concurrent-request test, not only the fake).
- A Postgres advisory-lock fallback so burst protection still holds when Redis is down.
- Per-user rate limiting on `/api/fact` to cap OpenAI spend, plus a moderation check on the movie title.
- Rename `middleware.ts` to `proxy.ts` (Next.js 16 deprecation) and add Playwright tests for the sign-in, onboarding and dashboard flows.
- Prune old facts and a "refresh fact" button that respects the cache window.
- Structured logging and basic metrics (cache hit rate, OpenAI latency and failures).
