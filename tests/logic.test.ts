import { test } from "node:test";
import assert from "node:assert/strict";
import { businessWindow, daySlots, businessDateOf, istDate, fmtTime, addDays } from "../lib/time";
import { availableStarts, stationFree, estimatePrice } from "../lib/availability";
import { normalizePhone, displayPhone } from "../lib/phone";

const S = { open_time: "11:00:00", close_time: "23:00:00", slot_minutes: 30 };
const late = { open_time: "11:00:00", close_time: "02:00:00", slot_minutes: 30 };

test("business window and slots", () => {
  const w = businessWindow("2026-11-23", S);
  assert.equal(w.opensAt.toISOString(), "2026-11-23T05:30:00.000Z");
  assert.equal(w.closesAt.toISOString(), "2026-11-23T17:30:00.000Z");
  assert.equal(daySlots("2026-11-23", S).length, 24);
  assert.equal(daySlots("2026-11-23", late).length, 30);
  assert.equal(businessWindow("2026-11-23", late).closesAt.toISOString(), "2026-11-23T20:30:00.000Z");
});

test("after-midnight booking belongs to previous business day", () => {
  assert.equal(businessDateOf("2026-11-23T19:30:00Z", late), "2026-11-23"); // 01:00 IST on 24th
  assert.equal(businessDateOf("2026-11-23T19:30:00Z", S), "2026-11-24");
  assert.equal(businessDateOf("2026-11-23T10:00:00Z", late), "2026-11-23");
});

test("istDate around IST midnight", () => {
  assert.equal(istDate(new Date("2026-11-22T18:29:00Z")), "2026-11-22");
  assert.equal(istDate(new Date("2026-11-22T18:31:00Z")), "2026-11-23");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.match(fmtTime("2026-11-23T05:30:00Z"), /^11:00 am$/);
});

test("availability counts free stations and respects closing", () => {
  const stations = [{ id: "a" }, { id: "b" }] as unknown as Parameters<typeof availableStarts>[0]["stations"];
  const busy = [{ station_id: "a", starts_at: "2026-11-23T06:30:00Z", ends_at: "2026-11-23T08:30:00Z" }];
  const day = "2026-11-23";
  const { closesAt } = businessWindow(day, S);
  const r = availableStarts({ slots: daySlots(day, S), closesAt, durationMin: 60, stations, busy, now: new Date("2026-11-23T00:00:00Z") });
  const at = (iso: string) => r.find((x) => x.start.toISOString() === iso)?.freeStations;
  assert.equal(at("2026-11-23T05:30:00.000Z"), 2); // 11:00-12:00 free on both
  assert.equal(at("2026-11-23T06:00:00.000Z"), 1); // 11:30-12:30 overlaps a at 12:00
  assert.equal(at("2026-11-23T08:30:00.000Z"), 2); // back-to-back is fine
  assert.equal(r.at(-1)!.start.toISOString(), "2026-11-23T16:30:00.000Z"); // last 1h slot = 22:00
  const later = availableStarts({ slots: daySlots(day, S), closesAt, durationMin: 60, stations, busy, now: new Date("2026-11-23T10:00:00Z") });
  assert.ok(later.every((x) => x.start.getTime() >= Date.parse("2026-11-23T10:00:00Z")), "no past slots");
  assert.equal(stationFree("a", Date.parse("2026-11-23T07:00:00Z"), Date.parse("2026-11-23T07:30:00Z"), [{ ...busy[0], id: "x" }], "x"), true);
});

test("phone + price", () => {
  assert.equal(normalizePhone("98765 43210"), "919876543210");
  assert.equal(normalizePhone("+91 98765-43210"), "919876543210");
  assert.equal(normalizePhone("098765 43210"), "919876543210");
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizePhone(displayPhone("919876543210")), "919876543210");
  assert.equal(estimatePrice(150, 90), 225);
});

import { hoursFor, openState, fmtClock } from "../lib/time";
import { bookingPrice, priceLabel } from "../lib/availability";
import { onColor, themeCss, googleFontUrl } from "../lib/brand";
import { renderTemplate, DEFAULT_TEMPLATES } from "../lib/messages";

