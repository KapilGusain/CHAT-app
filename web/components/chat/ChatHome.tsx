"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ChatHomeProps {
  currentUserId: string;
}

interface Conversation {
  id: string;
  type: "DIRECT" | "GROUP";
  name: string | null;
  updatedAt: string;
  members: {
    userId: string;
    user: {
      id: string;
      username: string;
      email: string;
      avatarUrl: string | null;
      status: "ONLINE" | "OFFLINE" | "AWAY";
      lastSeenAt: string | null;
    };
  }[];
  messages: {
    id: string;
    content: string;
    senderId: string;
    createdAt: string;
    deletedAt: string | null;
  }[];
}

export default function ChatHome({
  currentUserId,
}: ChatHomeProps) {
  const router = useRouter();

  const [conversations, setConversations] =
    useState<Conversation[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    let mounted = true;

    async function loadConversations() {
      try {
        setLoading(true);

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

        const data = await response.json();

        if (mounted) {
          setConversations(
            data.conversations ?? []
          );
        }
      } catch (error) {
        console.error(
          "Failed to load conversations:",
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

    loadConversations();

    return () => {
      mounted = false;
    };
  }, []);

  function getOtherMember(
    conversation: Conversation
  ) {
    return conversation.members.find(
      (member) =>
        member.userId !== currentUserId
    )?.user;
  }

  function openConversation(
    conversationId: string
  ) {
    router.push(
      `/chat/${conversationId}`
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">
          Messages
        </h1>

        <p className="mt-1 text-sm text-slate-400">
          Your conversations
        </p>
      </div>

      <div className="grid flex-1 overflow-hidden rounded-2xl border border-white/10 bg-white/5 md:grid-cols-[340px_1fr]">
        {/* Sidebar */}
        <aside className="border-r border-white/10">
          <div className="border-b border-white/10 p-4">
            <button
              onClick={() =>
                router.push(
                  "/chat/new"
                )
              }
              className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              + New conversation
            </button>
          </div>

          <div className="p-3">
            {loading && (
              <p className="p-3 text-sm text-slate-500">
                Loading conversations...
              </p>
            )}

            {error && (
              <p className="p-3 text-sm text-red-400">
                {error}
              </p>
            )}

            {!loading &&
              !error &&
              conversations.length === 0 && (
                <div className="p-6 text-center">
                  <p className="text-sm text-slate-400">
                    No conversations yet.
                  </p>

                  <button
                    onClick={() =>
                      router.push(
                        "/chat/new"
                      )
                    }
                    className="mt-3 text-sm text-cyan-400 hover:text-cyan-300"
                  >
                    Start a conversation
                  </button>
                </div>
              )}

            <div className="space-y-1">
              {conversations.map(
                (conversation) => {
                  const otherUser =
                    getOtherMember(
                      conversation
                    );

                  const lastMessage =
                    conversation.messages[0];

                  return (
                    <button
                      key={
                        conversation.id
                      }
                      onClick={() =>
                        openConversation(
                          conversation.id
                        )
                      }
                      className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition hover:bg-white/5"
                    >
                      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-white">
                        {otherUser?.avatarUrl ? (
                          <img
                            src={
                              otherUser.avatarUrl
                            }
                            alt={
                              otherUser.username
                            }
                            className="h-full w-full rounded-full object-cover"
                          />
                        ) : (
                          otherUser?.username
                            ?.charAt(0)
                            .toUpperCase()
                        )}

                        {otherUser?.status ===
                          "ONLINE" && (
                          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-slate-950 bg-emerald-400" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-white">
                            {otherUser?.username ??
                              conversation.name ??
                              "Conversation"}
                          </p>
                        </div>

                        <p className="mt-1 truncate text-xs text-slate-500">
                          {lastMessage
                            ? lastMessage.content
                            : "No messages yet"}
                        </p>
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          </div>
        </aside>

        {/* Empty chat area */}
        <section className="hidden items-center justify-center md:flex">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-500/10 text-2xl">
              💬
            </div>

            <h2 className="mt-4 text-lg font-semibold">
              Select a conversation
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Choose a conversation from the
              sidebar to start chatting.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}