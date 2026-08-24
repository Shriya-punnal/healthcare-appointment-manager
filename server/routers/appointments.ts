import { and, eq, gt, inArray, lt, lte, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { aiSummaries, appointments, doctorLeaves, doctorProfiles, doctorWorkingHours, slotLocks, symptomSubmissions } from "../../drizzle/schema";
import { getDb } from "../db";
import { queueCalendarSync } from "../services/calendar";
import { enqueueNotification } from "../services/notifications";
import { LLMService } from "../services/llmSummary";
import { assertBookableSlot, conflictError, overlaps } from "../services/scheduling";
import { router } from "../_core/trpc";
import { roleProcedure } from "./role";

const slotInput = z.object({ doctorId: z.string().uuid(), startsAt: z.coerce.date(), timezone: z.string().min(1).max(64) });

async function getValidatedSlot(input: z.infer<typeof slotInput>) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const doctor = (await db.select().from(doctorProfiles).where(and(eq(doctorProfiles.id, input.doctorId), eq(doctorProfiles.active, true))).limit(1))[0];
  if (!doctor) throw new TRPCError({ code: "NOT_FOUND", message: "NOT_FOUND: Doctor is unavailable." });
  const endsAt = new Date(input.startsAt.getTime() + doctor.slotDurationMinutes * 60_000);
  const [hours, leaves] = await Promise.all([
    db.select().from(doctorWorkingHours).where(eq(doctorWorkingHours.doctorId, doctor.id)),
    db.select().from(doctorLeaves).where(and(eq(doctorLeaves.doctorId, doctor.id), eq(doctorLeaves.status, "confirmed"))),
  ]);
  assertBookableSlot({ startsAt: input.startsAt, endsAt, timezone: doctor.timezone, durationMinutes: doctor.slotDurationMinutes, workingHours: hours });
  if (leaves.some(leave => overlaps(input.startsAt, endsAt, leave.startsAt, leave.endsAt))) {
    throw new TRPCError({ code: "CONFLICT", message: "DOCTOR_ON_LEAVE: This doctor is unavailable for the selected time." });
  }
  return { db, doctor, endsAt };
}

async function reserveSlot(input: z.infer<typeof slotInput>, patientId: number, state: "held" | "booked" = "held") {
  const { db, doctor, endsAt } = await getValidatedSlot(input);
  const expiresAt = new Date(Date.now() + 5 * 60_000);
  try {
    await db.transaction(async tx => {
      await tx.delete(slotLocks).where(and(eq(slotLocks.doctorId, doctor.id), eq(slotLocks.status, "held"), lte(slotLocks.expiresAt, new Date())));
      const overlap = await tx.select({ id: slotLocks.id }).from(slotLocks).where(and(
        eq(slotLocks.doctorId, doctor.id),
        lt(slotLocks.startsAt, endsAt),
        gt(slotLocks.endsAt, input.startsAt),
        or(eq(slotLocks.status, "booked"), and(eq(slotLocks.status, "held"), gt(slotLocks.expiresAt, new Date()))),
      )).limit(1);
      if (overlap[0]) throw conflictError();
      const appointmentOverlap = await tx.select({ id: appointments.id }).from(appointments).where(and(
        eq(appointments.doctorId, doctor.id),
        lt(appointments.startsAt, endsAt),
        gt(appointments.endsAt, input.startsAt),
        inArray(appointments.status, ["confirmed", "completed"]),
      )).limit(1);
      if (appointmentOverlap[0]) throw conflictError();
      await tx.insert(slotLocks).values({ doctorId: doctor.id, patientId, startsAt: input.startsAt, endsAt, expiresAt, status: state });
    });
  } catch (error) {
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") throw conflictError();
    throw error;
  }
  const lock = (await db.select().from(slotLocks).where(and(eq(slotLocks.doctorId, doctor.id), eq(slotLocks.startsAt, input.startsAt))).limit(1))[0];
  if (!lock || lock.patientId !== patientId) throw conflictError();
  return { lock, doctor, endsAt };
}

