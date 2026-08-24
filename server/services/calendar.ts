import { and, eq } from "drizzle-orm";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { appointments, calendarConnections, calendarEvents, doctorProfiles } from "../../drizzle/schema";
import { getDb } from "../db";

const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
const secret = () => createHash("sha256").update(process.env.JWT_SECRET ?? "development-calendar-secret").digest();

function encrypt(value: string) { const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", secret(), iv); const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]); return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`; }
function decrypt(value: string) { const [ivText, tagText, bodyText] = value.split("."); const decipher = createDecipheriv("aes-256-gcm", secret(), Buffer.from(ivText, "base64url")); decipher.setAuthTag(Buffer.from(tagText, "base64url")); return Buffer.concat([decipher.update(Buffer.from(bodyText, "base64url")), decipher.final()]).toString("utf8"); }

export function getGoogleAuthorizationUrl(userId: number) {
  if (!googleConfigured()) return null;
  const expiresAt = Date.now() + 10 * 60_000;
  const body = `${userId}.${expiresAt}`;
  const signature = createHmac("sha256", secret()).update(body).digest("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: process.env.GOOGLE_REDIRECT_URI!, response_type: "code", access_type: "offline", prompt: "consent", scope: "https://www.googleapis.com/auth/calendar.events", state: `${body}.${signature}` }).toString();
  return url.toString();
}

function verifyOAuthState(state: string) {
  const [userId, expires, signature] = state.split("."); const body = `${userId}.${expires}`;
  const valid = signature && createHmac("sha256", secret()).update(body).digest("base64url") === signature;
  if (!valid || !Number.isInteger(Number(userId)) || Date.now() > Number(expires)) return null;
  return Number(userId);
}

export async function completeGoogleOAuth(code: string, state: string) {
  const userId = verifyOAuthState(state); if (!userId || !googleConfigured()) return false;
  const body = new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: process.env.GOOGLE_REDIRECT_URI!, grant_type: "authorization_code" });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new Error("Google OAuth token exchange failed.");
  const tokens = await response.json() as { access_token: string; refresh_token?: string; expires_in?: number };
  const db = await getDb(); if (!db) throw new Error("Database unavailable.");
  const existing = (await db.select().from(calendarConnections).where(eq(calendarConnections.userId, userId)).limit(1))[0];
  const values = { encryptedAccessToken: encrypt(tokens.access_token), encryptedRefreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : existing?.encryptedRefreshToken ?? null, expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null };
  if (existing) await db.update(calendarConnections).set(values).where(eq(calendarConnections.id, existing.id));
  else await db.insert(calendarConnections).values({ userId, ...values });
  return true;
}

/** Stores truthful integration state. Core appointment success never awaits an external calendar call. */
export async function queueCalendarSync(appointmentId: string, operation: "create" | "update" | "cancel") {
  const db = await getDb(); if (!db) return;
  const existing = (await db.select().from(calendarEvents).where(eq(calendarEvents.appointmentId, appointmentId)).limit(1))[0];
  const configured = googleConfigured(); const state = configured ? "pending" : operation === "cancel" ? "cancelled" : "not_configured";
  if (existing) await db.update(calendarEvents).set({ operation, state, lastError: configured ? null : "Google Calendar integration not configured." }).where(eq(calendarEvents.id, existing.id));
  else await db.insert(calendarEvents).values({ appointmentId, operation, state, lastError: configured ? null : "Google Calendar integration not configured." });
}

async function accessToken(connection: typeof calendarConnections.$inferSelect) {
  if (!connection.expiresAt || connection.expiresAt.getTime() > Date.now() + 60_000) return decrypt(connection.encryptedAccessToken);
  if (!connection.encryptedRefreshToken || !googleConfigured()) throw new Error("Google Calendar connection has expired. Reconnect it to continue syncing.");
  const body = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, refresh_token: decrypt(connection.encryptedRefreshToken), grant_type: "refresh_token" });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new Error("Google token refresh failed.");
  const tokens = await response.json() as { access_token: string; expires_in?: number };
  const db = await getDb(); if (db) await db.update(calendarConnections).set({ encryptedAccessToken: encrypt(tokens.access_token), expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null }).where(eq(calendarConnections.id, connection.id));
  return tokens.access_token;
}

export async function processPendingCalendarEvents() {
  const db = await getDb(); if (!db || !googleConfigured()) return { processed: 0 };
  const pending = await db.select({ event: calendarEvents, appointment: appointments, doctor: doctorProfiles }).from(calendarEvents).innerJoin(appointments, eq(calendarEvents.appointmentId, appointments.id)).innerJoin(doctorProfiles, eq(appointments.doctorId, doctorProfiles.id)).where(eq(calendarEvents.state, "pending"));
  for (const item of pending) {
    try {
      if (!item.doctor.userId) throw new Error("Doctor has no assigned account for Calendar connection.");
      const connection = (await db.select().from(calendarConnections).where(eq(calendarConnections.userId, item.doctor.userId)).limit(1))[0];
      if (!connection) { await db.update(calendarEvents).set({ state: "not_configured", lastError: "Google Calendar is not connected for this doctor." }).where(eq(calendarEvents.id, item.event.id)); continue; }
      const token = await accessToken(connection); const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendarId)}/events`;
      if (item.event.operation === "cancel") {
        if (item.event.externalEventId) { const result = await fetch(`${base}/${encodeURIComponent(item.event.externalEventId)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }); if (!result.ok && result.status !== 404) throw new Error("Google Calendar cancellation failed."); }
        await db.update(calendarEvents).set({ state: "cancelled", lastError: null }).where(eq(calendarEvents.id, item.event.id)); continue;
      }
      const payload = { summary: `Careline appointment`, description: `Appointment managed through Careline.`, start: { dateTime: item.appointment.startsAt.toISOString(), timeZone: item.appointment.timezone }, end: { dateTime: item.appointment.endsAt.toISOString(), timeZone: item.appointment.timezone } };
      const endpoint = item.event.externalEventId ? `${base}/${encodeURIComponent(item.event.externalEventId)}` : base;
      const result = await fetch(endpoint, { method: item.event.externalEventId ? "PUT" : "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!result.ok) throw new Error("Google Calendar event sync failed.");
      const saved = await result.json() as { id?: string };
      await db.update(calendarEvents).set({ state: "synced", externalEventId: saved.id ?? item.event.externalEventId, lastError: null }).where(eq(calendarEvents.id, item.event.id));
    } catch (error) { await db.update(calendarEvents).set({ state: "failed", lastError: error instanceof Error ? error.message : "Calendar sync failed." }).where(eq(calendarEvents.id, item.event.id)); }
  }
  return { processed: pending.length };
}
