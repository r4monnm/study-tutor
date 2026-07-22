# Study Tutor

A Socratic study chat that **refuses to be an answer vending machine.** Pick any
topic and a learning mode; the tutor guides you toward the answer with questions and
staged hints — and it will not hand over a final answer until a *separate* grader
model confirms, in code, that you actually understand how to get there yourself.

The point is to make studying with an AI feel like working with a good tutor, not
copy-pasting solutions.

---

## The one idea that makes it work

**The answer is leak-proof by construction.**

For every problem, the correct answer lives only in server state. It is *never* placed
in the tutor model's prompt while the gate is locked — so no amount of "ignore your
instructions" or "just tell me" can extract it, because the tutor genuinely does not
have it.

A separate, cheaper **grader** model looks at what you typed and returns strict JSON:

```json
{ "understanding_demonstrated": true, "reason": "…", "next_hint": "" }
```

Only when that boolean is `true` does application code unlock the reveal and inject the
answer into the tutor's context. The gate is enforced in **code**, not in a prompt the
model could be talked out of.

This was verified live against real models and is guarded by a red-team test suite that
asserts **0% answer leakage and 0% illegitimate unlocks** on every build.

---

## What's in it

Four study modes, plus review and progress — all sharing the same answer-withholding rule:

| Mode | What it does |
|---|---|
| **Quiz** | One question at a time, staged hints instead of solutions, a parallel worked example after repeated misses. The answer stays locked until the grader passes. |
| **Notes** | Teaches a topic in small, paced chunks, each ending with a check question — never dumps the whole topic at once. |
| **Flashcards** | Type your recall of a card's back; it's hidden until you commit, then the grader decides whether it counts toward mastery. |
| **Game** | A Quizlet-Match–style timed board: match six term/definition pairs against the clock, +1 second per wrong match so accuracy matters. Per-topic personal bests. |
| **Review** | Delayed-retention check — re-quizzes items you studied in a *previous* session and records whether they held or lapsed, and after how long. |
| **Dashboard** | Points, current/best streak, per-topic mastery, personal bests, and your retention rate. |

Supporting systems:

- **Leitner mastery tracking** — cards move up a box on a correct *recall* (typing), never on recognition; the weakest, least-recently-seen items surface most often.
- **Points & streaks** — awarded only for genuine recall, never for extracting answers; a flagged jailbreak earns nothing.
- **Guardrail layer** — fast heuristics plus a Haiku classifier screen input for extraction/jailbreak/injection attempts; a flagged attempt gets an in-character redirect and is never graded.
- **Grader hardening** — the student attempt is delimited and sandwiched so injected "output true" text is graded as data, never obeyed as an instruction.
- **Durable progress** — mastery, points, personal bests, and retention persist across sessions in SQLite, keyed by a browser-local learner id (no login required).

---

## Tech stack

- **Backend:** Node (ESM) · TypeScript · Express · the official Anthropic SDK
- **Frontend:** Vite · React · TypeScript · Tailwind CSS
- **Persistence:** built-in `node:sqlite` (zero external dependency), behind a swappable interface
- **Models:** `claude-sonnet-5` for the tutor (streamed) · `claude-haiku-4-5` for the grader and guardrail classifier (strict JSON) — both configurable
- **Tests:** Vitest + Supertest — 86 tests, built test-first

No authentication (a browser-generated learner id only); no external database — it runs entirely on your machine.

---

## Getting started

Prerequisites: Node 22+ (developed on Node 26) and an [Anthropic API key](https://console.anthropic.com).

```bash
# 1. Backend + credentials
cd server
cp .env.example .env          # then edit server/.env and set ANTHROPIC_API_KEY
npm install
npm test                      # 86 tests, incl. the red-team leak suite
npm run dev                   # API on http://localhost:8787

# 2. Frontend (separate terminal)
cd client
npm install
npm run dev                   # app on http://localhost:5173
```

Open http://localhost:5173, enter a topic, and pick a mode.

> The `.env` file lives in `server/` — that's the working directory the service loads
> it from. Configurable keys: `ANTHROPIC_API_KEY`, `PORT`, `TUTOR_MODEL`,
> `GRADER_MODEL`, `PROBLEM_MODEL`, `HINT_CAP`, `DB_PATH`, `RETENTION_THRESHOLD_MS`,
> `POINTS_PER_CORRECT`, `GUARDRAIL_CLASSIFIER`.

### Measure the leakage rate yourself

The red-team CI test proves the gate holds structurally on every build. To measure the
*empirical* leakage rate against the real models, run the corpus with a live key:

```bash
cd server && npm run redteam
```

It runs an attack corpus (extraction, jailbreak, role-change, prompt-injection, encoded)
through the real guardrail + grader + gate and prints a per-attack table plus the
illegitimate-unlock and leakage rates, exiting non-zero if anything leaks.

---

## Architecture

The whole app is built from small, single-purpose modules behind clean interfaces, so
any piece — the model, the database, the grading logic — can be swapped without
rewriting callers.

```
server/src/
  app.ts            Express app + all routes (createApp is dependency-injected)
  gate.ts           The answer gate — the sole authority that unlocks a reveal
  grader.ts         Independent grader call (strict JSON, injection-hardened)
  guardrail.ts      Input screening: heuristics + Haiku classifier
  tutor.ts          Tutor context builder — never holds the answer while locked
  notes.ts          Notes (paced-chunk) context builder
  sandwich.ts       Post-user-content reminder (the "sandwich" reiteration)
  hints.ts          Hint-level escalation
  mastery.ts        Leitner boxes + weak-first ordering (pure functions)
  deck.ts           Term/definition deck generator
  game.ts           Match-board builder + personal-best logic (pure)
  problem.ts        Quiz problem generator
  points.ts         Recall-only points/streak awarding
  store/            In-memory ephemeral state (sessions, decks, chat)  → Store interface
  learnerStore.ts   Durable per-learner data in SQLite                 → LearnerStore interface
  llm/              Anthropic adapter + the LLM seam (a fake backs the tests)
  redteam/          Shared attack corpus + the leakage-rate report script

client/src/
  App.tsx           Mode-switching shell
  views/            Notes / Flashcards / Game / Review / Dashboard
  api.ts            Typed API client + learner-id management
```

Two design lines worth calling out:

- **The tutor never has the answer while locked.** `tutor.ts` places the answer into
  the model's context only in the reveal branch, which is only reachable after
  `gate.ts` unlocks — which only happens on a `true` grader verdict.
- **Ephemeral vs. durable is split.** Session/chat state lives in the in-memory `Store`;
  everything that must survive a reload (mastery, points, bests, retention) lives in the
  SQLite `LearnerStore`. Both are interfaces — the in-memory store could become Redis,
  the learner store could become Postgres, without touching a route.

---

## How it was built

Developed in four reviewed stages, each spec'd, planned, and implemented test-first:

1. **Quiz + the code-enforced answer gate** — the core leak-proof mechanism.
2. **Notes, Flashcards, Game + the Leitner mastery tracker.**
3. **Guardrail screening, grader hardening, and the red-team harness.**
4. **Persistence, points/streaks, dashboard, and delayed-retention review.**

Design specs and implementation plans for every stage live in `docs/superpowers/`.

---

## License

No license specified yet — all rights reserved by default. Add a license file if you
intend others to reuse the code.
