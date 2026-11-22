// Runs the real migrations + seed in an in-process Postgres (PGlite) with stubbed
// Supabase auth/storage schemas, then checks double-booking, RLS, grants, the
// public booking RPC and the configurable rules (hours, closures, limits).
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync } from 'node:fs';

const root = new URL('../supabase/', import.meta.url).pathname;
const read = (f) => readFileSync(root + f, 'utf8');
const ist = (d) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
const day = (n) => ist(new Date(Date.now() + n * 86400e3));
const D = day(1), D1 = day(2), D3 = day(3), DP = day(-400);
const dow = (date) => new Date(date + 'T00:00:00Z').getUTCDay();
const sub = (x) => (typeof x === 'string' ? x.replaceAll('$D3', D3).replaceAll('$D1', D1).replaceAll('$DP', DP).replaceAll('$D', D) : x);

let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

async function makeDb() {
  const pg = new PGlite({ extensions: { btree_gist } });
  const db = { exec: (q) => pg.exec(sub(q)), query: (q, p) => pg.query(sub(q), p?.map(sub)) };
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant select, insert, update, delete on storage.objects to authenticated;
    create publication supabase_realtime;
    -- Newer Supabase projects: no automatic grants to the API roles
    alter default privileges revoke execute on functions from public;
    revoke all on schema public from public;
  `);
  return db;
}
async function expectErr(db, sql, params, pattern, m) {
  try { await db.query(sql, params); ok(false, m + ' (no error)'); }
  catch (e) { ok(new RegExp(pattern).test(e.message), m + ' -> ' + e.message); }
}
const RB = `select request_booking($1,$2,$3,$4,$5,$6,$7,$8,$9) r`;
const as = async (db, role, sub = '') => db.exec(`reset role; set request.jwt.claim.sub = '${sub}'; ${role ? `set role ${role};` : ''}`);
const OWNER = '00000000-0000-0000-0000-000000000001', STAFF = '00000000-0000-0000-0000-000000000002', RANDO = '00000000-0000-0000-0000-000000000003';
async function addUsers(db) {
  await db.exec(`insert into auth.users values ('${OWNER}','owner@x'),('${STAFF}','staff@x'),('${RANDO}','rando@x');
    insert into staff_profiles values ('${OWNER}','Owner','owner'),('${STAFF}','Staff','staff');`);
}

console.log('test day', D);

// ---------------------------------------------------------------------------
// 1. Fresh install: 0001 → 0002 → 0003 → seed
// ---------------------------------------------------------------------------
{
  const db = await makeDb();
  for (const f of ['migrations/0001_init.sql', 'migrations/0002_grants.sql', 'migrations/0003_config.sql', 'migrations/0004_games_first.sql', 'migrations/0005_rls_perf.sql', 'migrations/0006_payments.sql']) await db.exec(read(f));
  await db.exec(`update settings set open_time='11:00', close_time='02:00'`);
  await db.exec(read('seed.sql'));
  await db.exec(read('seed.sql')); // seed is safe to re-run
  const c = async (t) => (await db.query(`select count(*)::int c from ${t}`)).rows[0].c;
  ok((await c('station_types')) === 6 && (await c('stations')) === 7 && (await c('games')) === 17, 'seed is idempotent for worlds/stations/games');
  ok((await c('game_worlds')) > 20, 'seed links games to worlds');
  ok((await c('bookings')) === 6, 'seed bookings inserted once');
  await db.exec(`delete from bookings`);
  await addUsers(db);

  const w = (await db.query(`select * from business_window('$D')`)).rows[0];
  ok(w.opens_at.toISOString() === D + 'T05:30:00.000Z' && w.closes_at.toISOString() === D + 'T20:30:00.000Z', 'window wraps past midnight');

  const ps1 = (await db.query(`select id from stations where name='PS5 · Station 1'`)).rows[0].id;
  await db.query(`insert into bookings (station_id, customer_name, starts_at, ends_at) values ($1,'A','$DT12:00+05:30','$DT14:00+05:30')`, [ps1]);
  await expectErr(db, `insert into bookings (station_id, customer_name, starts_at, ends_at) values ($1,'B','$DT13:30+05:30','$DT15:00+05:30')`, [ps1], 'bookings_no_overlap', 'overlap rejected');
  await db.query(`insert into bookings (station_id, customer_name, starts_at, ends_at) values ($1,'C','$DT14:00+05:30','$DT15:00+05:30')`, [ps1]);
  ok(true, 'back-to-back allowed');

  // Public (anon)
  await as(db, 'anon');
  await expectErr(db, `select * from bookings`, [], 'permission denied', 'anon cannot read bookings');
  await expectErr(db, `update settings set cafe_name='x'`, [], 'permission denied', 'anon cannot edit settings');
  ok((await db.query(`select * from station_types`)).rows.length === 6, 'anon can read worlds');
  ok((await db.query(`select * from game_worlds`)).rows.length > 20, 'anon can read game links');
  ok((await db.query(`select * from closures`)).rows.length === 0, 'anon can read closures');
  ok((await db.query(`select * from get_availability('$D')`)).rows.length === 2, 'availability returns busy slots');

  const r1 = (await db.query(RB, ['$D', 'PS5', '$DT12:00+05:30', 60, 'Riya', '98765 43210', 2, null, 'bday'])).rows[0].r;
  ok(r1.station_name === 'PS5 · Station 2', 'request picks next free PS5: ' + r1.station_name);
  await expectErr(db, RB, ['$D', 'PS5', '$DT12:15+05:30', 60, 'Tom', '9876500002', 1, null, null], 'OUTSIDE_HOURS', 'misaligned start');
  await expectErr(db, RB, ['$DP', 'PS5', '$DPT12:00+05:30', 60, 'Tom', '9876500002', 1, null, null], 'IN_THE_PAST', 'past rejected');
  await expectErr(db, RB, ['$D', 'VR', '$DT16:00+05:30', 60, 'Tom', '9876500002', 3, null, null], 'SLOT_TAKEN', 'party bigger than VR capacity');
  await expectErr(db, RB, ['$D', 'Nope', '$DT16:00+05:30', 60, 'Tom', '9876500002', 1, null, null], 'SLOT_TAKEN', 'unknown world rejected');
  await expectErr(db, RB, ['$D', 'PS5', '$DT16:00+05:30', 60, 'Tom', '12345', 1, null, null], 'INVALID_PHONE', 'bad phone');
  const gameId = async (n) => (await db.query(`select id from games where name = $1`, [n])).rows[0].id;
  await expectErr(db, RB, ['$D', 'Xbox', '$DT16:00+05:30', 60, 'Tom', '9876500002', 1, await gameId('Beat Saber'), null], 'GAME_NOT_ON_WORLD', 'game must run on the chosen world');
  const gtaOk = (await db.query(RB, ['$D', 'Xbox', '$DT12:00+05:30', 60, 'Gta', '9876500004', 1, await gameId('Grand Theft Auto VI'), null])).rows[0].r;
  ok(gtaOk.station_name === 'Xbox · Station 1', 'game on a world it supports is accepted');
  await expectErr(db, `insert into game_worlds values ($1, 'PS5')`, [await gameId('Valorant')], 'permission denied', 'anon cannot link games');

  // Owner-configured rules
  await as(db, null);
  await db.exec(`update settings set min_booking_minutes = 90, max_pending_per_phone = 2`);
  await as(db, 'anon');
  await expectErr(db, RB, ['$D', 'PS5', '$DT16:00+05:30', 60, 'Tom', '9876500002', 1, null, null], 'INVALID_DURATION', 'below minimum duration');
  await db.query(RB, ['$D', 'Xbox', '$DT16:00+05:30', 90, 'Spam', '9000000000', 1, null, null]);
  await db.query(RB, ['$D', 'Xbox', '$DT18:00+05:30', 90, 'Spam', '9000000000', 1, null, null]);
  await expectErr(db, RB, ['$D', 'Xbox', '$DT20:00+05:30', 90, 'Spam', '9000000000', 1, null, null], 'TOO_MANY_PENDING', 'max pending per phone setting');

  await as(db, null);
  await db.exec(`update settings set weekly_hours = jsonb_build_object('${dow(D)}', jsonb_build_object('open','14:00','close','22:00'))`);
  await as(db, 'anon');
  await expectErr(db, RB, ['$D', 'PS5', '$DT12:00+05:30', 90, 'Tom', '9876500002', 1, null, null], 'OUTSIDE_HOURS', 'weekday-specific opening respected');
  const w2 = (await db.query(`select * from business_window('$D')`)).rows[0];
  ok(w2.opens_at.toISOString() === D + 'T08:30:00.000Z' && w2.closes_at.toISOString() === D + 'T16:30:00.000Z', 'weekday hours window');
  const w3 = (await db.query(`select * from business_window('$D1')`)).rows[0];
  ok(w3.closes_at.toISOString() === D1 + 'T20:30:00.000Z', 'other days keep default hours');

  await as(db, null);
  await db.exec(`update settings set weekly_hours = jsonb_build_object('${dow(D)}', jsonb_build_object('closed', true))`);
  await as(db, 'anon');
  await expectErr(db, RB, ['$D', 'PS5', '$DT16:00+05:30', 90, 'Tom', '9876500002', 1, null, null], 'CLOSED', 'closed weekday');
  ok((await db.query(`select * from get_availability('$D')`)).rows.length === 0, 'no availability on closed day');

  await as(db, null);
  await db.exec(`update settings set weekly_hours = null, advance_days = 1; insert into closures values ('$D1', 'Diwali')`);
  await as(db, 'anon');
  await expectErr(db, RB, ['$D1', 'PS5', '$D1T16:00+05:30', 90, 'Tom', '9876500002', 1, null, null], 'CLOSED', 'closure date');
  await as(db, null);
  await db.exec(`delete from closures`);
  await as(db, 'anon');
  await expectErr(db, RB, ['$D3', 'PS5', '$D3T12:00+05:30', 90, 'Tom', '9876500002', 1, null, null], 'TOO_FAR_AHEAD', 'advance days limit');

  // Staff vs owner
  await as(db, 'authenticated', RANDO);
  ok((await db.query(`select * from bookings`)).rows.length === 0, 'non-staff user sees no bookings');
  await as(db, 'authenticated', STAFF);
  ok((await db.query(`select * from bookings`)).rows.length > 0, 'staff can read bookings');
  ok((await db.query(`update station_types set hourly_rate = 1 returning name`)).rows.length === 0, 'staff cannot edit worlds');
  await expectErr(db, `insert into closures values ('$D', 'x')`, [], 'row-level security', 'staff cannot add closures');
  await as(db, 'authenticated', OWNER);
  await db.exec(`update station_types set name = 'PlayStation 5' where name = 'PS5'`);
  ok((await db.query(`select count(*)::int c from stations where type = 'PlayStation 5'`)).rows[0].c === 3, 'renaming a world updates its stations');
  ok((await db.query(`select count(*)::int c from game_worlds where world = 'PlayStation 5'`)).rows[0].c >= 10, 'renaming a world updates its game links');
  await db.exec(`insert into game_worlds select id, 'VR' from games where name = 'Valorant'`);
  ok(true, 'owner can link games to worlds');
  await expectErr(db, `delete from station_types where name = 'Xbox'`, [], 'foreign key', 'cannot delete a world that has stations');
  await expectErr(db, `update settings set color_primary = 'red;}'`, [], 'check constraint', 'colour must be a hex value');
  await expectErr(db, `update settings set font_display = 'x'');}body{'`, [], 'check constraint', 'font name is validated');
  await db.exec(`insert into storage.objects (bucket_id, name) values ('media', 'logo.png')`);
  ok(true, 'owner can upload media');
  await as(db, 'authenticated', STAFF);
  await expectErr(db, `insert into storage.objects (bucket_id, name) values ('media', 'x.png')`, [], 'row-level security', 'staff cannot upload media');
  await as(db, null);
}

// ---------------------------------------------------------------------------
// 1b. Payments (0006): ledger keeps paid_amount in sync, staff record, owner deletes
// ---------------------------------------------------------------------------
{
  const db = await makeDb();
  for (const f of ['migrations/0001_init.sql', 'migrations/0002_grants.sql', 'migrations/0003_config.sql', 'migrations/0004_games_first.sql', 'migrations/0005_rls_perf.sql']) await db.exec(read(f));
  await db.exec(read('seed.sql'));
  await db.exec(read('migrations/0006_payments.sql'));
  await db.exec(read('migrations/0006_payments.sql')); // safe to re-run
  await addUsers(db);
  const paidOf = async (id) => Number((await db.query(`select paid_amount from bookings where id = $1`, [id])).rows[0].paid_amount);
  const b = (await db.query(`select id from bookings where customer_name = 'Rohan'`)).rows[0].id;
  ok((await paidOf(b)) === 0, 'existing bookings start unpaid');

  await as(db, 'authenticated', STAFF);
  await db.query(`insert into booking_payments (booking_id, amount, method, note, created_by) values ($1, 500, 'upi', 'Advance', $2)`, [b, STAFF]);
  ok((await paidOf(b)) === 500, 'advance updates paid_amount');
  await db.query(`insert into booking_payments (booking_id, amount, method, created_by) values ($1, 700, 'cash', $2)`, [b, STAFF]);
  ok((await paidOf(b)) === 1200, 'balance adds up');
  await db.query(`insert into booking_payments (booking_id, amount, kind, method, created_by) values ($1, 200, 'refund', 'cash', $2)`, [b, STAFF]);
  ok((await paidOf(b)) === 1000, 'refund subtracts');
  await db.query(`update bookings set paid_amount = 99999 where id = $1`, [b]);
  ok((await paidOf(b)) === 1000, 'paid_amount cannot be set by hand');
  await db.query(`update bookings set price = 900, notes = 'discount' where id = $1`, [b]);
  ok(Number((await db.query(`select price from bookings where id = $1`, [b])).rows[0].price) === 900, 'staff can set a custom price');
  await expectErr(db, `update bookings set price = -1 where id = $1`, [b], 'check constraint', 'negative price rejected');
  await expectErr(db, `insert into booking_payments (booking_id, amount, created_by) values ($1, 0, $2)`, [b, STAFF], 'check constraint', 'zero payment rejected');
  await expectErr(db, `insert into booking_payments (booking_id, amount, created_by) values ($1, 10, $2)`, [b, OWNER], 'row-level security', 'staff cannot record a payment as someone else');
  ok((await db.query(`delete from booking_payments where booking_id = $1 returning id`, [b])).rows.length === 0, 'staff cannot delete payments');
  ok((await db.query(`update booking_payments set amount = 1 where booking_id = $1 returning id`, [b]).catch(() => ({ rows: [] }))).rows.length === 0, 'payments cannot be edited');
  await as(db, 'authenticated', RANDO);
  ok((await db.query(`select * from booking_payments`)).rows.length === 0, 'non-staff see no payments');
  await as(db, 'anon');
  await expectErr(db, `select * from booking_payments`, [], 'permission denied', 'anon cannot read payments');
  await as(db, 'authenticated', OWNER);
  const refund = (await db.query(`select id from booking_payments where kind = 'refund'`)).rows[0].id;
  await db.query(`delete from booking_payments where id = $1`, [refund]);
  ok((await paidOf(b)) === 1200, 'owner deleting an entry recomputes paid_amount');
  await db.query(`delete from bookings where id = $1`, [b]);
  ok((await db.query(`select count(*)::int c from booking_payments`)).rows[0].c === 0, 'deleting a booking removes its payments');
  await as(db, 'anon');
  const r = (await db.query(RB, ['$D', 'PS5', '$DT12:00+05:30', 60, 'Riya', '98765 43210', 2, null, null])).rows[0].r;
  await as(db, null);
  ok((await db.query(`select paid_amount::int p from bookings where id = $1`, [r.id])).rows[0]?.p === 0, 'online requests start unpaid');
}

// ---------------------------------------------------------------------------
// 2. Upgrade path (what a live database goes through): 0001 → 0002 → v1 data → 0003
// ---------------------------------------------------------------------------
{
  const db = await makeDb();
  for (const f of ['migrations/0001_init.sql', 'migrations/0002_grants.sql']) await db.exec(read(f));
  await db.exec(`
    insert into stations (name, type, hourly_rate, max_players, sort_order) values
      ('PS5 1','PS5',150,4,10), ('PS5 2','PS5',150,4,20), ('VR Zone','VR',300,1,30), ('Lounge','Projector',600,10,40), ('PS5 Pro','PS5',200,4,50);
    insert into games (name, station_type) values ('FC', null), ('Tekken', 'PS5'), ('Old', 'Wii');
    insert into bookings (station_id, customer_name, starts_at, ends_at) select id, 'Legacy', now() + interval '1 day', now() + interval '25 hours' from stations limit 1;
  `);
  await db.exec(read('migrations/0003_config.sql'));
  await db.exec(read('migrations/0004_games_first.sql'));
  await db.exec(read('migrations/0005_rls_perf.sql'));
  await db.exec(read('migrations/0006_payments.sql'));
  const links = (await db.query(`select g.name, gw.world from game_worlds gw join games g on g.id = gw.game_id`)).rows;
  ok(links.length === 1 && links[0].name === 'Tekken' && links[0].world === 'PS5', '0004 moves game worlds into links: ' + JSON.stringify(links));
  const types = (await db.query(`select name, hourly_rate::int r, icon, color from station_types order by sort_order`)).rows;
  ok(types.length === 3 && types[0].name === 'PS5' && types[0].r === 150, 'existing types become worlds: ' + JSON.stringify(types.map((t) => t.name)));
  ok(types.find((t) => t.name === 'VR').icon === 'glasses' && types.find((t) => t.name === 'Projector').icon === 'projector', 'icons guessed from names');
  ok(new Set(types.map((t) => t.color)).size === 3, 'each world gets its own colour');
  const st = (await db.query(`select name, hourly_rate from stations order by sort_order`)).rows;
  ok(st[0].hourly_rate === null && st[4].hourly_rate !== null, 'matching prices inherit, custom price kept');
  ok((await db.query(`select count(*)::int c from games where name='Old'`)).rows[0].c === 1, 'games pointing at unknown worlds are kept, unlinked');
  ok((await db.query(`select count(*)::int c from bookings`)).rows[0].c === 1, 'existing bookings untouched');
  await db.exec(read('seed.sql'));
  ok((await db.query(`select tagline from station_types where name='PS5'`)).rows[0].tagline.length > 0, 'seed polishes existing worlds');
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
