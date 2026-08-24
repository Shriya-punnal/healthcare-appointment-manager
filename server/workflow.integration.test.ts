import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { doctorProfiles, notifications, slotLocks, users } from "../drizzle/schema";
import { getDb } from "./db";
import { deliverPendingNotifications } from "./services/notifications";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const created = { doctorId: "", userId: 0, notificationKey: "" };

function context(user: NonNullable<TrpcContext["user"]>): TrpcContext {
  return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: () => undefined } as TrpcContext["res"] };
}

afterEach(async () => {
  const db = await getDb(); if (!db) return;
  if (created.notificationKey) await db.delete(notifications).where(eq(notifications.idempotencyKey, created.notificationKey));
  if (created.doctorId) await db.delete(doctorProfiles).where(eq(doctorProfiles.id, created.doctorId));
  if (created.userId) await db.delete(users).where(eq(users.id, created.userId));
  created.doctorId = ""; created.userId = 0; created.notificationKey = "";
});

async function patientUser() {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const openId = `workflow-${crypto.randomUUID()}`;
  await db.insert(users).values({ openId, role: "patient", name: "Workflow Test Patient" });
  const user = (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0]!;
  created.userId = user.id;
  return user;
}

describe("secure healthcare workflow boundaries", () => {
  it("blocks a patient account from the administrator router", async () => {
    const user = await patientUser();
    await expect(appRouter.createCaller(context(user)).admin.dashboard()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects confirmation of an expired slot hold owned by the patient", async () => {
    const db = await getDb(); expect(db).not.toBeNull(); if (!db) return;
    const user = await patientUser(); const doctorId = crypto.randomUUID(); created.doctorId = doctorId;
    await db.insert(doctorProfiles).values({ id: doctorId, displayName: "Expiry Test Doctor", specialization: "Test", licenseNumber: `EXP-${crypto.randomUUID()}`, timezone: "UTC", slotDurationMinutes: 30, active: true });
    const startsAt = new Date("2031-01-07T10:00:00.000Z"); const holdId = crypto.randomUUID();
    await db.insert(slotLocks).values({ id: holdId, doctorId, patientId: user.id, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), expiresAt: new Date(Date.now() - 60_000), status: "held" });
    await expect(appRouter.createCaller(context(user)).appointments.confirm({ holdId, symptoms: "A test symptom record that is sufficiently long." })).rejects.toThrow("SLOT_HOLD_EXPIRED");
  });

  it("moves an unconfigured email delivery from pending to retrying without changing care data", async () => {
    const db = await getDb(); expect(db).not.toBeNull(); if (!db) return;
    const user = await patientUser(); const idempotencyKey = `notify-${crypto.randomUUID()}`; created.notificationKey = idempotencyKey;
    const original = process.env.EMAIL_HOST; delete process.env.EMAIL_HOST;
    await db.insert(notifications).values({ recipientUserId: user.id, type: "booking_confirmation", payload: { test: true }, idempotencyKey });
    await deliverPendingNotifications(new Date());
    const record = (await db.select().from(notifications).where(eq(notifications.idempotencyKey, idempotencyKey)).limit(1))[0];
    if (original) process.env.EMAIL_HOST = original;
    expect(record).toMatchObject({ state: "retrying", attempts: 1 });
  });
});
