-- TEST-ONLY Supabase environment shim.
--
-- On real Supabase these objects already exist (managed by the platform), so the
-- app migrations in supabase/migrations/ must NOT create them. For local PGlite
-- testing we recreate the minimum surface the app migrations and RLS policies
-- depend on, BEFORE applying those migrations. This file never ships to Supabase.

-- The three PostgREST roles. service_role bypasses RLS (as on Supabase) but still
-- needs table GRANTs — the migrations grant to it explicitly.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

-- Minimal auth schema + the auth.users table app FKs point at.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now()
);

-- Supabase-compatible JWT accessors. Null-safe for an empty/unset claims GUC
-- (an empty string is not valid JSON and would otherwise throw).
create or replace function auth.jwt() returns jsonb
  language sql stable
  as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;

create or replace function auth.uid() returns uuid
  language sql stable
  as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;

create or replace function auth.role() returns text
  language sql stable
  as $$ select nullif(auth.jwt() ->> 'role', '') $$;

grant usage on schema auth to anon, authenticated, service_role;
