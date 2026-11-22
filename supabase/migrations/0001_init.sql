-- Multiverse Cafe booking system: initial schema
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- All business times are Asia/Kolkata (IST, UTC+05:30, no DST).

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.booking_status as enum
  ('pending', 'confirmed', 'arrived', 'completed', 'cancelled', 'no_show');
create type public.booking_source as enum ('staff', 'online');
create type public.staff_role as enum ('owner', 'staff');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.settings (
  id                     int primary key default 1 check (id = 1),
  cafe_name              text not null default 'The Multiverse',
  whatsapp_number        text not null default '917666383697',
  address                text not null default 'Nisarg Greens, Ambernath',
  open_time              time not null default '11:00',
  -- close_time <= open_time means the cafe closes after midnight
  close_time             time not null default '23:00',
  slot_minutes           int  not null default 30 check (slot_minutes in (15, 30, 60)),
  max_booking_minutes    int  not null default 240 check (max_booking_minutes between 30 and 720),
  online_booking_enabled boolean not null default true,
  updated_at             timestamptz not null default now()
);
insert into public.settings default values;

create table public.stations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) between 1 and 60),
  type         text not null check (length(trim(type)) between 1 and 40),
  hourly_rate  numeric(10, 2) not null default 0 check (hourly_rate >= 0),
  max_players  int not null default 4 check (max_players between 1 and 50),
  active       boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create table public.games (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) between 1 and 80),
  -- null = available on every station type
  station_type  text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table public.staff_profiles (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  role          public.staff_role not null default 'staff',
  created_at    timestamptz not null default now()
);

create table public.bookings (
  id             uuid primary key default gen_random_uuid(),
  station_id     uuid not null references public.stations (id) on delete restrict,
  customer_name  text not null check (length(trim(customer_name)) between 1 and 80),
  -- digits only, with country code (e.g. 919876543210)
  phone          text check (phone is null or phone ~ '^[0-9]{10,15}$'),
  game_id        uuid references public.games (id) on delete set null,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  party_size     int not null default 1 check (party_size between 1 and 50),
  status         public.booking_status not null default 'confirmed',
  source         public.booking_source not null default 'staff',
  notes          text check (notes is null or length(notes) <= 500),
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint bookings_time_order check (ends_at > starts_at),
  -- The core guarantee: one station can never be double-booked.
  constraint bookings_no_overlap exclude using gist (
    station_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending', 'confirmed', 'arrived'))
);
create index bookings_starts_at_idx on public.bookings (starts_at);
create index bookings_phone_idx on public.bookings (phone);
create index bookings_status_idx on public.bookings (status);

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger bookings_touch before update on public.bookings
  for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------
create function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_profiles where user_id = auth.uid());
$$;

create function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff_profiles where user_id = auth.uid() and role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.settings       enable row level security;
alter table public.stations       enable row level security;
alter table public.games          enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.bookings       enable row level security;

-- Public catalogue info (needed by the customer booking page)
create policy settings_read on public.settings for select to anon, authenticated using (true);
create policy settings_owner_update on public.settings for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy stations_read on public.stations for select to anon, authenticated using (true);
create policy stations_owner_insert on public.stations for insert to authenticated with check (public.is_owner());
create policy stations_owner_update on public.stations for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy stations_owner_delete on public.stations for delete to authenticated using (public.is_owner());

create policy games_read on public.games for select to anon, authenticated using (true);
create policy games_owner_insert on public.games for insert to authenticated with check (public.is_owner());
create policy games_owner_update on public.games for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy games_owner_delete on public.games for delete to authenticated using (public.is_owner());

create policy staff_profiles_read on public.staff_profiles for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

-- Bookings hold customer phone numbers: staff only. Customers go through RPCs.
create policy bookings_staff_read on public.bookings for select to authenticated using (public.is_staff());
create policy bookings_staff_insert on public.bookings for insert to authenticated with check (public.is_staff());
create policy bookings_staff_update on public.bookings for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy bookings_owner_delete on public.bookings for delete to authenticated using (public.is_owner());

-- ---------------------------------------------------------------------------
-- Business-day helpers
-- ---------------------------------------------------------------------------
create function public.business_window(p_date date, out opens_at timestamptz, out closes_at timestamptz)
language sql stable security definer set search_path = public as $$
  select
    (p_date + s.open_time) at time zone 'Asia/Kolkata',
    (p_date + s.close_time
       + case when s.close_time <= s.open_time then interval '1 day' else interval '0' end)
      at time zone 'Asia/Kolkata'
  from public.settings s
  where s.id = 1;
$$;

