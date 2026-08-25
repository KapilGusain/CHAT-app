import Image from "next/image";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center py-32 px-16 bg-white dark:bg-black sm:items-start">
        <a href="chat" className="bg-zinc-100 text-zinc-800 text-2xl p-4 m-2 rounded-2xl hover:bg-amber-100">Go to Chat</a>
        <a href="login" className="bg-zinc-100 text-zinc-800 text-2xl p-4 m-2 rounded-2xl hover:bg-amber-100">Login</a>
      </main>
    </div>
  );
}
