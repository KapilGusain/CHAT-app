import { SignJWT, jwtVerify } from "jose";

const REALTIME_TOKEN_TYPE = "realtime";
const REALTIME_TOKEN_EXPIRY = "5m";

function getRealtimeSecret() {
  const secret = process.env.REALTIME_AUTH_SECRET;

  if (!secret) {
    throw new Error(
      "REALTIME_AUTH_SECRET is not configured"
    );
  }

  return new TextEncoder().encode(secret);
}

export async function createRealtimeToken(
  userId: string
) {
  if (!userId) {
    throw new Error(
      "Cannot create realtime token without userId"
    );
  }

  return new SignJWT({
    type: REALTIME_TOKEN_TYPE,
    userId,
  })
    .setProtectedHeader({
      alg: "HS256",
    })
    .setIssuedAt()
    .setExpirationTime(REALTIME_TOKEN_EXPIRY)
    .sign(getRealtimeSecret());
}

export async function verifyRealtimeToken(
  token: string
) {
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