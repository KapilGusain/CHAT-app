"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  status: "ONLINE" | "OFFLINE" | "AWAY";
  lastSeenAt: string | null;
}

interface NewChatProps {
  currentUserId: string;
}

export default function NewChat({
  currentUserId,
}: NewChatProps) {
  const router = useRouter();

  const [query, setQuery] =
    useState("");

  const [users, setUsers] =
    useState<User[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [creatingUserId, setCreatingUserId] =
    useState<string | null>(null);

  const [error, setError] =
    useState("");

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setUsers([]);
      return;
    }

    const timeout = setTimeout(
      async () => {
        try {
          setLoading(true);
          setError("");

          const response =
            await fetch(
              `/api/users?q=${encodeURIComponent(
                trimmed
              )}`,
              {
                cache: "no-store",
              }
            );

          if (!response.ok) {
            throw new Error(
              "Failed to search users"
            );
          }

          const data =
            await response.json();

          setUsers(data.users ?? []);
        } catch (error) {
          console.error(
            "User search error:",
            error
          );

          setError(
            "Unable to search users."
          );
        } finally {
          setLoading(false);
        }
      },
      300
    );

    return () =>
      clearTimeout(timeout);
  }, [query]);

  async function startConversation(userId: string) {
  try {
    setCreatingUserId(userId);
    setError("");

    const response = await fetch(
      "/api/conversations/direct",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ??
          "Failed to create conversation"
      );
    }

    if (!data.conversation?.id) {
      throw new Error(
        "Conversation ID was not returned by the server"
      );
    }

    router.push(
      `/chat/${data.conversation.id}`
    );
  } catch (error) {
    console.error(
      "Start conversation error:",
      error
    );

    setError(
      error instanceof Error
        ? error.message
        : "Unable to start conversation."
    );
  } finally {
    setCreatingUserId(null);
  }
}

  return (
    <div className="mx-auto min-h-screen max-w-2xl p-6">
      <div className="mb-6 flex items-center gap-4">
        <button
          onClick={() =>
            router.push("/chat")
          }
          className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5"
        >
          ← Back
        </button>

        <div>
          <h1 className="text-2xl font-bold">
            New conversation
          </h1>

          <p className="text-sm text-slate-500">
            Find someone to chat with
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <input
          value={query}
          onChange={(event) =>
            setQuery(event.target.value)
          }
          placeholder="Search username or email..."
          autoFocus
          className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400"
        />

        {error && (
          <p className="mt-3 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="mt-4">
          {loading && (
            <p className="py-4 text-center text-sm text-slate-500">
              Searching...
            </p>
          )}

          {!loading &&
            query.trim().length >= 2 &&
            users.length === 0 &&
            !error && (
              <p className="py-8 text-center text-sm text-slate-500">
                No users found.
              </p>
            )}

          <div className="space-y-2">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-3 rounded-xl p-3 transition hover:bg-white/5"
              >
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-800 font-semibold">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.username}
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    user.username
                      .charAt(0)
                      .toUpperCase()
                  )}

                  {user.status ===
                    "ONLINE" && (
                    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-slate-950 bg-emerald-400" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">
                    {user.username}
                  </p>

                  <p className="truncate text-xs text-slate-500">
                    {user.email}
                  </p>
                </div>

                <button
                  onClick={() =>
                    startConversation(
                      user.id
                    )
                  }
                  disabled={
                    creatingUserId ===
                    user.id
                  }
                  className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creatingUserId ===
                  user.id
                    ? "Opening..."
                    : "Chat"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}