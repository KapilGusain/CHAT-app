import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";

import ChatWindow from "@/components/chat/ChatWindow";

interface ChatConversationPageProps {
  params: Promise<{
    conversationId: string;
  }>;
}

export default async function ChatConversationPage({
  params,
}: ChatConversationPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { conversationId } =
    await params;

  const membership =
    await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: session.user.id,
        },
      },
    });

  if (!membership) {
    notFound();
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl p-6">
        <ChatWindow
          conversationId={conversationId}
          currentUserId={session.user.id}
        />
      </div>
    </main>
  );
}