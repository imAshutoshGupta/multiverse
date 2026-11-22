-- Owner-configurable everything: branding, contact, weekly hours, closures,
-- booking rules, WhatsApp templates, "worlds" (station types) and media uploads.
-- Safe to run on a database that already has 0001 + 0002 (and the demo seed).

-- ---------------------------------------------------------------------------
-- Settings: branding, contact, rules, templates
-- ---------------------------------------------------------------------------
alter table public.settings
  add column tagline text not null default 'You''ve seen the name.
You haven''t seen the world.' check (length(tagline) <= 200),
  add column about text not null default 'PS5, Xbox, VR and a projector lounge. Bring your squad.' check (length(about) <= 400),
  add column phone text check (phone is null or phone ~ '^[0-9]{10,15}$'),
  add column instagram text not null default 'multiverse_cafe' check (instagram ~ '^[A-Za-z0-9._]{0,30}$'),
  add column maps_url text check (maps_url is null or maps_url ~ '^https://'),
  add column logo_url text check (logo_url is null or logo_url ~ '^https://'),
  add column hero_image_url text check (hero_image_url is null or hero_image_url ~ '^https://'),
  add column color_primary text not null default '#7C5CFF' check (color_primary ~ '^#[0-9A-Fa-f]{6}$'),
  add column color_accent text not null default '#FFC23D' check (color_accent ~ '^#[0-9A-Fa-f]{6}$'),
  add column color_background text not null default '#0D0E2B' check (color_background ~ '^#[0-9A-Fa-f]{6}$'),
  -- Google Fonts family names (validated so they are safe to put in CSS/URLs)
  add column font_display text not null default 'Unbounded' check (font_display ~ '^[A-Za-z0-9 ]{2,40}$'),
  add column font_body text not null default 'Onest' check (font_body ~ '^[A-Za-z0-9 ]{2,40}$'),
  add column announcement text check (announcement is null or length(announcement) <= 200),
  add column house_rules text not null default 'Arrive 5 minutes before your slot
Slots run on time, so late arrivals still end on schedule
Food and drinks stay off the consoles' check (length(house_rules) <= 2000),
  -- {"0": {"open": "11:00", "close": "23:00", "closed": false}, ... "6": {...}}  (0 = Sunday)
  add column weekly_hours jsonb,
  add column min_booking_minutes int not null default 60 check (min_booking_minutes between 15 and 720),
  add column advance_days int not null default 14 check (advance_days between 1 and 90),
  add column lead_minutes int not null default 0 check (lead_minutes between 0 and 1440),
  add column max_pending_per_phone int not null default 3 check (max_pending_per_phone between 1 and 20),
  add column msg_confirm text check (msg_confirm is null or length(msg_confirm) <= 1000),
  add column msg_decline text check (msg_decline is null or length(msg_decline) <= 1000),
  add column msg_reminder text check (msg_reminder is null or length(msg_reminder) <= 1000);

