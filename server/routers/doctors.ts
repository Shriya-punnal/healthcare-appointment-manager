import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { appointments, doctorLeaves, doctorProfiles, doctorWorkingHours, slotLocks } from "../../drizzle/schema";
import { getDb } from "../db";
import { publicProcedure, router } from "../_core/trpc";

const availabilityInput = z.object({ doctorId: z.string().uuid(), startsAt: z.coerce.date(), endsAt: z.coerce.date() });

export const doctorsRouter = router({
  list: publicProcedure.input(z.object({ specialization: z.string().trim().optional() }).optional()).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select({
      id: doctorProfiles.id,
      displayName: doctorProfiles.displayName,
      specialization: doctorProfiles.specialization,
      biography: doctorProfiles.biography,
      timezone: doctorProfiles.timezone,
      slotDurationMinutes: doctorProfiles.slotDurationMinutes,
    }).from(doctorProfiles).where(input?.specialization ? and(eq(doctorProfiles.active, true), eq(doctorProfiles.specialization, input.specialization)) : eq(doctorProfiles.active, true)).orderBy(asc(doctorProfiles.displayName));
  }),
  specializations: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.selectDistinct({ value: doctorProfiles.specialization }).from(doctorProfiles).where(eq(doctorProfiles.active, true));
  }),
  availability: publicProcedure.input(availabilityInput).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { doctor: null, workingHours: [], busy: [], leaves: [] };
    const doctor = (await db.select().from(doctorProfiles).where(and(eq(doctorProfiles.id, input.doctorId), eq(doctorProfiles.active, true))).limit(1))[0] ?? null;
    if (!doctor) return { doctor: null, workingHours: [], busy: [], leaves: [] };
    const [workingHours, booked, held, leaves] = await Promise.all([
      db.select().from(doctorWorkingHours).where(eq(doctorWorkingHours.doctorId, doctor.id)),
      db.select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt }).from(appointments).where(and(eq(appointments.doctorId, doctor.id), gt(appointments.endsAt, input.startsAt), inArray(appointments.status, ["confirmed", "completed"]))),
      db.select({ startsAt: slotLocks.startsAt, endsAt: slotLocks.endsAt }).from(slotLocks).where(and(eq(slotLocks.doctorId, doctor.id), gt(slotLocks.expiresAt, new Date()), eq(slotLocks.status, "held"))),
      db.select({ startsAt: doctorLeaves.startsAt, endsAt: doctorLeaves.endsAt }).from(doctorLeaves).where(and(eq(doctorLeaves.doctorId, doctor.id), eq(doctorLeaves.status, "confirmed"))),
    ]);
    return { doctor, workingHours, busy: [...booked, ...held], leaves };
  }),
});
