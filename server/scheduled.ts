import type { Request, Response } from "express";
import { and, eq, gte, lte } from "drizzle-orm";
import { appointments, medicationReminders, prescriptionMedications, slotLocks } from "../drizzle/schema";
import { getDb } from "./db";
import { enqueueNotification, deliverPendingNotifications } from "./services/notifications";
import { processPendingCalendarEvents } from "./services/calendar";
import { sdk } from "./_core/sdk";

/** Heartbeat-only reconciliation: idempotently expires holds and processes delivery retries. */
export async function reconcileHealthcareJobs(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "database-unavailable" });
    const now = new Date();
    const expired = await db.delete(slotLocks).where(and(eq(slotLocks.status, "held"), lte(slotLocks.expiresAt, now)));
    const upcomingAppointments = await db.select().from(appointments).where(and(eq(appointments.status, "confirmed"), gte(appointments.startsAt, now), lte(appointments.startsAt, new Date(now.getTime() + 24 * 60 * 60_000))));
    for (const appointment of upcomingAppointments) await enqueueNotification({ recipientUserId: appointment.patientId, appointmentId: appointment.id, type: "appointment_reminder", payload: { appointmentId: appointment.id, startsAt: appointment.startsAt.toISOString() }, idempotencyKey: `appointment-reminder:${appointment.id}` });
    const dueReminders = await db.select({ reminder: medicationReminders, medication: prescriptionMedications }).from(medicationReminders).innerJoin(prescriptionMedications, eq(medicationReminders.prescriptionMedicationId, prescriptionMedications.id)).where(and(eq(medicationReminders.state, "pending"), lte(medicationReminders.scheduledAt, now)));
    for (const item of dueReminders) {
      const { reminder, medication } = item;
      await enqueueNotification({ recipientUserId: reminder.patientId, type: "medication_reminder", payload: { reminderId: reminder.id, medication: medication.medicationName, dosage: medication.dosage }, idempotencyKey: `medication:${reminder.id}` });
      await db.transaction(async tx => {
        await tx.update(medicationReminders).set({ state: "sent" }).where(eq(medicationReminders.id, reminder.id));
        if (medication.reminderTime && (!medication.endsOn || medication.endsOn >= new Date())) {
          const next = new Date(reminder.scheduledAt.getTime() + 24 * 60 * 60_000);
          await tx.insert(medicationReminders).values({ patientId: reminder.patientId, prescriptionMedicationId: medication.id, scheduledAt: next, state: "pending" }).onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });
        }
      });
    }
    const deliveries = await deliverPendingNotifications(now);
    const calendar = await processPendingCalendarEvents();
    return res.json({ ok: true, taskUid: user.taskUid, expiredHolds: expired[0]?.affectedRows ?? 0, appointmentReminders: upcomingAppointments.length, medicationReminders: dueReminders.length, deliveries: deliveries.processed, calendar: calendar.processed });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "unknown", timestamp: new Date().toISOString() });
  }
}
