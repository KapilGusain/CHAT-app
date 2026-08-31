// import { pubClient } from "./redis.js";

// function connectionKey(userId: string) {
//   return `user:${userId}:connections`;
// }

// /*
//  * A Set is used so the same socket ID cannot be accidentally counted twice.
//  */
// export async function addConnection(
//   userId: string,
//   socketId: string
// ) {
//   const key = connectionKey(userId);

//   await pubClient.sAdd(key, socketId);

//   /*
//    * This protects against stale keys if a server crashes without receiving the disconnect event.
//    */
//   await pubClient.expire(key, 60 * 60 * 24);

//   return {
//     userId,
//     socketId,
//     online: true,
//   };
// }

// /*
//  * The user only becomes offline when there are no remaining active sockets.
//  */
// export async function removeConnection(
//   userId: string,
//   socketId: string
// ) {
//   const key = connectionKey(userId);

//   await pubClient.sRem(key, socketId);

//   const count = await pubClient.sCard(key);

//   if (count === 0) {
//     await pubClient.del(key);

//     return {
//       online: false,
//       connectionCount: 0,
//     };
//   }

//   return {
//     online: true,
//     connectionCount: count,
//   };
// }

// /*
//  * Check whether a user currently has at least one active realtime connection.
//  */
// export async function isUserOnline(
//   userId: string
// ) {
//   const key = connectionKey(userId);

//   const count = await pubClient.sCard(key);

//   return count > 0;
// }

// /*
//  * Get the number of active connections.
//  */
// export async function getConnectionCount(
//   userId: string
// ) {
//   const key = connectionKey(userId);

//   return pubClient.sCard(key);
// }
