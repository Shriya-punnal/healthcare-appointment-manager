import { eq } from "drizzle-orm";
import { z } from "zod";
import { calendarConnections } from "../../drizzle/schema";
import { getDb } from "../db";
import { getGoogleAuthorizationUrl } from "../services/calendar";
import { router } from "../_core/trpc";
import { roleProcedure } from "./role";

export const calendarRouter = router({
  status: roleProcedure("doctor", "admin").query(async ({ ctx }) => {
    const db = await getDb(); if (!db) return { configured: false, connected: false };
    const connection = (await db.select({ id: calendarConnections.id, expiresAt: calendarConnections.expiresAt }).from(calendarConnections).where(eq(calendarConnections.userId, ctx.user.id)).limit(1))[0];
    return { configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI), connected: Boolean(connection), expiresAt: connection?.expiresAt ?? null };
  }),
  authorize: roleProcedure("doctor", "admin").input(z.void()).mutation(({ ctx }) => ({ url: getGoogleAuthorizationUrl(ctx.user.id), configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI) })),
});
