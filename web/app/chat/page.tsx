import { auth } from "@/auth";
import { redirect } from "next/navigation";

import { SocketProvider } from "@/components/chat/SocketProvider";
import ChatWindow from "@/components/chat/ChatWindow";

export default async function ChatPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const conversationId =
    process.env.TEST_CONVERSATION_ID;

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-3xl font-bold">
          Realtime Chat
        </h1>

        {conversationId ? (
          <SocketProvider>
            <ChatWindow
              conversationId={conversationId}
              currentUserId={session.user.id}
            />
          </SocketProvider>
        ) : (
          <p className="text-slate-500">
            Set TEST_CONVERSATION_ID to test messaging.
          </p>
        )}
      </div>
    </main>
  );
}