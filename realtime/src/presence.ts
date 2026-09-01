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

  return {
    userId,
    socketId,
  };
}

export async function removeConnection(userId: string, socketId: string) {
  const key = connectionKey(userId);

  await pubClient.sRem(key, socketId);
  const connectionCount = await pubClient.sCard(key);

  if (connectionCount === 0) {
    await pubClient.del(key);
    return {
      connectionCount: 0,
    };
  }

  return {
    connectionCount,
  };
}

/*
 * Synchronize Valkey with Socket.io
 */
export async function syncConnections(userId: string, activeSocketIds: string[]) {
  const key = connectionKey(userId);

  if (activeSocketIds.length === 0) {
    await pubClient.del(key);

    return {
      connectionCount: 0,
    };
  }

  await pubClient.del(key);
  await pubClient.sAdd(key, activeSocketIds);
  await pubClient.expire(key, 60 * 60 * 24);

  return {
    connectionCount: activeSocketIds.length,
  };
}

export async function isUserOnline(
  userId: string
) {
  const key = connectionKey(userId);

  const count = await pubClient.sCard(key);

  return count > 0;
}

export async function getConnectionCount( userId: string ) {
  const key = connectionKey(userId);

  return pubClient.sCard(key);
}