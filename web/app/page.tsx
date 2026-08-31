import Image from "next/image";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-[#140f24] font-sans">
      <main className="flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-10 px-16 py-32">
        <div className="text-center">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#9a8fbf]">
            Realtime chating
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-[#ede9f7]">
            Welcome back
          </h1>
        </div>

        <div className="flex w-full max-w-xs flex-col gap-3">
          <a
            href="chat"
            className="rounded-md bg-[#8b6fd9] px-6 py-4 text-center text-sm font-semibold uppercase tracking-wide text-[#140f24] transition hover:bg-[#a78bfa]"
          >
            Go to Chat
          </a>

          <a
            href="login"
            className="rounded-md border border-[#4a3d73]/35 bg-[#1e1836] px-6 py-4 text-center text-sm font-semibold uppercase tracking-wide text-[#ede9f7] transition hover:border-[#8b6fd9]/50"
          >
            Login
          </a>

          <a
            href="register"
            className="rounded-md border border-[#4a3d73]/25 px-6 py-4 text-center text-sm font-semibold uppercase tracking-wide text-[#9a8fbf] transition hover:text-[#ede9f7] hover:border-[#4a3d73]/45"
          >
            Register
          </a>
        </div>
      </main>
    </div>
  );
}