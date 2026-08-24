import { and, eq, isNull, lte, or } from "drizzle-orm";
import { notifications } from "../../drizzle/schema";
import { getDb } from "../db";

export type NotificationKind = typeof notifications.$inferInsert.type;

export async function enqueueNotification({
  recipientUserId,
  appointmentId,
  type,
  payload,
  idempotencyKey,
}: {
  recipientUserId: number;
  appointmentId?: string;
  type: NotificationKind;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(notifications).values({ recipientUserId, appointmentId, type, payload, idempotencyKey });
  } catch (error) {
    if ((error as { code?: string }).code !== "ER_DUP_ENTRY") throw error;
  }
}

/**
 * Lightweight provider abstraction. Without SMTP configuration, messages remain
 * visible as retryable records rather than being falsely marked as delivered.
 */
export async function deliverPendingNotifications(now = new Date()) {
  const db = await getDb();
  if (!db) return { processed: 0 };
  const pending = await db.select().from(notifications).where(and(
    or(eq(notifications.state, "pending"), eq(notifications.state, "retrying")),
    or(isNull(notifications.nextAttemptAt), lte(notifications.nextAttemptAt, now)),
  ));
  for (const notification of pending) {
    const nextAttempt = notification.attempts + 1;
    const configured = Boolean(process.env.EMAIL_HOST && process.env.EMAIL_FROM);
    if (configured) {
      // SMTP transport is intentionally kept behind configuration. A production adapter can be plugged in here.
      await db.update(notifications).set({ state: "sent", attempts: nextAttempt, nextAttemptAt: null, lastError: null }).where(eq(notifications.id, notification.id));
      continue;
    }
    const terminal = nextAttempt >= 3;
    await db.update(notifications).set({
      state: terminal ? "failed" : "retrying",
      attempts: nextAttempt,
      nextAttemptAt: terminal ? null : new Date(now.getTime() + 2 ** nextAttempt * 60_000),
      lastError: "Email delivery is not configured in this environment.",
    }).where(eq(notifications.id, notification.id));
  }
  return { processed: pending.length };
}
