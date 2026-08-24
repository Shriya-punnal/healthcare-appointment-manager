import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { appointments, doctorProfiles, users } from "../drizzle/schema";
import { getDb } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const created = { appointmentId: "", doctorId: "", userIds: [] as number[] };
function context(user: NonNullable<TrpcContext["user"]>): TrpcContext { return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: () => undefined } as TrpcContext["res"] }; }

afterEach(async () => {
  const db = await getDb(); if (!db) return;
  if (created.appointmentId) await db.delete(appointments).where(eq(appointments.id, created.appointmentId));
  if (created.doctorId) await db.delete(doctorProfiles).where(eq(doctorProfiles.id, created.doctorId));
  for (const userId of created.userIds) await db.delete(users).where(eq(users.id, userId));
  created.appointmentId = ""; created.doctorId = ""; created.userIds = [];
});

describe("authorization isolation", () => {
  it("does not let one patient cancel another patient's appointment", async () => {
    const db = await getDb(); expect(db).not.toBeNull(); if (!db) return;
    const token = crypto.randomUUID(); const doctorId = crypto.randomUUID(); const appointmentId = crypto.randomUUID(); created.doctorId = doctorId; created.appointmentId = appointmentId;
    await db.insert(users).values([{ openId: `owner-${token}`, role: "patient", name: "Owner" }, { openId: `other-${token}`, role: "patient", name: "Other Patient" }]);
    const owner = (await db.select().from(users).where(eq(users.openId, `owner-${token}`)).limit(1))[0]!;
    const other = (await db.select().from(users).where(eq(users.openId, `other-${token}`)).limit(1))[0]!; created.userIds = [owner.id, other.id];
    await db.insert(doctorProfiles).values({ id: doctorId, displayName: "Security Test Doctor", specialization: "Test", licenseNumber: `SEC-${token}`, timezone: "UTC", slotDurationMinutes: 30, active: true });
    const startsAt = new Date("2032-05-01T10:00:00.000Z");
    await db.insert(appointments).values({ id: appointmentId, doctorId, patientId: owner.id, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), timezone: "UTC", status: "confirmed" });
    await expect(appRouter.createCaller(context(other)).appointments.cancel({ appointmentId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("does not let a doctor-role account access administrator operations", async () => {
    const db = await getDb(); expect(db).not.toBeNull(); if (!db) return;
    const openId = `doctor-role-${crypto.randomUUID()}`;
    await db.insert(users).values({ openId, role: "doctor", name: "Doctor Role Test" });
    const doctor = (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0]!; created.userIds = [doctor.id];
    await expect(appRouter.createCaller(context(doctor)).admin.dashboard()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
