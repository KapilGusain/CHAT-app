"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSocket, disconnectSocket } from "@/lib/socket";
import type { Socket } from "socket.io-client";
import { signOut } from "next-auth/react";

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
  content: string | null;
  senderId: string;
  createdAt: string;
  deletedAt: string | null;
  editedAt: string | null;
  imageUrl?: string | null;
  imageName?: string | null;
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
  currentUsername: string;
}

export default function ConversationList({ currentUserId, currentUsername }: ConversationListProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    let mounted = true;

    async function loadConversations() {
      try {
        const response = await fetch("/api/conversations", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to load conversations");
        }

        const data = await response.json();

        if (mounted) {
          setConversations(data.conversations ?? []);
          setError("");
        }
      } catch (error) {
        console.error("Load conversations error:", error);

        if (mounted) {
          setError("Unable to load conversations.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadConversations();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let socket: Socket | null = null;

    async function setupRealtime() {
      try {
        socket = await getSocket();

        if (!mounted) {
          return;
        }

        const handleConnect = () => {
          console.log(
            "🟢 ConversationList socket connected:",
            socket?.id
          );
        };

        const handleNewMessage = (
          message: LastMessage & {
            conversationId: string;
          }
        ) => {
          if (!mounted) {
            return;
          }

          setConversations((previousConversations) => {
            const conversationIndex = previousConversations.findIndex(
              (conversation) =>
                conversation.id === message.conversationId
            );

            if (conversationIndex === -1) {
              return previousConversations;
            }

            const conversation = previousConversations[conversationIndex];

            const updatedLastMessage: LastMessage = {
              id: message.id,
              content: message.content,
              senderId: message.senderId,
              createdAt: message.createdAt,
              deletedAt: message.deletedAt ?? null,
              editedAt: message.editedAt ?? null,
              imageUrl: message.imageUrl ?? null,
              imageName: message.imageName ?? null,
            };

            const updatedConversation: Conversation = {
              ...conversation,
              updatedAt: message.createdAt,
              messages: [updatedLastMessage],
            };

            return [
              updatedConversation,
              ...previousConversations.filter(
                (_, index) => index !== conversationIndex
              ),
            ];
          });
        };

        const handleConversationRead = ({ conversationId, userId }: {
          conversationId: string;
          userId: string;
        }) => {
          if (
            !mounted ||
            userId !== currentUserId
          ) {
            return;
          }

          setConversations(
            (previousConversations) =>
              previousConversations.map(
                (conversation) =>
                  conversation.id ===
                    conversationId
                    ? {
                      ...conversation,
                      unreadCount: 0,
                    }
                    : conversation
              )
          );
        };

        const handlePresenceUpdate = ({ userId, status, lastSeenAt }: {
          userId: string;
          status: "ONLINE" | "OFFLINE" | "AWAY";
          lastSeenAt: string | null;
        }) => {
          if (!mounted) {
            return;
          }

          setConversations((previousConversations) =>
            previousConversations.map((conversation) => ({
              ...conversation,

              members: conversation.members.map((member) =>
                member.userId === userId
                  ? {
                    ...member,

                    user: {
                      ...member.user,
                      status,
                      lastSeenAt,
                    },
                  }
                  : member
              ),
            }))
          );
        };

        const handleConversationUnread = ({
          conversationId,
          message,
          conversation: incomingConversation,
        }: {
          conversationId: string;
          message: LastMessage & {
            imageUrl?: string | null;
            imageName?: string | null;
          };
          conversation?: Conversation;
        }) => {
          if (!mounted) {
            return;
          }

          if (message.senderId === currentUserId) {
            return;
          }

          const currentlyViewing = pathnameRef.current === `/chat/${conversationId}`;

          setConversations((previousConversations) => {
            const conversationIndex =
              previousConversations.findIndex(
                (conversation) =>
                  conversation.id === conversationId
              );

            /*
             * Conversation is already in the sidebar.
             */
            if (conversationIndex !== -1) {
              const existingConversation = previousConversations[conversationIndex];

              const updatedConversation: Conversation = {
                ...existingConversation,

                updatedAt: message.createdAt,

                messages: [
                  {
                    id: message.id,
                    content: message.content ?? "",
                    senderId: message.senderId,
                    createdAt: message.createdAt,
                    deletedAt: message.deletedAt ?? null,
                    editedAt: message.editedAt ?? null,
                  },
                ],

                unreadCount: currentlyViewing ? 0 : existingConversation.unreadCount + 1,
              };

              return [
                updatedConversation,
                ...previousConversations.filter(
                  (_, index) =>
                    index !== conversationIndex
                ),
              ];
            }

            /*
             * Brand-new conversation.
             */
            if (!incomingConversation) {
              console.warn(
                "Received conversation:unread without conversation payload",
                {
                  conversationId,
                }
              );

              return previousConversations;
            }

            const newConversation: Conversation = {
              ...incomingConversation,

              updatedAt: message.createdAt,

              messages: [
                {
                  id: message.id,
                  content: message.content ?? "",
                  senderId: message.senderId,
                  createdAt: message.createdAt,
                  deletedAt: message.deletedAt ?? null,
                  editedAt: message.editedAt ?? null,
                },
              ],

              unreadCount: currentlyViewing ? 0 : 1,
            };

            return [newConversation, ...previousConversations];
          });
        };

        const handleMessageDeleted = (data: {
          messageId: string;
          conversationId: string;
          deletedAt: string;
        }) => {
          if (!mounted) {
            return;
          }

          setConversations(
            (previousConversations) =>
              previousConversations.map(
                (conversation) => {
                  if (
                    conversation.id !==
                    data.conversationId
                  ) {
                    return conversation;
                  }

                  return {
                    ...conversation,

                    messages:
                      conversation.messages.map(
                        (message, index) =>
                          index === 0 &&
                            message.id ===
                            data.messageId
                            ? {
                              ...message,
                              content: "",
                              deletedAt:
                                data.deletedAt,
                            }
                            : message
                      ),
                  };
                }
              )
          );
        };

        const handleMessageEdited = (message: {
          id: string;
          conversationId: string;
          content: string;
          editedAt: string | null;
        }) => {
          if (!mounted) {
            return;
          }

          setConversations(
            (previousConversations) =>
              previousConversations.map(
                (conversation) => {
                  if (
                    conversation.id !==
                    message.conversationId
                  ) {
                    return conversation;
                  }

                  return {
                    ...conversation,

                    messages:
                      conversation.messages.map(
                        (lastMessage, index) =>
                          index === 0 &&
                            lastMessage.id ===
                            message.id
                            ? {
                              ...lastMessage,
                              content:
                                message.content,
                              editedAt:
                                message.editedAt,
                            }
                            : lastMessage
                      ),
                  };
                }
              )
          );
        };

        const handleConversationNew = (conversation: Conversation) => {
          if (!mounted) {
            return;
          }

          const normalizedConversation: Conversation = {
            ...conversation,
            messages: conversation.messages ?? [],
            unreadCount: conversation.unreadCount ?? 0,
          };

          setConversations((previous) => {
            const existingIndex = previous.findIndex(
              (existingConversation) =>
                existingConversation.id === normalizedConversation.id
            );

            if (existingIndex !== -1) {
              return previous;
            }

            return [
              normalizedConversation,
              ...previous,
            ];
          });
        };

        socket.on("connect", handleConnect);

        socket.on("message:new", handleNewMessage);

        socket.on("conversation:read", handleConversationRead);

        socket.on("presence:update", handlePresenceUpdate);

        socket.on("conversation:unread", handleConversationUnread);

        socket.on("message:deleted", handleMessageDeleted);

        socket.on("message:edited", handleMessageEdited);

        socket.on("conversation:new", handleConversationNew);

        if (!socket.connected) {
          socket.connect();
        }

        return () => {
          socket?.off("connect", handleConnect);

          socket?.off("message:new", handleNewMessage);

          socket?.off("conversation:read", handleConversationRead);

          socket?.off("presence:update", handlePresenceUpdate);

          socket?.off("conversation:unread", handleConversationUnread);

          socket?.off("message:deleted", handleMessageDeleted);

          socket?.off("message:edited", handleMessageEdited);

          socket?.off("conversation:new", handleConversationNew);
        };
      } catch (error) {
        console.error(
          "ConversationList realtime error:",
          error
        );
      }
    }

    const cleanupPromise =
      setupRealtime();

    return () => {
      mounted = false;

      cleanupPromise.then(
        (cleanup) => cleanup?.()
      );
    };
  }, [currentUserId]);

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
            <div className="min-w-0">
              <h1 className="text-xl font-bold">
                Messages
              </h1>

              <p className="mt-1 truncate text-xs text-slate-500">
                Signed in as{" "}
                <span className="font-medium text-slate-300">
                  {currentUsername}
                </span>
              </p>
            </div>

            <button
              onClick={() =>
                router.push("/chat/new")
              }
              className="ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500 text-lg font-bold text-slate-950 transition hover:bg-cyan-400"
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
                  const name = getConversationName(conversation);

                  const avatar = getConversationAvatar(conversation);

                  const status = getConversationStatus(conversation);

                  const lastMessage = conversation.messages[0];

                  const active = pathname === `/chat/${conversation.id}`;

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
                            {lastMessage ? lastMessage.deletedAt ? "This message was deleted" : lastMessage.imageUrl
                                  ? "🖼️ Image" : lastMessage.content
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
        {/* Sidebar Footer */}

        <div className="border-t border-white/10 p-4">
          <button onClick={async () => {

            disconnectSocket();
            await signOut({
              callbackUrl: "/login",
            });
          }}
            className="flex w-full items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 transition hover:bg-red-500/20 hover:text-red-300"
          >
            Logout
          </button>
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