export const appointmentsRouter = router({
  hold: roleProcedure("patient").input(slotInput).mutation(async ({ ctx, input }) => {
    const result = await reserveSlot(input, ctx.user.id);
    return { holdId: result.lock.id, expiresAt: result.lock.expiresAt, doctorName: result.doctor.displayName };
  }),
  confirm: roleProcedure("patient").input(z.object({ holdId: z.string().uuid(), symptoms: z.string().trim().min(8).max(5000), duration: z.string().max(160).optional(), severity: z.number().int().min(1).max(10).optional() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    let appointmentId = "";
    try {
      await db.transaction(async tx => {
        const lock = (await tx.select().from(slotLocks).where(eq(slotLocks.id, input.holdId)).limit(1))[0];
        if (!lock || lock.patientId !== ctx.user.id || lock.status !== "held" || lock.expiresAt.getTime() <= Date.now()) {
          throw new TRPCError({ code: "CONFLICT", message: "SLOT_HOLD_EXPIRED: Your slot hold has expired. Please choose another time." });
        }
        appointmentId = crypto.randomUUID();
        await tx.insert(appointments).values({ id: appointmentId, doctorId: lock.doctorId, patientId: ctx.user.id, slotLockId: lock.id, startsAt: lock.startsAt, endsAt: lock.endsAt, timezone: "UTC", status: "confirmed" });
        await tx.update(slotLocks).set({ status: "booked" }).where(eq(slotLocks.id, lock.id));
        await tx.insert(symptomSubmissions).values({ appointmentId, patientId: ctx.user.id, symptoms: input.symptoms, duration: input.duration, severity: input.severity });
      });
    } catch (error) {
      if ((error as { code?: string }).code === "ER_DUP_ENTRY") throw conflictError();
      throw error;
    }
    await enqueueNotification({ recipientUserId: ctx.user.id, appointmentId, type: "booking_confirmation", payload: { appointmentId }, idempotencyKey: `booking:${appointmentId}` });
    await queueCalendarSync(appointmentId, "create");
    const aiResult = await LLMService.generatePreVisitSummary(input.symptoms);
    try {
      await db.insert(aiSummaries).values({ appointmentId, kind: "pre_visit", status: aiResult.status, provider: aiResult.fallback ? "development-fallback" : "configured-llm", isDevelopmentFallback: aiResult.fallback, content: aiResult.content, errorMessage: aiResult.error ?? null });
    } catch (error) {
      console.error("[AI] Failed to persist pre-visit result:", error);
    }
    return { appointmentId, aiStatus: aiResult.status };
  }),
  list: roleProcedure("patient").query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select({ appointment: appointments, doctor: doctorProfiles, summary: aiSummaries }).from(appointments)
      .innerJoin(doctorProfiles, eq(appointments.doctorId, doctorProfiles.id))
      .leftJoin(aiSummaries, and(eq(aiSummaries.appointmentId, appointments.id), eq(aiSummaries.kind, "pre_visit")))
      .where(eq(appointments.patientId, ctx.user.id));
  }),
  cancel: roleProcedure("patient").input(z.object({ appointmentId: z.string().uuid(), reason: z.string().trim().max(500).optional() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const appointment = (await db.select().from(appointments).where(and(eq(appointments.id, input.appointmentId), eq(appointments.patientId, ctx.user.id))).limit(1))[0];
    if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "NOT_FOUND: Appointment not found." });
    await db.transaction(async tx => {
      await tx.update(appointments).set({ status: "cancelled_by_patient", cancellationReason: input.reason ?? null }).where(eq(appointments.id, appointment.id));
      if (appointment.slotLockId) await tx.delete(slotLocks).where(eq(slotLocks.id, appointment.slotLockId));
    });
    await enqueueNotification({ recipientUserId: ctx.user.id, appointmentId: appointment.id, type: "cancellation", payload: { appointmentId: appointment.id }, idempotencyKey: `cancel:${appointment.id}` });
    await queueCalendarSync(appointment.id, "cancel");
    return { success: true };
  }),
  reschedule: roleProcedure("patient").input(slotInput.extend({ appointmentId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const current = (await db.select().from(appointments).where(and(eq(appointments.id, input.appointmentId), eq(appointments.patientId, ctx.user.id), eq(appointments.status, "confirmed"))).limit(1))[0];
    if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "NOT_FOUND: A confirmed appointment is required to reschedule." });
    const reservation = await reserveSlot(input, ctx.user.id, "booked");
    await db.transaction(async tx => {
      await tx.update(appointments).set({ doctorId: input.doctorId, startsAt: input.startsAt, endsAt: reservation.endsAt, timezone: input.timezone, slotLockId: reservation.lock.id, status: "confirmed" }).where(eq(appointments.id, current.id));
      if (current.slotLockId) await tx.delete(slotLocks).where(eq(slotLocks.id, current.slotLockId));
    });
    await enqueueNotification({ recipientUserId: ctx.user.id, appointmentId: current.id, type: "reschedule", payload: { appointmentId: current.id }, idempotencyKey: `reschedule:${current.id}:${input.startsAt.toISOString()}` });
    await queueCalendarSync(current.id, "update");
    return { appointmentId: current.id };
  }),
});
