import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generatePreVisitSummary: vi.fn() }));
vi.mock("./services/llmSummary", () => ({ LLMService: { generatePreVisitSummary: mocks.generatePreVisitSummary } }));

import { aiSummaries, appointments, doctorProfiles, slotLocks, users } from "../drizzle/schema";
import { getDb } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const created = { appointmentId: "", doctorId: "", userId: 0 };
function context(user: NonNullable<TrpcContext["user"]>): TrpcContext { return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: () => undefined } as TrpcContext["res"] }; }

afterEach(async () => {
  vi.clearAllMocks();
  const db = await getDb(); if (!db) return;
  if (created.appointmentId) await db.delete(aiSummaries).where(eq(aiSummaries.appointmentId, created.appointmentId));
  if (created.appointmentId) await db.delete(appointments).where(eq(appointments.id, created.appointmentId));
  if (created.doctorId) await db.delete(doctorProfiles).where(eq(doctorProfiles.id, created.doctorId));
  if (created.userId) await db.delete(users).where(eq(users.id, created.userId));
  created.appointmentId = ""; created.doctorId = ""; created.userId = 0;
});

describe("booking with LLM failure", () => {
  it("confirms the appointment and stores a failed AI status", async () => {
    const db = await getDb(); expect(db).not.toBeNull(); if (!db) return;
    mocks.generatePreVisitSummary.mockResolvedValue({ status: "failed", content: null, fallback: false, error: "AI summary is temporarily unavailable." });
    const token = crypto.randomUUID(); const doctorId = crypto.randomUUID(); const holdId = crypto.randomUUID(); created.doctorId = doctorId;
    await db.insert(users).values({ openId: `ai-failure-${token}`, role: "patient", name: "AI Failure Test Patient" });
    const patient = (await db.select().from(users).where(eq(users.openId, `ai-failure-${token}`)).limit(1))[0]!; created.userId = patient.id;
    await db.insert(doctorProfiles).values({ id: doctorId, displayName: "AI Failure Test Doctor", specialization: "Test", licenseNumber: `AI-${token}`, timezone: "UTC", slotDurationMinutes: 30, active: true });
    const startsAt = new Date("2032-04-01T10:00:00.000Z");
    await db.insert(slotLocks).values({ id: holdId, doctorId, patientId: patient.id, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), expiresAt: new Date(Date.now() + 5 * 60_000), status: "held" });
    const result = await appRouter.createCaller(context(patient)).appointments.confirm({ holdId, symptoms: "Persistent symptom details submitted for the appointment." });
    created.appointmentId = result.appointmentId;
    expect(result.aiStatus).toBe("failed");
    const summary = (await db.select().from(aiSummaries).where(eq(aiSummaries.appointmentId, result.appointmentId)).limit(1))[0];
    expect(summary).toMatchObject({ status: "failed", errorMessage: "AI summary is temporarily unavailable." });
  });
});
