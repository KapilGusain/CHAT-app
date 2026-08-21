"use client";

import {
  useEffect,
  useState,
} from "react";

import { getSocket } from "@/lib/socket";

interface SocketProviderProps {
  children: React.ReactNode;
}

export function SocketProvider({
  children,
}: SocketProviderProps) {
  const [status, setStatus] =
    useState<
      "connecting" | "connected" | "disconnected" | "error"
    >("connecting");

  useEffect(() => {
    let mounted = true;

    async function connectSocket() {
      try {
        const socket =
          await getSocket();

        if (!mounted) {
          return;
        }

        const handleConnect = () => {
          console.log(
            "🟢 Socket connected:",
            socket.id
          );

          setStatus("connected");
        };

        const handleConnectError = (
          error: Error
        ) => {
          console.error(
            "🔴 Socket connection error:",
            error.message
          );

          setStatus("error");
        };

        const handleDisconnect = (
          reason: string
        ) => {
          console.log(
            "🟠 Socket disconnected:",
            reason
          );

          setStatus("disconnected");
        };

        socket.on(
          "connect",
          handleConnect
        );

        socket.on(
          "connect_error",
          handleConnectError
        );

        socket.on(
          "disconnect",
          handleDisconnect
        );

        if (socket.connected) {
          setStatus("connected");
        } else {
          setStatus("connecting");
          socket.connect();
        }

        return () => {
          socket.off(
            "connect",
            handleConnect
          );

          socket.off(
            "connect_error",
            handleConnectError
          );

          socket.off(
            "disconnect",
            handleDisconnect
          );
        };
      } catch (error) {
        console.error(
          "❌ Failed to initialize socket:",
          error
        );

        if (mounted) {
          setStatus("error");
        }
      }
    }

    const cleanupPromise =
      connectSocket();

    return () => {
      mounted = false;

      cleanupPromise.then(
        (cleanup) => {
          cleanup?.();
        }
      );
    };
  }, []);

  return (
    <>
      {children}

      {process.env.NODE_ENV ===
        "development" && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[9999]">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/90 px-3 py-2 text-xs text-white shadow-xl backdrop-blur">
            <span
              className={`h-2 w-2 rounded-full ${
                status === "connected"
                  ? "bg-emerald-400"
                  : status === "connecting"
                    ? "bg-amber-400"
                    : status === "error"
                      ? "bg-red-400"
                      : "bg-slate-500"
              }`}
            />

            <span className="capitalize text-slate-300">
              Realtime: {status}
            </span>
          </div>
        </div>
      )}
    </>
  );
}