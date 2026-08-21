import { pubClient } from "./redis.js";

function connectionKey(userId: string) {
  return `user:${userId}:connections`;
}

export async function addConnection(
  userId: string,
  socketId: string
) {
  const key = connectionKey(userId);

  await pubClient.sAdd(key, socketId);

  await pubClient.expire(key, 60 * 60 * 24);
}

export async function removeConnection(
  userId: string,
  socketId: string
) {
  const key = connectionKey(userId);

  await pubClient.sRem(key, socketId);

  const count = await pubClient.sCard(key);

  if (count === 0) {
    await pubClient.del(key);

    return false;
  }

  return true;
}

export async function isUserOnline(userId: string) {
  const key = connectionKey(userId);

  const count = await pubClient.sCard(key);

  return count > 0;
}