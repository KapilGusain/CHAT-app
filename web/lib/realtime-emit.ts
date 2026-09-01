const REALTIME_SERVER_URL = process.env.REALTIME_SERVER_URL ?? "http://localhost:4000";

export async function emitToUser(
  userId: string,
  event: string,
  payload: unknown
) {
  try {
    await fetch(`${REALTIME_SERVER_URL}/internal/emit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.REALTIME_INTERNAL_SECRET ?? "",
      },
      body: JSON.stringify({
        room: `user:${userId}`,
        event,
        payload,
      }),
    });
  } catch (error) {
    console.error(`Failed to emit "${event}" to user ${userId}:`, error);
  }
}