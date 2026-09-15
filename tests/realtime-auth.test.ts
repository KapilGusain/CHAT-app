import { afterEach, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { verifyRealtimeToken } from "../realtime/src/auth";

const TEST_SECRET = "test-realtime-secret";

function signToken(payload: Record<string, unknown>) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(TEST_SECRET));
}

describe("verifyRealtimeToken", () => {
  afterEach(() => {
    delete process.env.REALTIME_AUTH_SECRET;
  });

  it("rejects a missing token", async () => {
    process.env.REALTIME_AUTH_SECRET = TEST_SECRET;

    await expect(
      verifyRealtimeToken("")
    ).rejects.toThrow("Realtime token is missing");
  });

  it("rejects when the realtime secret is missing", async () => {
    await expect(
      verifyRealtimeToken("some-token")
    ).rejects.toThrow("REALTIME_AUTH_SECRET is not configured");
  });

  it("rejects an invalid token signature", async () => {
    process.env.REALTIME_AUTH_SECRET = TEST_SECRET;

    const token = await new SignJWT({
      type: "realtime",
      userId: "user-123",
    })
      .setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode("wrong-secret"));

    await expect(
      verifyRealtimeToken(token)
    ).rejects.toThrow();
  });

  it("rejects a token with the wrong token type", async () => {
    process.env.REALTIME_AUTH_SECRET = TEST_SECRET;

    const token = await signToken({
      type: "access",
      userId: "user-123",
    });

    await expect(
      verifyRealtimeToken(token)
    ).rejects.toThrow("Invalid realtime token");
  });

  it("rejects a token without a valid userId", async () => {
    process.env.REALTIME_AUTH_SECRET = TEST_SECRET;

    const token = await signToken({
      type: "realtime",
      userId: 123,
    });

    await expect(
      verifyRealtimeToken(token)
    ).rejects.toThrow("Invalid realtime token");
  });

  it("accepts a valid realtime token", async () => {
    process.env.REALTIME_AUTH_SECRET = TEST_SECRET;

    const token = await signToken({
      type: "realtime",
      userId: "user-123",
    });

    await expect(
      verifyRealtimeToken(token)
    ).resolves.toEqual({
      userId: "user-123",
    });
  });
});