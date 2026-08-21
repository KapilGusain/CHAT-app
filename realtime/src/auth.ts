import { jwtVerify } from "jose";

const REALTIME_TOKEN_TYPE = "realtime";

function getRealtimeSecret() {
  const secret = process.env.REALTIME_AUTH_SECRET;

  if (!secret) {
    throw new Error(
      "REALTIME_AUTH_SECRET is not configured"
    );
  }

  return new TextEncoder().encode(secret);
}

export async function verifyRealtimeToken(
  token: string
) {
  if (!token) {
    throw new Error(
      "Realtime token is missing"
    );
  }

  const { payload } = await jwtVerify(
    token,
    getRealtimeSecret(),
    {
      algorithms: ["HS256"],
    }
  );

  if (
    payload.type !== REALTIME_TOKEN_TYPE ||
    typeof payload.userId !== "string"
  ) {
    throw new Error(
      "Invalid realtime token"
    );
  }

  return {
    userId: payload.userId,
  };
}