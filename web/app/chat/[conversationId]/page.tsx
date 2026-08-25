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

  const { conversationId } = await params;

  const conversation = await prisma.conversation.findUnique({
    where: {
      id: conversationId,
    },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
              status: true,
              lastSeenAt: true,
            },
          },
        },
      },
    },
  });

  if (!conversation) {
    notFound();
  }

  const isMember = conversation.members.some(
    (member) => member.userId === session.user.id
  );

  if (!isMember) {
    notFound();
  }

  const otherMember = conversation.members.find(
    (member) => member.userId !== session.user.id
  );

  const chatUserName =
    conversation.type === "GROUP"
      ? conversation.name ?? "Unnamed group"
      : otherMember?.user.username ?? "Unknown user";

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl p-6">
        <ChatWindow
          conversationId={conversationId}
          currentUserId={session.user.id}
          chatUserName={chatUserName}
        />
      </div>
    </main>
  );
}