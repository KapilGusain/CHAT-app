"use client";

import { useEffect, useState } from "react";
import {getSocket, disconnectSocket } from "@/lib/socket";
import type { Socket } from "socket.io-client";

interface SocketProviderProps {
  children: React.ReactNode;
}

let providerGeneration = 0;

export function SocketProvider({ children }: SocketProviderProps) {
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("connecting");

  useEffect(() => {
    const generation = ++providerGeneration;

    let mounted = true;
    let providerSocket: Socket | null = null;

    async function connectSocket() {
      try {
        const socket = await getSocket();

        if (!mounted || generation !== providerGeneration) {
          return;
        }

        providerSocket = socket;

        const handleConnect = () => {
          if (!mounted || generation !== providerGeneration) {
            return;
          }

          console.log(
            " Socket connected:",
            socket.id
          );

          setStatus("connected");
        };

        const handleConnectError = (
          error: Error
        ) => {
          if (
            !mounted ||
            generation !== providerGeneration
          ) {
            return;
          }

          console.error(
            " Socket connection error:",
            error.message
          );

          setStatus("error");
        };

        const handleDisconnect = (
          reason: string
        ) => {
          if (
            !mounted ||
            generation !== providerGeneration
          ) {
            return;
          }

          console.log(
            " Socket disconnected:",
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

          console.log(
            " Socket already connected:",
            socket.id
          );
        } else {
          setStatus("connecting");

          console.log(
            " SocketProvider connecting socket..."
          );

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
        if (
          !mounted ||
          generation !== providerGeneration
        ) {
          return;
        }

        console.error(
          " Failed to initialize socket:",
          error
        );

        setStatus("error");
      }
    }

    let listenerCleanup:
      (() => void) | undefined;

    void connectSocket().then((cleanup) => {
      
      if (
        !mounted ||
        generation !== providerGeneration
      ) {
        cleanup?.();
        return;
      }

      listenerCleanup = cleanup;
    });

    return () => {
      mounted = false;

      if (generation !== providerGeneration) {
        return;
      }

      listenerCleanup?.();
      disconnectSocket(providerSocket ?? undefined);
    };
  }, []);

  return (
    <>
      {children}

      {process.env.NODE_ENV ===
        "development" && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-9999">
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
              My Status: {status}
            </span>
          </div>
        </div>
      )}
    </>
  );
}