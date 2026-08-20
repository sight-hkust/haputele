import assert from "node:assert/strict";
import { displayDob, maskDobInput, parseDob } from "../src/lib/dob-date.ts";

assert.equal(maskDobInput("12021990"), "12/02/1990");
assert.equal(maskDobInput("12-02-1990"), "12/02/1990");
assert.equal(maskDobInput("12/02"), "12/02/");
assert.equal(maskDobInput("12/02", "12/02/"), "12/02");
assert.equal(maskDobInput("12", "12/"), "12");
assert.equal(maskDobInput("1990-02-12"), "12/02/1990");
assert.equal(parseDob("1/2/1990"), "1990-02-01");
assert.equal(parseDob("29/02/2024"), "2024-02-29");
assert.equal(parseDob("29/02/2023"), null);
assert.equal(parseDob("31/04/2020"), null);
assert.equal(displayDob("1990-02-12"), "12/02/1990");

console.log("DOB date checks passed");
