import assert from "node:assert/strict";

import { formatWeekRange, parseCalendarDate } from "../src/lib/calendar-date.ts";

assert.equal(formatWeekRange("2026-08-19"), "17–23 Aug 2026");
assert.equal(formatWeekRange("2026-08-31"), "31 Aug–6 Sep 2026");
assert.equal(formatWeekRange(""), "");
assert.equal(parseCalendarDate("19/08/2026"), null);

console.log("calendar date checks passed");
