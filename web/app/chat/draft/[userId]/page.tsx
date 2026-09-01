import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {notFound, redirect} from "next/navigation";

import ChatWindow from "@/components/chat/ChatWindow";

interface DraftChatPageProps {
  params: Promise<{
    userId: string;
  }>;
}

export default async function DraftChatPage({
  params,
}: DraftChatPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { userId } = await params;

  if (!userId) {
    notFound();
  }

  if (userId === session.user.id) {
    notFound();
  }

  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      username: true,
      avatarUrl: true,
      status: true,
      lastSeenAt: true,
    },
  });

  if (!user) {
    notFound();
  }

  const directKey = [
    session.user.id,
    user.id,
  ]
    .sort()
    .join(":");

  const existingConversation =
    await prisma.conversation.findUnique({
      where: {
        directKey,
      },
    });

  if (existingConversation) {
    redirect(
      `/chat/${existingConversation.id}`
    );
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl p-6">
        <ChatWindow
          conversationId=""
          targetUserId={user.id}
          currentUserId={session.user.id}
          chatUserName={user.username}
        />
      </div>
    </main>
  );
}