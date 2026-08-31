"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
    const router = useRouter();

    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        setError(null);
        setSubmitting(true);

        try {
            const response = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, email, password }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw new Error(data?.message ?? "Registration failed");
            }

            router.push("chat");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="flex flex-1 flex-col items-center justify-center bg-[#140f24] font-sans">
            <main className="flex w-full max-w-sm flex-1 flex-col items-center justify-center px-6 py-32">
                <div className="mb-8 text-center">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-[#9a8fbf]">
                        Create account
                    </p>
                    <h1 className="mt-3 text-3xl font-semibold text-[#ede9f7]">
                        Register
                    </h1>
                </div>

                <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label
                            htmlFor="name"
                            className="font-mono text-[10px] uppercase tracking-widest text-[#9a8fbf]"
                        >
                            Username
                        </label>
                        <input
                            id="username"
                            type="text"
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            required
                            placeholder="Your Username"
                            className="rounded-md border border-[#4a3d73]/35 bg-[#1e1836] px-4 py-3 text-sm text-[#ede9f7] outline-none placeholder:text-[#6b5f94] focus:border-[#8b6fd9]/60"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label
                            htmlFor="email"
                            className="font-mono text-[10px] uppercase tracking-widest text-[#9a8fbf]"
                        >
                            Email
                        </label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            required
                            placeholder="you@example.com"
                            className="rounded-md border border-[#4a3d73]/35 bg-[#1e1836] px-4 py-3 text-sm text-[#ede9f7] outline-none placeholder:text-[#6b5f94] focus:border-[#8b6fd9]/60"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label
                            htmlFor="password"
                            className="font-mono text-[10px] uppercase tracking-widest text-[#9a8fbf]"
                        >
                            Password
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            required
                            minLength={6}
                            placeholder="At least 6 characters"
                            className="rounded-md border border-[#4a3d73]/35 bg-[#1e1836] px-4 py-3 text-sm text-[#ede9f7] outline-none placeholder:text-[#6b5f94] focus:border-[#8b6fd9]/60"
                        />
                    </div>

                    {error && (
                        <p className="font-mono text-xs text-[#b14c6b]">
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={submitting}
                        className="mt-2 rounded-md bg-[#8b6fd9] px-6 py-3.5 text-sm font-semibold uppercase tracking-wide text-[#140f24] transition hover:bg-[#a78bfa] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {submitting ? "Creating account..." : "Create account"}
                    </button>
                </form>

                <p className="mt-6 font-mono text-xs text-[#9a8fbf]">
                    Already have an account?{" "}
                    <a href="login" className="text-[#a78bfa] hover:text-[#ede9f7]">
                        Log in
                    </a>
                </p>
            </main>
        </div>
    );
}