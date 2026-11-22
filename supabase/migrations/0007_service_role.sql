-- Let the server-side secret key (the service_role) use the app's tables.
-- Newer Supabase projects don't grant table access to service_role automatically,
-- so Settings → Staff failed with "permission denied for table staff_profiles".
-- service_role is only ever used on the server (SUPABASE_SECRET_KEY); it bypasses RLS.
-- Run this in the Supabase SQL Editor after 0006. Safe to re-run.

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Tables added by later migrations get the same access
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
