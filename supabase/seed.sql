-- Demo data for showing the app to the cafe owner. Run after all migrations.
-- Safe to re-run: it adds what's missing and refreshes the demo looks.

-- Worlds: where you play
insert into public.station_types (name, tagline, description, icon, color, hourly_rate, pricing, sort_order, active) values
  ('PS5',       'Couch co-op and FIFA nights',  'DualSense controllers, big 4K screens and the latest releases.',             'gamepad',      '#3D7BFF', 150, 'per_station', 10, true),
  ('Xbox',      'Game Pass, all of it',          'Series X with hundreds of Game Pass titles ready to go.',                   'joystick',     '#21C46B', 150, 'per_station', 20, true),
  ('PC',        'High-refresh esports rigs',     'Coming soon: gaming PCs for Valorant, CS2 and more.',                       'monitor',      '#16C7D9', 100, 'per_station', 30, false),
  ('VR',        'Step inside the game',          'Meta Quest with a cleared play space and a guide on hand.',                 'glasses',      '#FF4F9A', 300, 'per_player',  40, true),
  ('RC Arena',  'Real machines, real dirt',      'A mini construction site with a remote-control JCB earth mover and dumper.', 'construction', '#F5B800', 200, 'per_station', 50, true),
  ('Projector', 'Big screen for the squad',      'A private lounge with a 120" screen: matches, movies or co-op.',            'projector',    '#FF8A3D', 600, 'per_station', 60, true)
on conflict (name) do update set
  tagline = excluded.tagline, description = excluded.description, icon = excluded.icon,
  color = excluded.color, hourly_rate = excluded.hourly_rate, pricing = excluded.pricing,
  sort_order = excluded.sort_order;

-- Stations: the actual seats, consoles and rigs
insert into public.stations (name, type, hourly_rate, max_players, sort_order)
select v.* from (values
  ('PS5 · Station 1',      'PS5',       null::numeric, 4, 10),
  ('PS5 · Station 2',      'PS5',       null, 4, 20),
  ('PS5 · Station 3',      'PS5',       null, 4, 30),
  ('Xbox · Station 1',     'Xbox',      null, 4, 40),
  ('VR Zone',              'VR',        null, 1, 50),
  ('RC Construction Site', 'RC Arena',  null, 2, 60),
  ('Projector Lounge',     'Projector', null, 10, 70)
) as v(name, type, hourly_rate, max_players, sort_order)
where not exists (select 1 from public.stations s where s.name = v.name);

-- Games and experiences: what people come to play
-- (rename games from the earlier demo so nothing is duplicated)
update public.games set name = 'Grand Theft Auto V'
where name = 'GTA V' and not exists (select 1 from public.games where name = 'Grand Theft Auto V');
update public.games set name = 'Forza Horizon 5'
where name = 'Forza Horizon' and not exists (select 1 from public.games where name = 'Forza Horizon 5');

insert into public.games (name, kind, blurb, featured, sort_order)
select v.* from (values
  ('Grand Theft Auto VI',          'game',       'Vice City is back.',                                    true,  10),
  ('EA Sports FC',                 'game',       'Bring your squad and settle it on the pitch.',         true,  20),
  ('RC JCB & Dumper',              'experience', 'Dig, load and haul with real remote-control machines.', true,  30),
  ('Grand Theft Auto V',           'game',       'Los Santos, with friends.',                             false, 40),
  ('Tekken 8',                     'game',       'Fight night, one controller each.',                     false, 50),
  ('Marvel''s Spider-Man 2',       'game',       'Swing through New York.',                               false, 60),
  ('God of War Ragnarök',          'game',       'Kratos and Atreus, end of the world.',                  false, 70),
  ('Call of Duty',                 'game',       'Squad up for multiplayer.',                             false, 80),
  ('Mortal Kombat 1',              'game',       'Finish him.',                                           false, 90),
  ('WWE 2K',                       'game',       'Tag team mayhem.',                                      false, 100),
  ('Cricket 24',                   'game',       'Your own IPL final.',                                   false, 110),
  ('Forza Horizon 5',              'game',       'Open-road racing across Mexico.',                       false, 120),
  ('It Takes Two',                 'game',       'The best couch co-op there is.',                        false, 130),
  ('Beat Saber',                   'game',       'Slash to the beat in VR.',                              false, 140),
  ('Valorant',                     'game',       'Tactical 5v5 on the PC rigs.',                          false, 150),
  ('Counter-Strike 2',             'game',       'Classic competitive CS.',                               false, 160),
  ('Movie / Match screening',      'experience', 'Your match or movie on the big screen.',                false, 170)
) as v(name, kind, blurb, featured, sort_order)
where not exists (select 1 from public.games g where g.name = v.name);

