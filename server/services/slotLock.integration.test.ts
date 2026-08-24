import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { doctorProfiles, slotLocks, users } from "../../drizzle/schema";
import { getDb } from "../db";

const created = { doctorId: "", userId: 0 };

afterEach(async () => {
  const db = await getDb();
  if (!db) return;
  if (created.doctorId) await db.delete(doctorProfiles).where(eq(doctorProfiles.id, created.doctorId));
  if (created.userId) await db.delete(users).where(eq(users.id, created.userId));
  created.doctorId = ""; created.userId = 0;
});

describe("database slot lock concurrency", () => {
  it("allows exactly one simultaneous lock for the same doctor and start time", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) return;
    const suffix = crypto.randomUUID();
    const doctorId = crypto.randomUUID();
    created.doctorId = doctorId;
    await db.insert(doctorProfiles).values({ id: doctorId, displayName: "Concurrency Test Doctor", specialization: "Test Medicine", licenseNumber: `TEST-${suffix}`, timezone: "UTC", slotDurationMinutes: 30, active: true });
    await db.insert(users).values({ openId: `test-${suffix}`, role: "patient", name: "Concurrency Test Patient" });
    const patient = (await db.select().from(users).where(eq(users.openId, `test-${suffix}`)).limit(1))[0]!;
    created.userId = patient.id;
    const startsAt = new Date("2031-01-07T10:00:00.000Z");
    const payload = { doctorId, patientId: patient.id, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), expiresAt: new Date(startsAt.getTime() + 5 * 60_000), status: "held" as const };
    const results = await Promise.allSettled([db.insert(slotLocks).values(payload), db.insert(slotLocks).values(payload)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  });
});
