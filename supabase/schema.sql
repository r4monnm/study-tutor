-- Study Tutor — Supabase schema
-- Run this once in your Supabase project: SQL Editor → New query → paste → Run.
--
-- SECURITY MODEL (leak-proof gate preserved):
--   * Accounts are managed by Supabase Auth (auth.users) — email + password.
--   * ALL access to these tables goes through the serverless API using the
--     service_role key, which BYPASSES row-level security.
--   * RLS is ENABLED on every table with NO permissive policies, so the browser
--     (holding only the publishable/anon key) is DENIED all direct reads/writes.
--     In particular problems.correct_answer / correct_approach can never be read
--     by a client — the answer stays server-side until the grader unlocks it.

-- ── Ephemeral study-session + gate state (durable so it survives serverless) ──

create table if not exists public.study_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  topic             text not null default '',
  mode              text not null default 'quiz',
  active_problem_id uuid,
  created_at        timestamptz not null default now()
);
create index if not exists study_sessions_user_idx on public.study_sessions (user_id);

create table if not exists public.problems (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.study_sessions (id) on delete cascade,
  question         text not null,
  correct_answer   text not null,   -- HIDDEN: never leaves the server while locked
  correct_approach text not null,   -- HIDDEN: grader-only
  q_type           text not null default '',
  hint_level       int  not null default 0,
  last_grader_hint text not null default '',
  unlocked         boolean not null default false,
  created_at       timestamptz not null default now()
);
create index if not exists problems_session_idx on public.problems (session_id);

-- The tutor/notes LLM conversation turns for one session (context continuity).
create table if not exists public.session_turns (
  id         bigint generated always as identity primary key,
  session_id uuid not null references public.study_sessions (id) on delete cascade,
  role       text not null,          -- 'user' | 'assistant'
  content    text not null,
  created_at timestamptz not null default now()
);
create index if not exists session_turns_session_idx on public.session_turns (session_id, id);

-- The generated flashcard deck for a session (stored whole as JSON).
create table if not exists public.decks (
  session_id uuid primary key references public.study_sessions (id) on delete cascade,
  topic      text not null,
  cards      jsonb not null default '[]'::jsonb   -- [{id, term, definition}, ...]
);

-- ── The durable, per-USER chat history shown in the UI thread ──
-- (Distinct from session_turns: this is exactly what the learner sees on screen —
--  tutor bubbles, their own messages, and system lines — reloaded on every login.)

create table if not exists public.chat_messages (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null,          -- 'tutor' | 'you' | 'system'
  text       text not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_user_idx on public.chat_messages (user_id, id);

-- ── Durable learner progress (was the SQLite learnerStore, now per auth user) ──

create table if not exists public.cards (
  user_id    uuid not null references auth.users (id) on delete cascade,
  topic      text not null,
  term       text not null,
  definition text not null,
  primary key (user_id, topic, term)
);

create table if not exists public.mastery (
  user_id      uuid not null references auth.users (id) on delete cascade,
  topic        text not null,
  term         text not null,
  box          int  not null default 0,
  attempts     int  not null default 0,
  correct      int  not null default 0,
  history      jsonb not null default '[]'::jsonb,  -- boolean[]
  last_seen_at bigint not null default 0,           -- epoch ms
  primary key (user_id, topic, term)
);
create index if not exists mastery_due_idx on public.mastery (user_id, last_seen_at);

create table if not exists public.personal_best (
  user_id uuid not null references auth.users (id) on delete cascade,
  topic   text not null,
  seconds int  not null,
  primary key (user_id, topic)
);

create table if not exists public.learner_stats (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  points         int not null default 0,
  current_streak int not null default 0,
  best_streak    int not null default 0
);

create table if not exists public.retention_event (
  id       bigint generated always as identity primary key,
  user_id  uuid not null references auth.users (id) on delete cascade,
  topic    text not null,
  term     text not null,
  delay_ms bigint not null,
  held     boolean not null,
  at       bigint not null
);
create index if not exists retention_event_user_idx on public.retention_event (user_id);

-- ── Lock everything down: RLS on, no client-facing policies (service_role only) ──

alter table public.study_sessions  enable row level security;
alter table public.problems         enable row level security;
alter table public.session_turns    enable row level security;
alter table public.decks            enable row level security;
alter table public.chat_messages    enable row level security;
alter table public.cards            enable row level security;
alter table public.mastery          enable row level security;
alter table public.personal_best    enable row level security;
alter table public.learner_stats    enable row level security;
alter table public.retention_event  enable row level security;
-- (No CREATE POLICY statements on purpose: with RLS enabled and zero policies,
--  the anon/authenticated roles are denied all access. The serverless API uses
--  the service_role key, which bypasses RLS entirely.)
