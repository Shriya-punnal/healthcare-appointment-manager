import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("authenticated context", () => {
  it("returns the currently authenticated user only from server context", async () => {
    const user: NonNullable<TrpcContext["user"]> = { id: 31, openId: "authenticated-user", name: "Authenticated Test", email: "test@example.invalid", loginMethod: "manus", role: "patient", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
    const ctx: TrpcContext = { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: () => undefined } as TrpcContext["res"] };
    await expect(appRouter.createCaller(ctx).auth.me()).resolves.toMatchObject({ id: 31, role: "patient", openId: "authenticated-user" });
  });
});
