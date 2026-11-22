-- Performance: wrap the helper calls in (select ...) so Postgres evaluates them
-- once per query (an initPlan) instead of once per row. Same rules as before.
-- Run this in the Supabase SQL Editor after 0004.

alter policy bookings_staff_read on public.bookings
  using ((select public.is_staff()));
alter policy bookings_staff_insert on public.bookings
  with check ((select public.is_staff()));
alter policy bookings_staff_update on public.bookings
  using ((select public.is_staff())) with check ((select public.is_staff()));
alter policy bookings_owner_delete on public.bookings
  using ((select public.is_owner()));

alter policy staff_profiles_read on public.staff_profiles
  using (user_id = (select auth.uid()) or (select public.is_staff()));