-- Busy intervals for a business day, without any customer details.
create function public.get_availability(p_date date)
returns table (station_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.station_id, b.starts_at, b.ends_at
  from public.bookings b, public.business_window(p_date) w
  where b.status in ('pending', 'confirmed', 'arrived')
    and b.starts_at < w.closes_at
    and b.ends_at > w.opens_at;
$$;

-- ---------------------------------------------------------------------------
-- Public booking request (customer page). Picks the first free station of the
-- requested type and creates a *pending* booking for staff to confirm.
-- ---------------------------------------------------------------------------
create function public.request_booking(
  p_date          date,
  p_station_type  text,
  p_starts_at     timestamptz,
  p_minutes       int,
  p_name          text,
  p_phone         text,
  p_party_size    int default 1,
  p_game_id       uuid default null,
  p_notes         text default null
) returns json
language plpgsql volatile security definer set search_path = public as $$
declare
  s        public.settings%rowtype;
  w        record;
  v_end    timestamptz;
  v_phone  text;
  v_name   text;
  v_notes  text;
  v_st     record;
  v_id     uuid;
begin
  select * into s from public.settings where id = 1;
  if not s.online_booking_enabled then
    raise exception 'ONLINE_BOOKING_DISABLED';
  end if;

  v_name := trim(coalesce(p_name, ''));
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'INVALID_NAME';
  end if;

  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_phone) = 11 and left(v_phone, 1) = '0' then
    v_phone := substr(v_phone, 2);
  end if;
  if length(v_phone) = 10 then
    v_phone := '91' || v_phone;
  end if;
  if v_phone !~ '^[0-9]{11,15}$' then
    raise exception 'INVALID_PHONE';
  end if;

  if p_party_size is null or p_party_size < 1 or p_party_size > 50 then
    raise exception 'INVALID_PARTY_SIZE';
  end if;

  v_notes := nullif(left(trim(coalesce(p_notes, '')), 500), '');

  -- Time checks
  select * into w from public.business_window(p_date);
  if p_minutes is null or p_minutes < s.slot_minutes or p_minutes > s.max_booking_minutes
     or p_minutes % s.slot_minutes <> 0 then
    raise exception 'INVALID_DURATION';
  end if;
  v_end := p_starts_at + make_interval(mins => p_minutes);
  if p_starts_at < w.opens_at or v_end > w.closes_at
     or (extract(epoch from (p_starts_at - w.opens_at))::bigint % (s.slot_minutes * 60)) <> 0 then
    raise exception 'OUTSIDE_HOURS';
  end if;
  if p_starts_at < now() - interval '5 minutes' then
    raise exception 'IN_THE_PAST';
  end if;
  if p_starts_at > now() + interval '30 days' then
    raise exception 'TOO_FAR_AHEAD';
  end if;

  if p_game_id is not null and not exists (
    select 1 from public.games g where g.id = p_game_id and g.active
  ) then
    raise exception 'INVALID_GAME';
  end if;

  -- Abuse limits
  if (select count(*) from public.bookings b
      where b.phone = v_phone and b.source = 'online' and b.status = 'pending') >= 3 then
    raise exception 'TOO_MANY_PENDING';
  end if;
  if (select count(*) from public.bookings b
      where b.source = 'online' and b.created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'RATE_LIMITED';
  end if;

  -- Try each matching station in order; the exclusion constraint settles races.
  for v_st in
    select st.id, st.name
    from public.stations st
    where st.active
      and st.type = p_station_type
      and st.max_players >= p_party_size
      and not exists (
        select 1 from public.bookings b
        where b.station_id = st.id
          and b.status in ('pending', 'confirmed', 'arrived')
          and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts_at, v_end, '[)')
      )
    order by st.sort_order, st.name
  loop
    begin
      insert into public.bookings
        (station_id, customer_name, phone, game_id, starts_at, ends_at,
         party_size, status, source, notes)
      values
        (v_st.id, v_name, v_phone, p_game_id, p_starts_at, v_end,
         p_party_size, 'pending', 'online', v_notes)
      returning id into v_id;

      return json_build_object(
        'id', v_id,
        'station_name', v_st.name,
        'starts_at', p_starts_at,
        'ends_at', v_end
      );
    exception when exclusion_violation then
      -- someone grabbed this station a moment ago; try the next one
      null;
    end;
  end loop;

  raise exception 'SLOT_TAKEN';
end $$;

revoke all on function public.request_booking(date, text, timestamptz, int, text, text, int, uuid, text) from public;
grant execute on function public.request_booking(date, text, timestamptz, int, text, text, int, uuid, text) to anon, authenticated;
grant execute on function public.get_availability(date) to anon, authenticated;
grant execute on function public.business_window(date) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: the staff board updates live across devices
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.bookings;
