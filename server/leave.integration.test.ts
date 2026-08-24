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

describe("doctor leave impact workflow", () => {
  it("previews affected appointments and cancels them only after administrator confirmation", async () => {
    const db = await getDb(); expect(db).not.toBeNull(); if (!db) return;
    const token = crypto.randomUUID(); const doctorId = crypto.randomUUID(); const appointmentId = crypto.randomUUID(); created.doctorId = doctorId; created.appointmentId = appointmentId;
    await db.insert(users).values([{ openId: `leave-admin-${token}`, role: "admin", name: "Leave Test Admin" }, { openId: `leave-patient-${token}`, role: "patient", name: "Leave Test Patient" }]);
    const people = await db.select().from(users).where(eq(users.openId, `leave-admin-${token}`)); const admin = people[0]!;
    const patient = (await db.select().from(users).where(eq(users.openId, `leave-patient-${token}`)).limit(1))[0]!; created.userIds = [admin.id, patient.id];
    await db.insert(doctorProfiles).values({ id: doctorId, displayName: "Leave Test Doctor", specialization: "Test", licenseNumber: `LEAVE-${token}`, timezone: "UTC", slotDurationMinutes: 30, active: true });
    const startsAt = new Date("2032-03-01T10:00:00.000Z"); const endsAt = new Date("2032-03-01T10:30:00.000Z");
    await db.insert(appointments).values({ id: appointmentId, doctorId, patientId: patient.id, startsAt, endsAt, timezone: "UTC", status: "confirmed" });
    const caller = appRouter.createCaller(context(admin));
    const preview = await caller.admin.previewLeave({ doctorId, startsAt: new Date("2032-03-01T09:30:00.000Z"), endsAt: new Date("2032-03-01T11:00:00.000Z"), reason: "Planned absence" });
    expect(preview.affectedAppointments).toHaveLength(1);
    await caller.admin.confirmLeave({ leaveId: preview.leaveId });
    const appointment = (await db.select().from(appointments).where(eq(appointments.id, appointmentId)).limit(1))[0];
    expect(appointment?.status).toBe("cancelled_by_doctor_leave");
  });
});
