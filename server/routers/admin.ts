import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { appointments, auditLogs, doctorLeaves, doctorProfiles, doctorWorkingHours, notifications, slotLocks, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { queueCalendarSync } from "../services/calendar";
import { enqueueNotification } from "../services/notifications";
import { router } from "../_core/trpc";
import { roleProcedure } from "./role";

const doctorInput = z.object({ displayName: z.string().trim().min(3).max(160), email: z.string().email().optional(), specialization: z.string().trim().min(2).max(120), licenseNumber: z.string().trim().min(4).max(80), biography: z.string().trim().max(1000).optional(), timezone: z.string().min(1).max(64).default("UTC"), slotDurationMinutes: z.number().int().min(10).max(120).default(30) });

export const adminRouter = router({
  dashboard: roleProcedure("admin").query(async () => {
    const db = await getDb();
    if (!db) return { patients: 0, doctors: 0, today: 0, upcoming: 0, cancelled: 0, notificationFailures: 0 };
    const now = new Date();
    const end = new Date(now.getTime() + 86_400_000);
    const [patientRows, doctorRows, todayRows, upcomingRows, cancelledRows, failedRows] = await Promise.all([
      db.select().from(users).where(eq(users.role, "patient")), db.select().from(doctorProfiles).where(eq(doctorProfiles.active, true)),
      db.select().from(appointments).where(and(gte(appointments.startsAt, now), lte(appointments.startsAt, end))),
      db.select().from(appointments).where(and(gte(appointments.startsAt, now), eq(appointments.status, "confirmed"))),
      db.select().from(appointments).where(inArray(appointments.status, ["cancelled_by_patient", "cancelled_by_doctor_leave"])),
      db.select().from(notifications).where(eq(notifications.state, "failed")),
    ]);
    return { patients: patientRows.length, doctors: doctorRows.length, today: todayRows.length, upcoming: upcomingRows.length, cancelled: cancelledRows.length, notificationFailures: failedRows.length };
  }),
  createDoctor: roleProcedure("admin").input(doctorInput).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const id = crypto.randomUUID();
    await db.transaction(async tx => {
      await tx.insert(doctorProfiles).values({ id, ...input });
      await tx.insert(auditLogs).values({ actorUserId: ctx.user.id, entityType: "doctor", entityId: id, action: "created" });
    });
    return { id };
  }),
  updateDoctor: roleProcedure("admin").input(z.object({ doctorId: z.string().uuid(), patch: doctorInput.partial().extend({ active: z.boolean().optional() }) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    await db.transaction(async tx => {
      await tx.update(doctorProfiles).set(input.patch).where(eq(doctorProfiles.id, input.doctorId));
      await tx.insert(auditLogs).values({ actorUserId: ctx.user.id, entityType: "doctor", entityId: input.doctorId, action: "updated", metadata: input.patch });
    });
    return { success: true };
  }),
  assignDoctor: roleProcedure("admin").input(z.object({ doctorId: z.string().uuid(), userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    await db.transaction(async tx => {
      await tx.update(doctorProfiles).set({ userId: input.userId }).where(eq(doctorProfiles.id, input.doctorId));
      await tx.update(users).set({ role: "doctor" }).where(eq(users.id, input.userId));
      await tx.insert(auditLogs).values({ actorUserId: ctx.user.id, entityType: "doctor", entityId: input.doctorId, action: "assigned", metadata: { userId: input.userId } });
    });
    return { success: true };
  }),
  setWorkingHours: roleProcedure("admin").input(z.object({ doctorId: z.string().uuid(), hours: z.array(z.object({ weekday: z.number().int().min(0).max(6), startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440), enabled: z.boolean().default(true) })).min(1).max(7) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    if (input.hours.some(hour => hour.endMinute <= hour.startMinute)) throw new TRPCError({ code: "BAD_REQUEST", message: "VALIDATION_ERROR: Working-hour end must be after start." });
    await db.transaction(async tx => {
      await tx.delete(doctorWorkingHours).where(eq(doctorWorkingHours.doctorId, input.doctorId));
      await tx.insert(doctorWorkingHours).values(input.hours.map(hour => ({ doctorId: input.doctorId, ...hour })));
      await tx.insert(auditLogs).values({ actorUserId: ctx.user.id, entityType: "doctor", entityId: input.doctorId, action: "working_hours_updated" });
    });
    return { success: true };
  }),
  previewLeave: roleProcedure("admin").input(z.object({ doctorId: z.string().uuid(), startsAt: z.coerce.date(), endsAt: z.coerce.date(), reason: z.string().trim().max(1000).optional() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    if (input.endsAt <= input.startsAt) throw new TRPCError({ code: "BAD_REQUEST", message: "VALIDATION_ERROR: Leave end must be after leave start." });
    const affected = await db.select().from(appointments).where(and(eq(appointments.doctorId, input.doctorId), eq(appointments.status, "confirmed"), lte(appointments.startsAt, input.endsAt), gte(appointments.endsAt, input.startsAt)));
    const id = crypto.randomUUID();
    await db.insert(doctorLeaves).values({ id, ...input, status: "preview", affectedCount: affected.length });
    return { leaveId: id, affectedAppointments: affected.map(item => ({ id: item.id, startsAt: item.startsAt, patientId: item.patientId })) };
  }),
  confirmLeave: roleProcedure("admin").input(z.object({ leaveId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const leave = (await db.select().from(doctorLeaves).where(and(eq(doctorLeaves.id, input.leaveId), eq(doctorLeaves.status, "preview"))).limit(1))[0];
    if (!leave) throw new TRPCError({ code: "NOT_FOUND", message: "NOT_FOUND: A pending leave preview was not found." });
    const affected = await db.select().from(appointments).where(and(eq(appointments.doctorId, leave.doctorId), eq(appointments.status, "confirmed"), lte(appointments.startsAt, leave.endsAt), gte(appointments.endsAt, leave.startsAt)));
    await db.transaction(async tx => {
      await tx.update(appointments).set({ status: "cancelled_by_doctor_leave", cancellationReason: leave.reason ?? "Doctor leave" }).where(inArray(appointments.id, affected.map(item => item.id)));
      await tx.update(doctorLeaves).set({ status: "confirmed", affectedCount: affected.length, confirmedByUserId: ctx.user.id }).where(eq(doctorLeaves.id, leave.id));
      await tx.insert(auditLogs).values({ actorUserId: ctx.user.id, entityType: "doctor_leave", entityId: leave.id, action: "confirmed", metadata: { affected: affected.length } });
    });
    await Promise.all(affected.flatMap(appointment => [
      enqueueNotification({ recipientUserId: appointment.patientId, appointmentId: appointment.id, type: "doctor_leave", payload: { leaveId: leave.id }, idempotencyKey: `leave:${leave.id}:${appointment.id}` }),
      queueCalendarSync(appointment.id, "cancel"),
    ]));
    return { cancelledAppointments: affected.length };
  }),
});
