"use client";

import { useEffect, useRef, useState } from "react";

import { getSocket } from "@/lib/socket";
import type { Socket } from "socket.io-client";

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  sender: {
    id: string;
    username: string;
    avatarUrl: string | null;
  };
}

interface ChatWindowProps {
  conversationId: string;
  currentUserId: string;
}

interface SocketResponse {
  success: boolean;
  error?: string;
}

export default function ChatWindow({
  conversationId,
  currentUserId,
}: ChatWindowProps) {
  const [messages, setMessages] =
    useState<Message[]>([]);

  const [content, setContent] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [socketReady, setSocketReady] =
    useState(false);

  const [roomReady, setRoomReady] =
    useState(false);

  const socketRef =
    useRef<Socket | null>(null);

  const messagesEndRef =
    useRef<HTMLDivElement>(null);

  /*
   * Load existing messages
   */
  useEffect(() => {
    let mounted = true;

    async function loadMessages() {
      setLoading(true);

      try {
        const response = await fetch(
          `/api/conversations/${conversationId}/messages`,
          {
            cache: "no-store",
          }
        );

        if (!response.ok) {
          console.error(
            " Failed to load messages:",
            response.status
          );

          return;
        }

        const data = await response.json();

        if (mounted) {
          setMessages(
            data.messages ?? []
          );
        }
      } catch (error) {
        console.error(
          " Failed to load messages:",
          error
        );
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadMessages();

    return () => {
      mounted = false;
    };
  }, [conversationId]);

  /*
   * Socket lifecycle
   */
  useEffect(() => {
    let mounted = true;
    let currentSocket: Socket | null = null;
    let joined = false;

    async function setupSocket() {
      try {
        const socket =
          await getSocket();

        if (!mounted) {
          return;
        }

        currentSocket = socket;
        socketRef.current = socket;

        /*
         * Join the current conversation.
         */
        const joinConversation = () => {
          if (!mounted) {
            return;
          }

          if (!socket.connected) {
            console.log("⚠️ Cannot join conversation: socket is not connected");

            setSocketReady(false);
            setRoomReady(false);

            return;
          }

          /*
           * Prevent duplicate joins during
           * the same connection.
           */
          if (joined) {
            return;
          }

          socket.emit(
            "conversation:join",
            conversationId,
            (
              response: SocketResponse
            ) => {
              if (!mounted) {
                return;
              }

              if (!response.success) {
                joined = false;

                setRoomReady(false);

                console.error(
                  " Failed to join conversation:",
                  response.error
                );

                return;
              }

              joined = true;

              setRoomReady(true);

              console.log(
                "✅ Joined conversation:",
                {
                  conversationId,
                  socketId: socket.id,
                }
              );
            }
          );
        };

        /*
         * New realtime message
         */
        const handleNewMessage = ( message: Message ) => {

          if (
            message.conversationId !==
            conversationId
          ) {

            return;
          }

          setMessages(
            (previousMessages) => {
              const exists =
                previousMessages.some(
                  (existingMessage) =>
                    existingMessage.id ===
                    message.id
                );

              if (exists) {
                return previousMessages;
              }

              return [ ...previousMessages, message, ];
            }
          );
          void fetch(`/api/conversations/${conversationId}/read`, { method: "POST", });
        };

        /*
         * Socket connected
         */
        const handleConnect = () => {
          console.log(
            "🟢 ChatWindow socket connected:",
            socket.id
          );

          setSocketReady(true);

          /*
           * A reconnect creates a new
           * Socket.IO connection, so the
           * conversation room must be
           * joined again.
           */
          joined = false;
          setRoomReady(false);

          joinConversation();
        };

        /*
         * Socket disconnected
         */
        const handleDisconnect = (
          reason: string
        ) => {
          console.log(
            "🟠 ChatWindow socket disconnected:",
            reason
          );

          joined = false;

          setSocketReady(false);
          setRoomReady(false);
        };

        /*
         * Connection errors
         */
        const handleConnectError = (
          error: Error
        ) => {
          console.error(
            "🔴 ChatWindow socket connection error:",
            error.message
          );

          setSocketReady(false);
          setRoomReady(false);
        };

        socket.on(
          "message:new",
          handleNewMessage
        );

        socket.on(
          "connect",
          handleConnect
        );

        socket.on(
          "disconnect",
          handleDisconnect
        );

        socket.on(
          "connect_error",
          handleConnectError
        );

        if (socket.connected) {
          console.log(
            "🟢 Socket already connected:",
            socket.id
          );

          setSocketReady(true);

          joinConversation();
        } else {
          console.log(
            "🟡 Socket not connected yet. Waiting for connect..."
          );

          setSocketReady(false);
          setRoomReady(false);

          socket.connect();
        }

        /*
         * Cleanup when conversation changes
         * or component unmounts.
         */
        return () => {
          mounted = false;

          if (currentSocket) {

            currentSocket.emit(
              "conversation:leave",
              conversationId
            );

            currentSocket.off(
              "message:new",
              handleNewMessage
            );

            currentSocket.off(
              "connect",
              handleConnect
            );

            currentSocket.off(
              "disconnect",
              handleDisconnect
            );

            currentSocket.off(
              "connect_error",
              handleConnectError
            );
          }

          socketRef.current = null;
        };
      } catch (error) {
        console.error(
          "❌ Failed to initialize chat socket:",
          error
        );

        if (mounted) {
          setSocketReady(false);
          setRoomReady(false);
        }
      }
    }

    setupSocket();

    return () => {
      mounted = false;
    };
  }, [conversationId]);

  useEffect(() => {
    async function markAsRead() {
      try {
        const response = await fetch(
          `/api/conversations/${conversationId}/read`,
          {
            method: "POST",
          }
        );

        if (!response.ok) {
          console.error(
            "Failed to mark conversation as read:",
            response.status
          );

          return;
        }

        console.log(
          "✅ Conversation marked as read:",
          conversationId
        );
      } catch (error) {
        console.error(
          "Mark conversation read error:",
          error
        );
      }
    }

    void markAsRead();
  }, [conversationId]);

  /*
   * Auto-scroll
   */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  /*
   * Send message
   */
  async function sendMessage() {
    const trimmed =
      content.trim();

    if (!trimmed) {
      return;
    }

    try {
      const socket =
        socketRef.current ??
        (await getSocket());

      socketRef.current = socket;

      if (!socket.connected) {
        console.error(
          " Cannot send message: socket is not connected"
        );

        return;
      }

      if (!roomReady) {
        console.error(
          "❌ Cannot send message: conversation room is not ready"
        );

        return;
      }

      socket.emit(
        "send_message",
        {
          conversationId,
          content: trimmed,
        },
        (
          response: SocketResponse
        ) => {

          if (!response.success) {
            console.error(
              "❌ Failed to send message:",
              response.error
            );

            return;
          }

          setContent("");
        }
      );
    } catch (error) {
      console.error(
        " Failed to send message:",
        error
      );
    }
  }

  return (
    <div className="flex h-150 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5">

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div>
          <h2 className="font-semibold text-white">
            Conversation
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            {roomReady
              ? "Realtime connected"
              : socketReady
                ? "Joining conversation..."
                : "Connecting..."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${roomReady
                ? "bg-emerald-400"
                : socketReady
                  ? "bg-amber-400"
                  : "bg-red-400"
              }`}
          />

          <span className="text-xs text-slate-400">
            {roomReady
              ? "Live"
              : socketReady
                ? "Joining"
                : "Offline"}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <p className="text-sm text-slate-500">
            Loading messages...
          </p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-slate-500">
            No messages yet.
          </p>
        ) : (
          <div className="space-y-3">
            {messages.map(
              (message) => {
                const own =
                  message.senderId ===
                  currentUserId;

                return (
                  <div
                    key={message.id}
                    className={`flex ${own
                        ? "justify-end"
                        : "justify-start"
                      }`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-3 ${own
                          ? "bg-cyan-500 text-slate-950"
                          : "bg-slate-800 text-white"
                        }`}
                    >
                      {!own && (
                        <p className="mb-1 text-xs font-medium opacity-60">
                          {
                            message
                              .sender
                              .username
                          }
                        </p>
                      )}

                      <p className="wrap-break-word text-sm">
                        {message.content}
                      </p>
                    </div>
                  </div>
                );
              }
            )}

            <div
              ref={messagesEndRef}
            />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-white/10 p-4">
        <div className="flex gap-3">
          <input
            value={content}
            onChange={(event) =>
              setContent(
                event.target.value
              )
            }
            onKeyDown={(event) => {
              if (
                event.key ===
                "Enter" &&
                !event.shiftKey
              ) {
                event.preventDefault();
                sendMessage();
              }
            }}
            placeholder={
              roomReady
                ? "Type a message..."
                : "Connecting to conversation..."
            }
            disabled={!roomReady}
            className="flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          />

          <button
            onClick={sendMessage}
            disabled={
              !content.trim() ||
              !roomReady
            }
            className="rounded-xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400  disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}