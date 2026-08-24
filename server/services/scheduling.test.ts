import { describe, expect, it } from "vitest";
import { assertBookableSlot, conflictError, overlaps } from "./scheduling";

const workingHours = [{ weekday: 1, startMinute: 9 * 60, endMinute: 17 * 60, enabled: true }];
const futureMonday = new Date("2030-01-07T10:00:00.000Z");

describe("slot scheduling safeguards", () => {
  it("accepts a correctly aligned future slot inside working hours", () => {
    expect(() => assertBookableSlot({ startsAt: futureMonday, endsAt: new Date(futureMonday.getTime() + 30 * 60_000), timezone: "UTC", durationMinutes: 30, workingHours })).not.toThrow();
  });

  it("rejects a slot outside published doctor hours", () => {
    expect(() => assertBookableSlot({ startsAt: new Date("2030-01-07T18:00:00.000Z"), endsAt: new Date("2030-01-07T18:30:00.000Z"), timezone: "UTC", durationMinutes: 30, workingHours })).toThrow("OUTSIDE_WORKING_HOURS");
  });

  it("rejects a past slot", () => {
    expect(() => assertBookableSlot({ startsAt: new Date("2020-01-06T10:00:00.000Z"), endsAt: new Date("2020-01-06T10:30:00.000Z"), timezone: "UTC", durationMinutes: 30, workingHours: [{ ...workingHours[0], weekday: 1 }] })).toThrow("PAST_SLOT");
  });

  it("identifies overlapping slots and returns a clear conflict", () => {
    expect(overlaps(new Date("2030-01-07T10:00:00Z"), new Date("2030-01-07T10:30:00Z"), new Date("2030-01-07T10:15:00Z"), new Date("2030-01-07T10:45:00Z"))).toBe(true);
    expect(() => { throw conflictError(); }).toThrow("SLOT_ALREADY_BOOKED");
  });
});
