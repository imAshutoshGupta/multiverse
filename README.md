# The Multiverse: Slot Booking

Replaces the cafe's Excel pre-booking sheet with:

- **Staff board** (`/staff`): live grid of stations × time slots. Tap an empty slot to book; tap a booking to edit, confirm, mark arrived or no-show, cancel, or send a WhatsApp confirmation or reminder. Double-booking is impossible because the database enforces it.
- **Requests inbox** (`/staff/requests`): online requests arrive instantly. One tap confirms the request and opens WhatsApp with a ready-made message.
- **Bookings** (`/staff/bookings`): search by name or phone, filter by date or status, and **download for Excel** (CSV).
- **Settings** (`/staff/settings`, owner only): configure almost everything without code.
  - **Branding:** logo, hero photo, headline, colours and fonts (any Google Font), with a live preview.
  - **Worlds:** each kind of station (PS5, PC, VR, sim…) with its own icon, colour, photo, price, and per-station or per-player pricing.
  - **Stations:** seats, consoles and rooms. Bulk-add, set custom prices, reorder, or switch them off.
  - **Games:** cover art, which world each runs on.
  - **Hours and holidays:** per-weekday hours, after-midnight closing, closed dates.
  - **Booking rules:** slot size, shortest and longest booking, days ahead, minimum notice, spam limits, announcement bar, house rules.
  - **Contact:** WhatsApp, phone, Instagram, Maps link.
  - **WhatsApp messages:** editable templates with placeholders and a live preview.
  - **Staff:** add and remove logins, roles, password resets.
- **Customer page** (`/book`): public link for the Instagram bio. Customers start from **what they want to play**: a searchable poster wall of games and experiences (like the RC JCB and dumper), filterable by PS5 / Xbox / VR… Tapping a poster expands it into a full-screen booking flow; if the game runs on several worlds they pick where to play it. People who don't mind what they play can still just book a station. The slot is held as *pending* until staff confirm it.

Stack: Next.js 16 · Supabase (Postgres, Auth, Realtime) · Tailwind 4. Runs on free tiers (Vercel + Supabase).

## Setup (about 10 minutes)

1. **Create a Supabase project** at <https://supabase.com> (free). Pick the Mumbai region (`ap-south-1`).
2. **Create the database:** open *SQL Editor* and run, each in its own query tab and in this order: `supabase/migrations/0001_init.sql`, `0002_grants.sql`, `0003_config.sql`, then `0004_games_first.sql`. For the demo, also run `supabase/seed.sql` (sample stations, games and today's bookings). If Supabase warns about RLS, choose "Run and enable RLS". The script turns RLS on itself, so either choice is fine.
3. **Lock down sign-ups:** *Authentication → Sign In / Providers*: turn **off** "Allow new users to sign up". Staff accounts are created by you, not by the public.
4. **Create the owner login:** *Authentication → Users → Add user* (email + password, auto-confirm). Then in the SQL Editor:
   ```sql
   insert into staff_profiles (user_id, display_name, role)
   select id, 'Owner', 'owner' from auth.users where email = 'owner@example.com';
   ```
   Add other staff the same way with `'staff'` as the role. Staff can manage bookings; only the owner can change settings or delete bookings.
5. **Connect the app:** `cp .env.example .env.local`, then fill in the project URL (`https://<id>.supabase.co`, not the `postgresql://` connection string) and the **publishable** key (*Project Settings → API Keys*). The older `anon` key also works as `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   Optional: add `RAWG_API_KEY` (free at rawg.io/apidocs) so the owner can find game posters from **Settings → Games**. The site credits RAWG automatically.
   Optional: add `SUPABASE_SECRET_KEY` (a *secret* key, server-only) so the owner can add and remove staff logins from **Settings → Staff**.
6. Run it:
   ```bash
   npm install
   npm run dev        # http://localhost:3000/book  and  /staff
   ```

## Deploy

Push to GitHub, import the repo in Vercel and add the two env vars. Then:

- Put `https://<your-app>.vercel.app/book` in the Instagram bio and on the WhatsApp Business profile.
- On the counter tablet or phone, open `/staff` and choose **Add to Home Screen**. It runs full-screen like an app.

## Tests

```bash
npm test
```

- `tests/logic.test.ts`: slot and time maths (IST, after-midnight closing), availability, phone normalisation.
- `tests/db.test.mjs`: runs the real migration and seed in an in-process Postgres (PGlite). It checks the no-overlap constraint, RLS (customers can't read phone numbers; staff can't edit stations), and the public `request_booking` rules (opening hours, past or misaligned slots, capacity, spam limits).

## How it works

| Concern | Where |
| --- | --- |
| Double-booking prevention | `bookings_no_overlap` exclusion constraint (pending, confirmed and playing bookings block a station) |
| Customer privacy | RLS: only staff can read `bookings`. The public page sees busy times via `get_availability()`, which returns no names or phones |
| Online requests | `request_booking()`: validates input, picks the first free station of the chosen type, caps 3 pending requests per phone, and adds a honeypot and an IP limiter in `app/book/actions.ts` |
| Live updates | Supabase Realtime on `bookings` (`components/staff/useBookings.ts`) |
| Timezone | Everything is Asia/Kolkata (`lib/time.ts`, `business_window()` in SQL) |
| WhatsApp | Free `wa.me` deep links with pre-filled text (`lib/messages.ts`). No API costs |

## Ideas for v2 (upsells)

- Walk-in timer and billing at the counter (start/stop, extend, print or WhatsApp the bill)
- Daily and monthly revenue dashboard, busiest hours, top customers
- Automatic WhatsApp reminders through the WhatsApp Business API
- Loyalty points or "10th hour free"; tournaments; advance payment through UPI
