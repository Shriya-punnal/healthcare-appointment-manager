import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { appointments, calendarEvents, doctorProfiles, users } from "../drizzle/schema";
import { getDb } from "./db";
import { queueCalendarSync } from "./services/calendar";

const created = { appointmentId: "", doctorId: "", userId: 0 };
afterEach(async () => {
  const db = await getDb(); if (!db) return;
  if (created.appointmentId) await db.delete(calendarEvents).where(eq(calendarEvents.appointmentId, created.appointmentId));
  if (created.appointmentId) await db.delete(appointments).where(eq(appointments.id, created.appointmentId));
  if (created.doctorId) await db.delete(doctorProfiles).where(eq(doctorProfiles.id, created.doctorId));
  if (created.userId) await db.delete(users).where(eq(users.id, created.userId));
  created.appointmentId = ""; created.doctorId = ""; created.userId = 0;
});

describe("Google Calendar fallback", () => {
  it("records not_configured without affecting the core appointment when Google credentials are absent", async () => {
    const db = await getDb(); expect(db).not.toBeNull(); if (!db) return;
    const prior = { clientId: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET, redirect: process.env.GOOGLE_REDIRECT_URI };
    delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_SECRET; delete process.env.GOOGLE_REDIRECT_URI;
    const token = crypto.randomUUID(); const doctorId = crypto.randomUUID(); const appointmentId = crypto.randomUUID(); created.doctorId = doctorId; created.appointmentId = appointmentId;
    await db.insert(users).values({ openId: `calendar-${token}`, role: "patient", name: "Calendar Fallback Test" });
    const patient = (await db.select().from(users).where(eq(users.openId, `calendar-${token}`)).limit(1))[0]!; created.userId = patient.id;
    await db.insert(doctorProfiles).values({ id: doctorId, displayName: "Calendar Test Doctor", specialization: "Test", licenseNumber: `CAL-${token}`, timezone: "UTC", slotDurationMinutes: 30, active: true });
    const startsAt = new Date("2032-06-01T10:00:00.000Z");
    await db.insert(appointments).values({ id: appointmentId, doctorId, patientId: patient.id, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), timezone: "UTC", status: "confirmed" });
    await queueCalendarSync(appointmentId, "create");
    const event = (await db.select().from(calendarEvents).where(eq(calendarEvents.appointmentId, appointmentId)).limit(1))[0];
    if (prior.clientId) process.env.GOOGLE_CLIENT_ID = prior.clientId; if (prior.secret) process.env.GOOGLE_CLIENT_SECRET = prior.secret; if (prior.redirect) process.env.GOOGLE_REDIRECT_URI = prior.redirect;
    expect(event).toMatchObject({ state: "not_configured", operation: "create" });
    expect((await db.select().from(appointments).where(eq(appointments.id, appointmentId)).limit(1))[0]?.status).toBe("confirmed");
  });
});
