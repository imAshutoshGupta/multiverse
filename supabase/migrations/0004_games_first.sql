-- Games-first booking: customers pick a game (or a real-world experience like the
-- RC construction site) and then where to play it. A game can run on several worlds.

create table public.game_worlds (
  game_id  uuid not null references public.games (id) on delete cascade,
  world    text not null references public.station_types (name) on update cascade on delete cascade,
  primary key (game_id, world)
);

insert into public.game_worlds (game_id, world)
select id, station_type from public.games where station_type is not null
on conflict do nothing;

alter table public.games drop constraint games_type_fk;
alter table public.games drop column station_type;

alter table public.games
  -- 'experience' = not a video game, e.g. the RC JCB and dumper site
  add column kind text not null default 'game' check (kind in ('game', 'experience')),
  add column blurb text not null default '' check (length(blurb) <= 160),
  add column featured boolean not null default false,
  -- where the poster came from, for attribution ("rawg" = RAWG.io)
  add column image_source text check (image_source is null or image_source in ('upload', 'rawg')),
  add column rawg_id int;

alter table public.game_worlds enable row level security;
create policy game_worlds_read on public.game_worlds for select to anon, authenticated using (true);
create policy game_worlds_owner_insert on public.game_worlds for insert to authenticated with check (public.is_owner());
create policy game_worlds_owner_delete on public.game_worlds for delete to authenticated using (public.is_owner());
grant select on public.game_worlds to anon;
grant select, insert, delete on public.game_worlds to authenticated;

-- Booking requests: if a game is chosen, it must run on the chosen world.
-- (A game with no world links runs everywhere.)
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

  if p_game_id is not null then
    if not exists (select 1 from public.games g where g.id = p_game_id and g.active) then
      raise exception 'INVALID_GAME';
    end if;
    if exists (select 1 from public.game_worlds gw where gw.game_id = p_game_id)
       and not exists (select 1 from public.game_worlds gw where gw.game_id = p_game_id and gw.world = p_station_type) then
      raise exception 'GAME_NOT_ON_WORLD';
    end if;
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
