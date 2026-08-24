import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { aiSummaries, appointments, clinicalNotes, doctorProfiles, medicationReminders, notifications, prescriptionMedications, prescriptions, symptomSubmissions } from "../../drizzle/schema";
import { getDb } from "../db";
import { LLMService } from "../services/llmSummary";
import { router } from "../_core/trpc";
import { roleProcedure } from "./role";

async function ownedDoctor(userId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const doctor = (await db.select().from(doctorProfiles).where(eq(doctorProfiles.userId, userId)).limit(1))[0];
  if (!doctor) throw new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN: Doctor profile is not assigned to this account." });
  return { db, doctor };
}

export const careRouter = router({
  patientDashboard: roleProcedure("patient").query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { appointments: [], reminders: [], notifications: [] };
    const [patientAppointments, reminders, history] = await Promise.all([
      db.select({ appointment: appointments, doctor: doctorProfiles, preVisit: aiSummaries }).from(appointments)
        .innerJoin(doctorProfiles, eq(appointments.doctorId, doctorProfiles.id))
        .leftJoin(aiSummaries, and(eq(aiSummaries.appointmentId, appointments.id), eq(aiSummaries.kind, "pre_visit")))
        .where(eq(appointments.patientId, ctx.user.id)).orderBy(desc(appointments.startsAt)),
      db.select().from(medicationReminders).where(eq(medicationReminders.patientId, ctx.user.id)).orderBy(desc(medicationReminders.scheduledAt)),
      db.select().from(notifications).where(eq(notifications.recipientUserId, ctx.user.id)).orderBy(desc(notifications.createdAt)),
    ]);
    return { appointments: patientAppointments, reminders, notifications: history };
  }),
  preVisitSummary: roleProcedure("patient").input(z.object({ appointmentId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const appointment = (await db.select().from(appointments).where(and(eq(appointments.id, input.appointmentId), eq(appointments.patientId, ctx.user.id))).limit(1))[0];
    if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "NOT_FOUND: Appointment not found." });
    const symptom = (await db.select().from(symptomSubmissions).where(eq(symptomSubmissions.appointmentId, appointment.id)).limit(1))[0];
    if (!symptom) throw new TRPCError({ code: "NOT_FOUND", message: "NOT_FOUND: Symptom intake is required before generating a summary." });
    const result = await LLMService.generatePreVisitSummary(symptom.symptoms);
    const values = { appointmentId: appointment.id, kind: "pre_visit" as const, status: result.status, provider: result.fallback ? "development-fallback" : "configured-llm", isDevelopmentFallback: result.fallback, content: result.content, errorMessage: result.error ?? null };
    await db.insert(aiSummaries).values(values).onDuplicateKeyUpdate({ set: { status: values.status, provider: values.provider, isDevelopmentFallback: values.isDevelopmentFallback, content: values.content, errorMessage: values.errorMessage } });
    return result;
  }),
  doctorDashboard: roleProcedure("doctor").query(async ({ ctx }) => {
    const { db, doctor } = await ownedDoctor(ctx.user.id);
    const rows = await db.select({ appointment: appointments, symptom: symptomSubmissions, preVisit: aiSummaries }).from(appointments)
      .leftJoin(symptomSubmissions, eq(symptomSubmissions.appointmentId, appointments.id))
      .leftJoin(aiSummaries, and(eq(aiSummaries.appointmentId, appointments.id), eq(aiSummaries.kind, "pre_visit")))
      .where(eq(appointments.doctorId, doctor.id)).orderBy(appointments.startsAt);
    return { doctor, appointments: rows };
  }),
  clinicalNote: roleProcedure("doctor").input(z.object({ appointmentId: z.string().uuid(), assessment: z.string().trim().min(4).max(5000), plan: z.string().trim().min(4).max(5000), followUp: z.string().trim().max(2000).optional() })).mutation(async ({ ctx, input }) => {
    const { db, doctor } = await ownedDoctor(ctx.user.id);
    const appointment = (await db.select().from(appointments).where(and(eq(appointments.id, input.appointmentId), eq(appointments.doctorId, doctor.id))).limit(1))[0];
    if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "NOT_FOUND: Appointment not found." });
    await db.insert(clinicalNotes).values({ appointmentId: input.appointmentId, doctorId: doctor.id, assessment: input.assessment, plan: input.plan, followUp: input.followUp }).onDuplicateKeyUpdate({ set: { assessment: input.assessment, plan: input.plan, followUp: input.followUp ?? null } });
    return { success: true };
  }),
  prescription: roleProcedure("doctor").input(z.object({ appointmentId: z.string().uuid(), instructions: z.string().trim().max(2000).optional(), medications: z.array(z.object({ name: z.string().trim().min(1).max(160), dosage: z.string().trim().min(1).max(120), frequency: z.string().trim().min(1).max(160), reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional() })).min(1).max(10) })).mutation(async ({ ctx, input }) => {
    const { db, doctor } = await ownedDoctor(ctx.user.id);
    const appointment = (await db.select().from(appointments).where(and(eq(appointments.id, input.appointmentId), eq(appointments.doctorId, doctor.id))).limit(1))[0];
    if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "NOT_FOUND: Appointment not found." });
    const prescriptionId = crypto.randomUUID();
    await db.transaction(async tx => {
      await tx.insert(prescriptions).values({ id: prescriptionId, appointmentId: appointment.id, doctorId: doctor.id, instructions: input.instructions }).onDuplicateKeyUpdate({ set: { instructions: input.instructions ?? null } });
      const actualId = (await tx.select().from(prescriptions).where(eq(prescriptions.appointmentId, appointment.id)).limit(1))[0]?.id ?? prescriptionId;
      await tx.delete(prescriptionMedications).where(eq(prescriptionMedications.prescriptionId, actualId));
      const medications = input.medications.map(medication => ({ id: crypto.randomUUID(), prescriptionId: actualId, medicationName: medication.name, dosage: medication.dosage, frequency: medication.frequency, reminderTime: medication.reminderTime }));
      await tx.insert(prescriptionMedications).values(medications);
      const nextReminder = (time: string) => { const [hour, minute] = time.split(":").map(Number); const scheduledAt = new Date(); scheduledAt.setUTCHours(hour, minute, 0, 0); if (scheduledAt <= new Date()) scheduledAt.setUTCDate(scheduledAt.getUTCDate() + 1); return scheduledAt; };
      const reminders = medications.filter(medication => medication.reminderTime).map(medication => ({ patientId: appointment.patientId, prescriptionMedicationId: medication.id, scheduledAt: nextReminder(medication.reminderTime!), state: "pending" as const }));
      if (reminders.length) await tx.insert(medicationReminders).values(reminders);
    });
    return { success: true };
  }),
  postVisitSummary: roleProcedure("doctor").input(z.object({ appointmentId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const { db, doctor } = await ownedDoctor(ctx.user.id);
    const note = (await db.select().from(clinicalNotes).where(and(eq(clinicalNotes.appointmentId, input.appointmentId), eq(clinicalNotes.doctorId, doctor.id))).limit(1))[0];
    if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "NOT_FOUND: Save clinical notes before generating the patient summary." });
    const result = await LLMService.generatePostVisitSummary(`${note.assessment}\nPlan: ${note.plan}\nFollow up: ${note.followUp ?? ""}`);
    const values = { appointmentId: input.appointmentId, kind: "post_visit" as const, status: result.status, provider: result.fallback ? "development-fallback" : "configured-llm", isDevelopmentFallback: result.fallback, content: result.content, errorMessage: result.error ?? null };
    await db.insert(aiSummaries).values(values).onDuplicateKeyUpdate({ set: { status: values.status, provider: values.provider, isDevelopmentFallback: values.isDevelopmentFallback, content: values.content, errorMessage: values.errorMessage } });
    return result;
  }),
});
