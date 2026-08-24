import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ exchangeCodeForToken: vi.fn(), getUserInfo: vi.fn(), createSessionToken: vi.fn(), upsertUser: vi.fn() }));
vi.mock("./_core/sdk", () => ({ sdk: { exchangeCodeForToken: mocks.exchangeCodeForToken, getUserInfo: mocks.getUserInfo, createSessionToken: mocks.createSessionToken } }));
vi.mock("./db", () => ({ upsertUser: mocks.upsertUser }));

import { registerOAuthRoutes } from "./_core/oauth";
import { COOKIE_NAME, encodeOAuthState, OAUTH_STATE_COOKIE } from "../shared/const";

type Handler = (req: any, res: any) => Promise<void>;
function callbackHandler() { let handler: Handler | undefined; registerOAuthRoutes({ get: (_path: string, fn: Handler) => { handler = fn; } } as any); if (!handler) throw new Error("OAuth callback was not registered"); return handler; }
function response() { const res: any = { status: vi.fn(), json: vi.fn(), clearCookie: vi.fn(), cookie: vi.fn(), redirect: vi.fn() }; res.status.mockReturnValue(res); return res; }

describe("OAuth callback", () => {
  it("rejects a callback whose state nonce does not match the browser cookie", async () => {
    const handler = callbackHandler(); const res = response();
    await handler({ query: { code: "code", state: encodeOAuthState({ redirectUri: "/", nonce: "correct" }) }, headers: { cookie: `${OAUTH_STATE_COOKIE}=wrong` } }, res);
    expect(res.status).toHaveBeenCalledWith(403); expect(res.json).toHaveBeenCalledWith({ error: "invalid oauth state" });
  });

  it("completes a verified callback by upserting the user and setting a signed session cookie", async () => {
    mocks.exchangeCodeForToken.mockResolvedValue({ accessToken: "provider-token" }); mocks.getUserInfo.mockResolvedValue({ openId: "oauth-patient", name: "OAuth Patient", email: "patient@example.invalid", loginMethod: "manus" }); mocks.createSessionToken.mockResolvedValue("signed-session-token");
    const nonce = "nonce-123"; const handler = callbackHandler(); const res = response();
    await handler({ protocol: "https", query: { code: "code", state: encodeOAuthState({ redirectUri: "/", nonce }) }, headers: { cookie: `${OAUTH_STATE_COOKIE}=${nonce}` } }, res);
    expect(mocks.upsertUser).toHaveBeenCalledWith(expect.objectContaining({ openId: "oauth-patient", email: "patient@example.invalid" }));
    expect(mocks.createSessionToken).toHaveBeenCalledWith("oauth-patient", expect.objectContaining({ name: "OAuth Patient" }));
    expect(res.cookie).toHaveBeenCalledWith(COOKIE_NAME, "signed-session-token", expect.objectContaining({ httpOnly: true, maxAge: expect.any(Number) }));
    expect(res.redirect).toHaveBeenCalledWith(302, "/");
  });
});
