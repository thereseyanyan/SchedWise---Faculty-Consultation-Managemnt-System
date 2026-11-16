import assert from "node:assert/strict";
import test from "node:test";

import {
  dateKeyInTimeZone,
  relativeDateHeading,
} from "../src/shared/datetime.ts";

const timeZone = "Asia/Kuala_Lumpur";
const now = new Date("2026-11-06T12:00:00Z");

test("notification date keys use the application timezone", () => {
  assert.equal(dateKeyInTimeZone("2026-11-05T16:30:00Z", timeZone), "2026-11-06");
  assert.equal(dateKeyInTimeZone("2026-11-05 23:30:00", timeZone), "2026-11-05");
  assert.equal(dateKeyInTimeZone("not-a-date", timeZone), "");
  assert.equal(dateKeyInTimeZone("2026-11-05 16:30:00", "UTC"), "2026-11-05");
});

test("notification headings group Today, Yesterday, and Earlier this week", () => {
  assert.equal(relativeDateHeading("2026-11-06", timeZone, now), "Today");
  assert.equal(relativeDateHeading("2026-11-05", timeZone, now), "Yesterday");
  assert.equal(relativeDateHeading("2026-11-03", timeZone, now), "Earlier this week");
  assert.equal(relativeDateHeading("2026-11-02", timeZone, now), "Earlier this week");
  assert.equal(
    relativeDateHeading("2026-11-01", timeZone, now),
    "Sunday, November 1, 2026",
  );
  assert.equal(
    relativeDateHeading("2026-10-30", timeZone, now),
    "Friday, October 30, 2026",
  );
  assert.equal(relativeDateHeading("", timeZone, now), "Date unavailable");
});

test("Today follows the application timezone rather than UTC", () => {
  const nearMidnight = new Date("2026-11-05T17:30:00Z");
  assert.equal(relativeDateHeading("2026-11-06", timeZone, nearMidnight), "Today");
  assert.equal(relativeDateHeading("2026-11-05", timeZone, nearMidnight), "Yesterday");
});
