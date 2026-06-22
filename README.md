# Time Orchestrator

A personal time-orchestration app: recurring tasks, manual todos, a
calendar view, and per-date overrides — built on Next.js (App Router),
Prisma/SQLite, and NextAuth.js v5.

## Locked design decisions (for reference — see project docs for full detail)

- Single time block per task per day.
- Overlap allowed; flagged visually, never auto-resolved.
- Completing a recurring task only marks that date complete; it never alters the recurrence rule.
- Conflict priority (highest → lowest): Exception override → Pinned manual todo → Standard manual todo → Unmodified recurring instance.
- Reminders: a `notifications` field is reserved on `ManualTodo` in `prisma/schema.prisma`. No reminder logic is built.
- Tags: stored as a string array on `RecurrenceRule`/`ManualTodo`. No tag-editing UI yet.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment variables**

   Copy the example file and fill in the two values:

   ```bash
   cp .env.example .env
   ```

   - `DATABASE_URL` — defaults to `file:./dev.db` (SQLite), no changes needed for local dev.
   - `AUTH_SECRET` — generate one and paste it in:

     ```bash
     openssl rand -base64 32
     ```

3. **Set up the database**

   ```bash
   npx prisma migrate dev --name init
   ```

   This creates `prisma/dev.db` and applies the schema (Users, RecurrenceRules, Exceptions, ManualTodos, DayCompletions, plus the NextAuth Account/Session/VerificationToken tables). Re-run `npx prisma migrate dev` any time `prisma/schema.prisma` changes.

4. **Run the dev server**

   ```bash
   npm run dev
   ```

   Visit `http://localhost:3000` — it redirects to `/calendar`.

5. **Create an account**

   Go to `/auth/signup`, register, then sign in at `/auth/signin`. All of the data API routes (`/api/rules`, `/api/todos`, `/api/schedule`, `/api/schedule-range`, `/api/exceptions`, `/api/completions`) require a signed-in session — see `src/middleware.ts`.

### Other scripts

```bash
npm run build          # production build
npm run start           # run a production build
npm run lint            # eslint
npm test                # vitest (recurrence engine unit tests)
npx prisma studio       # browse the local SQLite db in a GUI
```

## What's implemented

- **Auth** — email/password via NextAuth.js v5 Credentials provider (`src/lib/auth.ts`, `src/lib/auth.config.ts`), bcrypt-hashed passwords, sign-in/sign-up pages, `/api/auth/register`, and session-gated middleware on the data routes.
- **Recurrence engine** (`src/lib/recurrence/`) — occurrence generation for daily/weekly/biweekly/monthly/custom rules, and `applyExceptions` for resolving per-date overrides.
- **Schedule merge** (`src/lib/schedule.ts`) — combines recurrence occurrences and manual todos per date under the conflict priority order above, flags overlapping time blocks, and reflects completion status. Backs both `/api/schedule` (single day) and `/api/schedule-range` (date range, used by the calendar's month view to show event dots).
- **API routes** (`src/app/api/`) — rules, exceptions, todos, schedule, schedule-range, completions, auth.
- **Calendar UI** (`src/app/calendar`, `src/app/day`) — month/week grid with event dots, day timeline with drag-to-reorder and conflict badges, manual todo entry, and an edit/override modal for recurring and manual items alike.

### Known gaps / next steps

- `src/app/api/rules/[id]/split/route.ts` ("edit this and all following occurrences") is still a documented placeholder.
- Drag-and-drop reordering in `DayTimeline` is local-only — there's no batch position-persistence endpoint yet.
- The root layout's "Sign In" nav button is still a disabled placeholder; it isn't wired to real session state yet (no `SessionProvider`/`useSession` in the tree).