-- Refresh demo details on games that already existed
update public.games g set kind = v.kind, blurb = v.blurb, featured = v.featured, sort_order = v.sort_order
from (values
  ('EA Sports FC', 'game', 'Bring your squad and settle it on the pitch.', true, 20),
  ('Tekken 8', 'game', 'Fight night, one controller each.', false, 50),
  ('Call of Duty', 'game', 'Squad up for multiplayer.', false, 80),
  ('Mortal Kombat 1', 'game', 'Finish him.', false, 90),
  ('Beat Saber', 'game', 'Slash to the beat in VR.', false, 140),
  ('Movie / Match screening', 'experience', 'Your match or movie on the big screen.', false, 170)
) as v(name, kind, blurb, featured, sort_order)
where g.name = v.name;

-- Which worlds each game runs on
insert into public.game_worlds (game_id, world)
select g.id, v.world from (values
  ('Grand Theft Auto VI', 'PS5'), ('Grand Theft Auto VI', 'Xbox'),
  ('EA Sports FC', 'PS5'), ('EA Sports FC', 'Xbox'), ('EA Sports FC', 'PC'),
  ('RC JCB & Dumper', 'RC Arena'),
  ('Grand Theft Auto V', 'PS5'), ('Grand Theft Auto V', 'Xbox'), ('Grand Theft Auto V', 'PC'),
  ('Tekken 8', 'PS5'), ('Tekken 8', 'Xbox'), ('Tekken 8', 'PC'),
  ('Marvel''s Spider-Man 2', 'PS5'),
  ('God of War Ragnarök', 'PS5'),
  ('Call of Duty', 'PS5'), ('Call of Duty', 'Xbox'), ('Call of Duty', 'PC'),
  ('Mortal Kombat 1', 'PS5'), ('Mortal Kombat 1', 'Xbox'),
  ('WWE 2K', 'PS5'), ('WWE 2K', 'Xbox'),
  ('Cricket 24', 'PS5'), ('Cricket 24', 'Xbox'), ('Cricket 24', 'PC'),
  ('Forza Horizon 5', 'Xbox'), ('Forza Horizon 5', 'PC'),
  ('It Takes Two', 'PS5'), ('It Takes Two', 'Xbox'),
  ('Beat Saber', 'VR'),
  ('Valorant', 'PC'),
  ('Counter-Strike 2', 'PC'),
  ('Movie / Match screening', 'Projector')
) as v(game, world)
join public.games g on g.name = v.game
join public.station_types t on t.name = v.world
on conflict do nothing;

-- A few bookings on today's board so the demo doesn't look empty.
-- Safe to re-run. To refresh on demo day: delete from bookings where phone like '9198000000%'; then run this block.
with today as (select (now() at time zone 'Asia/Kolkata')::date as d)
insert into public.bookings
  (station_id, customer_name, phone, game_id, starts_at, ends_at, party_size, status, source)
select st.id, v.name, v.phone,
       (select id from public.games g where g.name = v.game limit 1),
       (today.d + v.start_t) at time zone 'Asia/Kolkata',
       (today.d + v.start_t + v.dur) at time zone 'Asia/Kolkata',
       v.party, v.status::public.booking_status, v.source::public.booking_source
from today,
     (values
       ('PS5 · Station 1',      'Rohan',  '919800000001', 'EA Sports FC',            time '16:00', interval '2 hours',    2, 'confirmed', 'staff'),
       ('PS5 · Station 2',      'Aditi',  '919800000002', 'Tekken 8',                time '17:30', interval '1 hour',     2, 'confirmed', 'staff'),
       ('PS5 · Station 3',      'Kunal',  '919800000003', 'Grand Theft Auto VI',     time '19:00', interval '90 minutes', 1, 'pending',   'online'),
       ('Xbox · Station 1',     'Sneha',  '919800000004', 'Forza Horizon 5',         time '15:00', interval '1 hour',     1, 'confirmed', 'staff'),
       ('RC Construction Site', 'Aarav',  '919800000006', 'RC JCB & Dumper',         time '18:00', interval '1 hour',     2, 'confirmed', 'staff'),
       ('Projector Lounge',     'Vikram', '919800000005', 'Movie / Match screening', time '20:00', interval '3 hours',    8, 'pending',   'online')
     ) as v(station, name, phone, game, start_t, dur, party, status, source)
join public.stations st on st.name = v.station
where not exists (
  select 1 from public.bookings b
  where b.station_id = st.id and b.phone = v.phone
    and b.starts_at = (today.d + v.start_t) at time zone 'Asia/Kolkata'
);
