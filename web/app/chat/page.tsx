import { auth } from "@/auth";
import { redirect } from "next/navigation";

import ConversationList from "@/components/chat/ConversationList";

export default async function ChatPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen">
      <ConversationList
        currentUserId={session.user.id}
      />
    </main>
  );
}