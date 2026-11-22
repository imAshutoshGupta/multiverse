-- Explicit privileges for the API roles.
-- Newer Supabase projects don't auto-grant table access to anon/authenticated,
-- so we grant exactly what the app needs. RLS policies (0001) still decide
-- which rows each role can see or change.

grant usage on schema public to anon, authenticated;

-- Public catalogue for the customer booking page (read-only)
grant select on public.settings, public.stations, public.games to anon;

-- Signed-in users: RLS limits this to staff (and owner-only for settings/stations/games)
grant select, update on public.settings to authenticated;
grant select, insert, update, delete on public.stations, public.games, public.bookings to authenticated;
grant select on public.staff_profiles to authenticated;

-- Functions used by RLS policies and the public booking page
grant execute on function public.is_staff() to anon, authenticated;
grant execute on function public.is_owner() to anon, authenticated;
grant execute on function public.business_window(date) to anon, authenticated;
grant execute on function public.get_availability(date) to anon, authenticated;
grant execute on function
  public.request_booking(date, text, timestamptz, int, text, text, int, uuid, text)
  to anon, authenticated;

-- Customers never get direct access to bookings: they go through request_booking().
revoke all on public.bookings from anon;
