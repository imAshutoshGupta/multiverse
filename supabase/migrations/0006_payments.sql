-- Payments: track what each customer has paid (advance, balance, refunds) and what's still due.
-- Run this in the Supabase SQL Editor after 0005.
--
-- * booking_payments is a ledger: one row per payment or refund. Rows are never edited;
--   a mistake is fixed by the owner deleting the row (or by recording a refund).
-- * bookings.paid_amount is kept in sync by the database (payments minus refunds) and
--   can't be set by hand, so the board can show paid / advance / due without extra queries.
-- * bookings.price is the agreed amount for the booking. null = the station's standard rate.

alter table public.bookings
  add column if not exists price numeric(10, 2) check (price is null or (price >= 0 and price <= 1000000)),
  add column if not exists paid_amount numeric(10, 2) not null default 0;

do $$ begin
  create type public.payment_method as enum ('cash', 'upi', 'card', 'other');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.payment_kind as enum ('payment', 'refund');
exception when duplicate_object then null; end $$;

create table if not exists public.booking_payments (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  amount      numeric(10, 2) not null check (amount > 0 and amount <= 1000000),
  kind        public.payment_kind not null default 'payment',
  method      public.payment_method not null default 'cash',
  note        text check (note is null or length(note) <= 200),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists booking_payments_booking_idx on public.booking_payments (booking_id);
create index if not exists booking_payments_created_idx on public.booking_payments (created_at);

-- paid_amount always equals payments minus refunds, whatever the client sends.
create or replace function public.bookings_sync_paid() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.paid_amount := coalesce((
    select sum(case when p.kind = 'refund' then -p.amount else p.amount end)
    from public.booking_payments p where p.booking_id = new.id
  ), 0);
  return new;
end $$;

drop trigger if exists bookings_sync_paid on public.bookings;
create trigger bookings_sync_paid before insert or update on public.bookings
  for each row execute function public.bookings_sync_paid();

-- Touch the booking when its payments change: the trigger above recomputes paid_amount
-- and the update reaches every open board through Realtime.
create or replace function public.booking_payments_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.bookings set updated_at = now()
  where id = case when tg_op = 'DELETE' then old.booking_id else new.booking_id end;
  return null;
end $$;

drop trigger if exists booking_payments_touch on public.booking_payments;
create trigger booking_payments_touch after insert or update or delete on public.booking_payments
  for each row execute function public.booking_payments_touch();

-- Only the database calls these.
revoke execute on function public.bookings_sync_paid() from public, anon, authenticated;
revoke execute on function public.booking_payments_touch() from public, anon, authenticated;

-- RLS: staff record and see payments; only the owner can delete one. No edits.
alter table public.booking_payments enable row level security;
drop policy if exists booking_payments_staff_read on public.booking_payments;
create policy booking_payments_staff_read on public.booking_payments for select to authenticated
  using ((select public.is_staff()));
drop policy if exists booking_payments_staff_insert on public.booking_payments;
create policy booking_payments_staff_insert on public.booking_payments for insert to authenticated
  with check ((select public.is_staff()) and created_by = (select auth.uid()));
drop policy if exists booking_payments_owner_delete on public.booking_payments;
create policy booking_payments_owner_delete on public.booking_payments for delete to authenticated
  using ((select public.is_owner()));

grant select, insert, delete on public.booking_payments to authenticated;
revoke all on public.booking_payments from anon;
