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
  deletedAt?: string | null;
  editedAt?: string | null;
  sender: {
    id: string;
    username: string;
    avatarUrl: string | null;
  };
  readByCurrentUser?: boolean;
}

interface ChatWindowProps {
  conversationId: string;
  currentUserId: string;
  chatUserName: string;
}

interface SocketResponse {
  success: boolean;
  error?: string;
}

export default function ChatWindow({ conversationId, currentUserId, chatUserName }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState("");

  const [loading, setLoading] = useState(true);
  const [readMessages, setReadMessages] = useState<Set<string>>(new Set());

  const [socketReady, setSocketReady] = useState(false);

  const [roomReady, setRoomReady] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const roomReadyRef = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const readMessagesRef = useRef<Set<string>>(new Set());

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [deleteMessageId, setDeleteMessageId] = useState<string | null>(null);

  /*
   * Load existing messages
   */
  useEffect(() => {
    let mounted = true;

    async function loadMessages() {
      setLoading(true);

      try {
        const response = await fetch(`/api/conversations/${conversationId}/messages`,
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
          const loadedMessages: Message[] = data.messages ?? [];

          const restoredReadMessages = new Set<string>();

          for (const message of loadedMessages) {
            if (message.senderId === currentUserId && message.readByCurrentUser === true) {
              restoredReadMessages.add(message.id);
            }
          }

          readMessagesRef.current = restoredReadMessages;

          setReadMessages(restoredReadMessages);

          setMessages((previousMessages) => {
            const merged = new Map<string, Message>();

            for (const message of loadedMessages) {
              merged.set(message.id, message);
            }

            for (const message of previousMessages) {
              merged.set(message.id, message);
            }

            return Array.from(merged.values()).sort(
              (a, b) =>
                new Date(a.createdAt).getTime() -
                new Date(b.createdAt).getTime()
            );
          });
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

          if (joined) {
            return;
          }

          socket.emit("conversation:join", conversationId, (response: SocketResponse) => {
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

            roomReadyRef.current = true;
            setRoomReady(true);

            markConversationAsRead(socket);

          }
          );
        };

        /*
         * New realtime message
         */
        const handleNewMessage = (message: Message) => {
          if (message.conversationId !== conversationId) {
            return;
          }

          setMessages((previousMessages) => {
            const exists = previousMessages.some(
              (existingMessage) => existingMessage.id === message.id
            );

            if (exists) {
              return previousMessages;
            }

            return [...previousMessages, message];
          });
        };

        const handleMessageRead = (data: {
          messageId: string;
          conversationId: string;
          userId: string;
          readAt: string;
        }) => {
          if (
            data.conversationId !== conversationId
          ) {
            return;
          }

          setReadMessages((previous) => {
            const next = new Set(previous);
            next.add(data.messageId);
            return next;
          });
        };

        const handleMessageDeleted = (data: {
          messageId: string;
          conversationId: string;
          deletedAt: string;
        }) => {
          if (
            data.conversationId !== conversationId
          ) {
            return;
          }

          setMessages((previous) =>
            previous.map((message) =>
              message.id === data.messageId
                ? {
                  ...message,
                  content: "",
                  deletedAt: data.deletedAt,
                }
                : message
            )
          );
        };

        const handleMessageEdited = (data: {
          id: string;
          conversationId: string;
          senderId: string;
          content: string;
          createdAt: string;
          updatedAt: string;
          deletedAt: string | null;
          editedAt: string | null;
        }) => {
          if (
            data.conversationId !== conversationId
          ) {
            return;
          }

          setMessages((previous) =>
            previous.map((message) =>
              message.id === data.id
                ? {
                  ...message,
                  content: data.content,
                  updatedAt: data.updatedAt,
                  editedAt: data.editedAt,
                  deletedAt: data.deletedAt,
                }
                : message
            )
          );
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

          joined = false;
          roomReadyRef.current = false;
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
          roomReadyRef.current = false;
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
          roomReadyRef.current = false;
          setRoomReady(false);
        };

        socket.on("message:new", handleNewMessage);

        socket.on("connect", handleConnect);

        socket.on("message:read", handleMessageRead);

        socket.on("message:edited", handleMessageEdited);

        socket.on("message:deleted", handleMessageDeleted);

        socket.on("disconnect", handleDisconnect);

        socket.on("connect_error", handleConnectError);

        if (socket.connected) {
          console.log("🟢 Socket already connected:", socket.id);

          setSocketReady(true);

          joinConversation();
        } else {
          console.log("🟡 Socket not connected yet. Waiting for connect...");

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

            currentSocket.emit("conversation:leave", conversationId);

            currentSocket.off("message:new", handleNewMessage);

            currentSocket.off("connect", handleConnect);
            currentSocket.off("message:read", handleMessageRead);
            currentSocket.off("message:deleted", handleMessageDeleted);
            currentSocket.off("message:edited", handleMessageEdited);

            currentSocket.off("disconnect", handleDisconnect);
            currentSocket.off("connect_error", handleConnectError);
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

  function markConversationAsRead(socket: Socket) {
    if (!socket.connected || !conversationId) {
      return;
    }

    socket.emit("conversation:read", conversationId);
  }

  function markMessageAsRead(socket: Socket, messageId: string) {
    if (!socket.connected || !messageId) {
      return;
    }

    if (readMessagesRef.current.has(messageId)) {
      return;
    }

    readMessagesRef.current.add(messageId);

    socket.emit("message:read", messageId, (response: SocketResponse) => {
      if (!response.success) {

        readMessagesRef.current.delete(
          messageId
        );

        console.error("❌ Failed to mark message as read:",
          {
            messageId,
            error: response.error,
          }
        );
        return;
      }
      console.log("📖 Message marked as read:", messageId);
    }
    );
  }

  function requestDeleteMessage(
    messageId: string
  ) {
    setDeleteMessageId(messageId);
  }

  function confirmDeleteMessage() {
    const socket = socketRef.current;

    if (
      !socket ||
      !socket.connected ||
      !deleteMessageId
    ) {
      return;
    }

    socket.emit(
      "message:delete",
      deleteMessageId,
      (response: SocketResponse) => {
        if (!response.success) {
          console.error(
            "❌ Failed to delete message:",
            response.error
          );
          return;
        }

        setDeleteMessageId(null);
      }
    );
  }

  function cancelDeleteMessage() {
    setDeleteMessageId(null);
  }

  function startEditingMessage(
    message: Message
  ) {
    if (
      message.senderId !== currentUserId ||
      message.deletedAt
    ) {
      return;
    }

    setEditingMessageId(message.id);
    setEditingContent(message.content);
  }

  function cancelEditingMessage() {
    setEditingMessageId(null);
    setEditingContent("");
  }

  function saveEditedMessage() {
    const socket = socketRef.current;

    const trimmed =
      editingContent.trim();

    if (
      !socket ||
      !socket.connected ||
      !editingMessageId ||
      !trimmed
    ) {
      return;
    }

    socket.emit(
      "message:edit",
      {
        messageId: editingMessageId,
        content: trimmed,
      },
      (response: SocketResponse) => {
        if (!response.success) {
          console.error(
            "❌ Failed to edit message:",
            response.error
          );
          return;
        }

        setEditingMessageId(null);
        setEditingContent("");
      }
    );
  }

  useEffect(() => {
    const socket = socketRef.current;

    if (!socket || !socket.connected || !roomReady) {
      return;
    }

    for (const message of messages) {
      if (message.senderId === currentUserId) {
        continue;
      }

      markMessageAsRead(socket, message.id);
    }
  }, [messages, currentUserId, roomReady]);

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

      socket.emit("send_message",
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
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-white">
            {chatUserName}
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
                            message.sender.username
                          }
                        </p>
                      )}

                      {own && !message.deletedAt && (
                        <div className="mb-2 flex justify-end gap-1">
                          <button
                            onClick={() =>
                              startEditingMessage(message)
                            }
                            className="rounded-md px-2 py-1 text-[10px] text-slate-700 hover:bg-black/10"
                          >
                            Edit
                          </button>

                          <button
                            onClick={() =>
                              requestDeleteMessage(message.id)
                            }
                            className="rounded-md px-2 py-1 text-[10px] text-red-700 hover:bg-black/10"
                          >
                            Delete
                          </button>
                        </div>
                      )}

                      {message.deletedAt ? (
                        <p className="text-sm italic opacity-60">
                          This message was deleted
                        </p>
                      ) : editingMessageId === message.id ? (
                        <div className="min-w-[240px]">
                          <textarea
                            value={editingContent}
                            onChange={(event) =>
                              setEditingContent(
                                event.target.value
                              )
                            }
                            autoFocus
                            className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                            rows={3}
                          />

                          <div className="mt-2 flex justify-end gap-2">
                            <button
                              onClick={cancelEditingMessage}
                              className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:bg-white/10"
                            >
                              Cancel
                            </button>

                            <button
                              onClick={saveEditedMessage}
                              disabled={!editingContent.trim()}
                              className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-end gap-2">
                          <p className="wrap-break-word text-sm">
                            {message.content}
                          </p>

                          {message.editedAt && (
                            <span className="shrink-0 text-[10px] opacity-50">
                              edited
                            </span>
                          )}

                          {own && (
                            <span
                              className={`text-[11px] ${readMessages.has(message.id)
                                ? "text-blue-900"
                                : "text-slate-700"
                                }`}
                              title={
                                readMessages.has(message.id)
                                  ? "Read"
                                  : "Sent"
                              }
                            >
                              {readMessages.has(message.id)
                                ? "✓✓"
                                : "✓"}
                            </span>
                          )}
                        </div>
                      )}
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
      {deleteMessageId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">
              Delete message?
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              Message deleted will be deleted for both users.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={cancelDeleteMessage}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/5"
              >
                Cancel
              </button>

              <button
                onClick={confirmDeleteMessage}
                className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-400"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}