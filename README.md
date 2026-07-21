# Study Tutor

A Socratic study chat. Pick a topic and a mode; the tutor guides you to answers
instead of handing them over. A separate grader model decides — in code — whether
you've demonstrated understanding before any answer is revealed.

**Stage 1 ships Quiz mode + the code-enforced answer gate.**

## How the gate works

The correct answer for a problem lives only in server memory. It is never placed in
the tutor model's context until an independent grader (Haiku 4.5) returns
`understanding_demonstrated: true`. A jailbroken tutor can't leak an answer it was
never given.

## Setup

Prereqs: Node 20+ (tested on Node 26).

```bash
# 1. Configure credentials
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY

# 2. Backend
cd server
npm install
npm test          # run the suite, incl. the red-team leak test
npm run dev       # http://localhost:8787

# 3. Frontend (separate terminal)
cd ../client
npm install
npm run dev       # http://localhost:5173
```

## Models

- Tutor conversation: `claude-sonnet-5` (streamed, adaptive thinking)
- Grader: `claude-haiku-4-5` (strict JSON)

Change them in `.env` (`TUTOR_MODEL`, `GRADER_MODEL`, `PROBLEM_MODEL`).

## Architecture

`server/src` — six modules behind clean interfaces:
`modes/` (router), `tutor.ts` (engine), `gate.ts` (answer gate), `grader.ts`,
`hints.ts` (escalation), `store/` (swappable persistence), plus `problem.ts`
(problem generator). State is in-memory behind the `Store` interface — swap in
SQLite/Postgres without touching callers.
