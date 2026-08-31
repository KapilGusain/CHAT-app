"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (!result || result.error) {
      setError("Invalid email or password.");
      return;
    }

    router.push("/chat");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#140f24] px-6">
      <div className="w-full max-w-md rounded-lg border border-[#4a3d73]/35 bg-[#1e1836] p-8">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[#9a8fbf]">
          Sign in
        </p>

        <h1 className="mt-3 text-3xl font-semibold text-[#ede9f7]">
          Welcome back
        </h1>

        <p className="mt-2 text-sm text-[#9a8fbf]">
          Sign in to your account
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-[#9a8fbf]">
              Email
            </label>

            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-md border border-[#4a3d73]/35 bg-[#140f24] px-4 py-3 text-sm text-[#ede9f7] outline-none placeholder:text-[#6b5f94] focus:border-[#8b6fd9]/60"
            />
          </div>

          <div>
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-[#9a8fbf]">
              Password
            </label>

            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="w-full rounded-md border border-[#4a3d73]/35 bg-[#140f24] px-4 py-3 text-sm text-[#ede9f7] outline-none placeholder:text-[#6b5f94] focus:border-[#8b6fd9]/60"
            />
          </div>

          {error && (
            <p className="rounded-md bg-[#b14c6b]/10 px-4 py-3 font-mono text-xs text-[#c97b96]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-[#8b6fd9] px-4 py-3.5 text-sm font-semibold uppercase tracking-wide text-[#140f24] transition hover:bg-[#a78bfa] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}