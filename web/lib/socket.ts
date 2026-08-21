import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;
let socketPromise: Promise<Socket> | null = null;

export async function getSocket(): Promise<Socket> {
  if (socket) {
    return socket;
  }

  if (socketPromise) {
    return socketPromise;
  }

  socketPromise = initializeSocket();

  try {
    socket = await socketPromise;
    return socket;
  } catch (error) {
    socketPromise = null;
    throw error;
  }
}

async function initializeSocket(): Promise<Socket> {
  const response = await fetch(
    "/api/realtime/token",
    {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    }
  );

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(
        "You must be signed in to connect to realtime services"
      );
    }

    throw new Error(
      `Failed to obtain realtime token (${response.status})`
    );
  }

  const data: {
    token?: string;
  } = await response.json();

  if (!data.token) {
    throw new Error(
      "Realtime token missing from server response"
    );
  }

  const socketUrl =
    process.env.NEXT_PUBLIC_SOCKET_URL ??
    "http://localhost:5000";

  return io(socketUrl, {
    autoConnect: false,

    auth: {
      token: data.token,
    },

    withCredentials: true,

    transports: ["websocket"],
  });
}

export function disconnectSocket() {
  if (!socket) {
    return;
  }

  socket.disconnect();
  socket = null;
  socketPromise = null;
}