-- ---------------------------------------------------------------------------
-- Worlds (station types): how each kind of station looks and is priced
-- ---------------------------------------------------------------------------
create table public.station_types (
  name         text primary key check (length(trim(name)) between 1 and 40),
  tagline      text not null default '' check (length(tagline) <= 80),
  description  text not null default '' check (length(description) <= 400),
  icon         text not null default 'gamepad' check (icon ~ '^[a-z0-9-]{1,30}$'),
  color        text not null default '#7C5CFF' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  image_url    text check (image_url is null or image_url ~ '^https://'),
  hourly_rate  numeric(10, 2) not null default 0 check (hourly_rate >= 0),
  pricing      text not null default 'per_station' check (pricing in ('per_station', 'per_player')),
  sort_order   int not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Create a world for every type already in use, with sensible looks
insert into public.station_types (name, hourly_rate, sort_order, color, icon)
select t.type, t.rate, t.ord,
       (array['#3D7BFF', '#21C46B', '#FF4F9A', '#FF8A3D', '#16C7D9', '#B36BFF'])[1 + ((row_number() over (order by t.ord)) - 1) % 6],
       case
         when t.type ilike '%vr%' or t.type ilike '%virtual%' then 'glasses'
         when t.type ilike '%projector%' or t.type ilike '%lounge%' or t.type ilike '%movie%' then 'projector'
         when t.type ilike '%pc%' or t.type ilike '%computer%' then 'monitor'
         when t.type ilike '%board%' then 'dices'
         when t.type ilike '%sim%' or t.type ilike '%racing%' then 'car'
         else 'gamepad'
       end
from (select type, min(hourly_rate) as rate, min(sort_order) as ord from public.stations group by type) t
on conflict (name) do nothing;

alter table public.stations
  add constraint stations_type_fk foreign key (type)
  references public.station_types (name) on update cascade on delete restrict;

-- Stations now inherit the world's price unless they set their own
alter table public.stations alter column hourly_rate drop not null;
alter table public.stations alter column hourly_rate drop default;
update public.stations s set hourly_rate = null
from public.station_types t
where t.name = s.type and s.hourly_rate = t.hourly_rate;

-- Games: cover art, ordering, and a link to their world
update public.games set station_type = null
where station_type is not null and station_type not in (select name from public.station_types);
alter table public.games
  add column cover_url text check (cover_url is null or cover_url ~ '^https://'),
  add column sort_order int not null default 0,
  add constraint games_type_fk foreign key (station_type)
    references public.station_types (name) on update cascade on delete set null;

-- ---------------------------------------------------------------------------
-- Closures: holidays and other days the cafe is shut
-- ---------------------------------------------------------------------------
create table public.closures (
  date        date primary key,
  reason      text not null default '' check (length(reason) <= 80),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS + grants for the new tables
-- ---------------------------------------------------------------------------
alter table public.station_types enable row level security;
alter table public.closures enable row level security;

create policy station_types_read on public.station_types for select to anon, authenticated using (true);
create policy station_types_owner_insert on public.station_types for insert to authenticated with check (public.is_owner());
create policy station_types_owner_update on public.station_types for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy station_types_owner_delete on public.station_types for delete to authenticated using (public.is_owner());

create policy closures_read on public.closures for select to anon, authenticated using (true);
create policy closures_owner_insert on public.closures for insert to authenticated with check (public.is_owner());
create policy closures_owner_update on public.closures for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy closures_owner_delete on public.closures for delete to authenticated using (public.is_owner());

grant select on public.station_types, public.closures to anon;
grant select, insert, update, delete on public.station_types, public.closures to authenticated;

-- ---------------------------------------------------------------------------
-- Opening hours now respect per-weekday hours and closures.
-- Returns NULLs when the cafe is closed that day.
-- ---------------------------------------------------------------------------
create or replace function public.business_window(p_date date, out opens_at timestamptz, out closes_at timestamptz)
language sql stable security definer set search_path = public as $$
  with s as (
    select st.*, st.weekly_hours -> (extract(dow from p_date)::int)::text as d
    from public.settings st where st.id = 1
  ), h as (
    select
      coalesce((d ->> 'open')::time, open_time) as o,
      coalesce((d ->> 'close')::time, close_time) as c,
      coalesce((d ->> 'closed')::boolean, false)
        or exists (select 1 from public.closures cl where cl.date = p_date) as shut
    from s
  )
  select
    case when shut then null else (p_date + o) at time zone 'Asia/Kolkata' end,
    case when shut then null else
      (p_date + c + case when c <= o then interval '1 day' else interval '0' end) at time zone 'Asia/Kolkata'
    end
  from h;
$$;

create or replace function public.request_booking(
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

  if not exists (select 1 from public.station_types t where t.name = p_station_type and t.active) then
    raise exception 'SLOT_TAKEN';
  end if;

  select * into w from public.business_window(p_date);
  if w.opens_at is null then
    raise exception 'CLOSED';
  end if;
  if p_minutes is null or p_minutes < greatest(s.slot_minutes, s.min_booking_minutes)
     or p_minutes > s.max_booking_minutes or p_minutes % s.slot_minutes <> 0 then
    raise exception 'INVALID_DURATION';
  end if;
  v_end := p_starts_at + make_interval(mins => p_minutes);
  if p_starts_at < w.opens_at or v_end > w.closes_at
     or (extract(epoch from (p_starts_at - w.opens_at))::bigint % (s.slot_minutes * 60)) <> 0 then
    raise exception 'OUTSIDE_HOURS';
  end if;
  if p_starts_at < now() + make_interval(mins => s.lead_minutes) - interval '5 minutes' then
    raise exception 'IN_THE_PAST';
  end if;
  if p_starts_at > now() + make_interval(days => s.advance_days + 1) then
    raise exception 'TOO_FAR_AHEAD';
  end if;

  if p_game_id is not null and not exists (
    select 1 from public.games g where g.id = p_game_id and g.active
  ) then
    raise exception 'INVALID_GAME';
  end if;

  if (select count(*) from public.bookings b
      where b.phone = v_phone and b.source = 'online' and b.status = 'pending') >= s.max_pending_per_phone then
    raise exception 'TOO_MANY_PENDING';
  end if;
  if (select count(*) from public.bookings b
      where b.source = 'online' and b.created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'RATE_LIMITED';
  end if;

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

      return json_build_object('id', v_id, 'station_name', v_st.name, 'starts_at', p_starts_at, 'ends_at', v_end);
    exception when exclusion_violation then
      null;
    end;
  end loop;

  raise exception 'SLOT_TAKEN';
end $$;

-- ---------------------------------------------------------------------------
-- Media uploads (logo, hero image, world images, game covers)
-- Public to read; only the owner can upload/replace/delete.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy media_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_owner());
create policy media_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.is_owner());
create policy media_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_owner());
