"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import type { Socket } from "socket.io-client";

interface User {
  id: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  status: "ONLINE" | "OFFLINE" | "AWAY";
  lastSeenAt: string | null;
}

interface ConversationMember {
  id: string;
  userId: string;
  user: User;
}

interface LastMessage {
  id: string;
  content: string;
  senderId: string;
  createdAt: string;
  deletedAt: string | null;
}

interface Conversation {
  id: string;
  type: "DIRECT" | "GROUP";
  name: string | null;
  createdAt: string;
  updatedAt: string;
  members: ConversationMember[];
  messages: LastMessage[];
  unreadCount: number;
}

interface ConversationListProps {
  currentUserId: string;
}

export default function ConversationList({
  currentUserId,
}: ConversationListProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [conversations, setConversations] =
    useState<Conversation[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    let mounted = true;
    let socket: Socket | null = null;

    async function loadConversations() {
      try {
        const response = await fetch(
          "/api/conversations",
          {
            cache: "no-store",
          }
        );

        if (!response.ok) {
          throw new Error(
            "Failed to load conversations"
          );
        }

        const data =
          await response.json();

        if (mounted) {
          setConversations(
            data.conversations ?? []
          );

          setError("");
        }
      } catch (error) {
        console.error(
          "Load conversations error:",
          error
        );

        if (mounted) {
          setError(
            "Unable to load conversations."
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    async function setupRealtime() {
      try {
        socket = await getSocket();

        if (!mounted) {
          return;
        }

        const handleConversationUpdated = () => {
          console.log(
            "🔄 Conversation list updated"
          );

          void loadConversations();
        };

        socket.on(
          "conversation:updated",
          handleConversationUpdated
        );

        return () => {
          socket?.off(
            "conversation:updated",
            handleConversationUpdated
          );
        };
      } catch (error) {
        console.error(
          "Conversation list realtime error:",
          error
        );
      }
    }

    void loadConversations();

    let realtimeCleanup:
      | (() => void)
      | undefined;

    void setupRealtime().then(
      (cleanup) => {
        realtimeCleanup = cleanup;
      }
    );

    return () => {
      mounted = false;
      realtimeCleanup?.();
    };
  }, []);

  function getOtherMember(
    conversation: Conversation
  ) {
    return conversation.members.find(
      (member) =>
        member.userId !== currentUserId
    );
  }

  function getConversationName(
    conversation: Conversation
  ) {
    if (conversation.type === "GROUP") {
      return (
        conversation.name ??
        "Unnamed group"
      );
    }

    return (
      getOtherMember(conversation)
        ?.user.username ??
      "Unknown user"
    );
  }

  function getConversationAvatar(
    conversation: Conversation
  ) {
    if (conversation.type === "GROUP") {
      return null;
    }

    return (
      getOtherMember(conversation)
        ?.user.avatarUrl ?? null
    );
  }

  function getConversationStatus(
    conversation: Conversation
  ) {
    if (conversation.type === "GROUP") {
      return null;
    }

    return getOtherMember(conversation)
      ?.user.status;
  }

  return (
    <main className="flex h-screen overflow-hidden">
      {/* Sidebar */}

      <aside className="flex w-80 shrink-0 flex-col border-r border-white/10 bg-slate-950">
        {/* Sidebar Header */}

        <div className="border-b border-white/10 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">
                Messages
              </h1>

              <p className="mt-1 text-xs text-slate-500">
                Your conversations
              </p>
            </div>

            <button
              onClick={() =>
                router.push("/chat/new")
              }
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500 text-lg font-bold text-slate-950 transition hover:bg-cyan-400"
              title="New conversation"
            >
              +
            </button>
          </div>
        </div>

        {/* Conversations */}

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="px-3 py-8 text-center text-sm text-slate-500">
              Loading conversations...
            </div>
          ) : error ? (
            <div className="rounded-xl bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <p className="text-sm text-slate-500">
                No conversations yet.
              </p>

              <button
                onClick={() =>
                  router.push("/chat/new")
                }
                className="mt-4 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
              >
                Start chatting
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {conversations.map(
                (conversation) => {
                  const name =
                    getConversationName(
                      conversation
                    );

                  const avatar =
                    getConversationAvatar(
                      conversation
                    );

                  const status =
                    getConversationStatus(
                      conversation
                    );

                  const lastMessage =
                    conversation.messages[0];

                  const active =
                    pathname ===
                    `/chat/${conversation.id}`;

                  return (
                    <Link
                      key={conversation.id}
                      href={`/chat/${conversation.id}`}
                      className={`flex items-center gap-3 rounded-xl p-3 transition ${active
                          ? "bg-white/10"
                          : "hover:bg-white/5"
                        }`}
                    >
                      {/* Avatar */}

                      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold">
                        {avatar ? (
                          <img
                            src={avatar}
                            alt={name}
                            className="h-full w-full rounded-full object-cover"
                          />
                        ) : (
                          name
                            .charAt(0)
                            .toUpperCase()
                        )}

                        {status ===
                          "ONLINE" && (
                            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-slate-950 bg-emerald-400" />
                          )}
                      </div>

                      {/* Conversation info */}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium text-white">
                            {name}
                          </p>

                          {lastMessage && (
                            <span className="shrink-0 text-[10px] text-slate-600">
                              {new Date(
                                lastMessage.createdAt
                              ).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex items-center justify-between gap-2">
                          <p className="min-w-0 truncate text-xs text-slate-500">
                            {lastMessage
                              ? lastMessage.deletedAt
                                ? "Message deleted"
                                : lastMessage.content
                              : "No messages yet"}
                          </p>

                          {conversation.unreadCount > 0 && (
                            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-cyan-500 px-1.5 text-[10px] font-bold text-slate-950">
                              {conversation.unreadCount > 99
                                ? "99+"
                                : conversation.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                }
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Main area */}

      <section className="hidden min-w-0 flex-1 md:block">
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-2xl">
              💬
            </div>

            <h2 className="text-lg font-semibold text-white">
              Select a conversation
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Choose a conversation from the sidebar
              to start chatting.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}