test("weekly hours and closures", () => {
  const s = { ...S, weekly_hours: { "1": { open: "14:00", close: "22:00" }, "2": { closed: true } } };
  // 2026-11-23 is a Monday, 24th Tuesday, 25th Wednesday
  assert.deepEqual(hoursFor("2026-11-23", s), { open: "14:00", close: "22:00", closed: false, reason: "" });
  assert.equal(hoursFor("2026-11-24", s).closed, true);
  assert.equal(hoursFor("2026-11-25", s).open, "11:00");
  const c = [{ date: "2026-11-25", reason: "Diwali" }];
  assert.deepEqual(hoursFor("2026-11-25", s, c), { open: "11:00", close: "23:00", closed: true, reason: "Diwali" });
  assert.equal(businessWindow("2026-11-23", s).opensAt.toISOString(), "2026-11-23T08:30:00.000Z");
  assert.equal(daySlots("2026-11-23", s).length, 16);
});

test("open now, including after midnight", () => {
  const st = openState(new Date("2026-11-23T19:30:00Z"), late); // 01:00 IST on the 24th
  assert.ok(st.open && st.until.toISOString() === "2026-11-23T20:30:00.000Z");
  const closed = openState(new Date("2026-11-23T03:00:00Z"), S); // 08:30 IST
  assert.ok(!closed.open && closed.opensAt?.toISOString() === "2026-11-23T05:30:00.000Z");
  const shut = openState(new Date("2026-11-23T03:00:00Z"), S, [{ date: "2026-11-23", reason: "" }]);
  assert.ok(!shut.open && shut.opensAt?.toISOString() === "2026-11-24T05:30:00.000Z", "skips closure to next day");
  assert.equal(fmtClock("23:30"), "11:30 pm");
  assert.equal(fmtClock("00:00"), "12 am");
});

test("world pricing", () => {
  const types = [
    { name: "PS5", hourly_rate: 150, pricing: "per_station" },
    { name: "VR", hourly_rate: 300, pricing: "per_player" },
  ] as unknown as Parameters<typeof bookingPrice>[1];
  assert.equal(bookingPrice({ type: "PS5", hourly_rate: null }, types, 90, 3), 225);
  assert.equal(bookingPrice({ type: "PS5", hourly_rate: 200 }, types, 60, 3), 200, "station override");
  assert.equal(bookingPrice({ type: "VR", hourly_rate: null }, types, 30, 2), 300, "per player");
  assert.equal(priceLabel({ hourly_rate: 300, pricing: "per_player" }), "₹300 an hour per player");
});

test("branding is validated before reaching CSS", () => {
  assert.equal(onColor("#FFC23D"), "#0b0b1a");
  assert.equal(onColor("#5B3DF5"), "#ffffff");
  const css = themeCss({ color_primary: "red;}body{x", color_accent: "#FFC23D", color_background: "#0D0E2B", font_display: "Bad\";}", font_body: "Inter" });
  assert.ok(css.includes("--color-portal:#7C5CFF"), "invalid colour falls back");
  assert.ok(!css.includes("Bad"), "invalid font ignored");
  assert.ok(css.includes('--font-body:"Inter"'));
  assert.equal(googleFontUrl("Unbounded", "Unbounded"), null, "bundled font not fetched");
  assert.equal(googleFontUrl("Bebas Neue", "Unbounded"), "https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap");
});

test("whatsapp templates", () => {
  const msg = renderTemplate(
    DEFAULT_TEMPLATES.reminder,
    { cafe_name: "The Multiverse", address: "Ambernath" },
    { customer_name: "Riya", starts_at: "2026-11-23T12:30:00Z", ends_at: "2026-11-23T14:30:00Z", party_size: 2 },
    { name: "PS5 · Station 1", type: "PS5" },
  );
  assert.equal(msg, "Hi Riya, a reminder of your PS5 · Station 1 slot today, 6:00 pm–8:00 pm at The Multiverse. See you soon! 🎮");
  assert.equal(renderTemplate("{unknown} {name}", { cafe_name: "", address: "" }, { customer_name: "A", starts_at: "2026-11-23T12:30:00Z", ends_at: "2026-11-23T12:30:00Z", party_size: 1 }, { name: "", type: "" }), "{unknown} A");
});

import { worldsForGame } from "../lib/types";

test("games map to the worlds they run on", () => {
  const ws = [{ name: "PS5" }, { name: "Xbox" }, { name: "RC Arena" }];
  assert.deepEqual(worldsForGame({ worlds: ["Xbox", "PS5"] }, ws).map((w) => w.name), ["PS5", "Xbox"]);
  assert.deepEqual(worldsForGame({ worlds: [] }, ws).length, 3, "unlinked = everywhere");
  assert.deepEqual(worldsForGame({ worlds: ["PC"] }, ws), [], "only on a world that isn't open yet = coming soon");
});
