import { auth } from "@/auth";
import { redirect } from "next/navigation";

import NewChat from "@/components/chat/NewChat";

export default async function NewChatPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <NewChat currentUserId={session.user.id} />
    </main>
  );
}