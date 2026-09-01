import { prisma } from "@chat/db";

export async function isConversationMember(conversationId: string, userId: string) {

  const conversation = await prisma.conversation.findUnique({
    where: {
      id: conversationId,
    },
    include: {
      members: {
        select: {
          userId: true,
        },
      },
    },
  });

  if (!conversation) {
    console.log(" Conversation does not exist");
    return false;
  }

  const isMember = conversation.members.some(
    (member) => member.userId === userId
  );

  return isMember;
}


export async function getConversation(conversationId: string) {
  return prisma.conversation.findUnique({
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
}

export async function markConversationAsRead(conversationId: string, userId: string) {
  return prisma.conversationMember.update({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
    data: {
      lastReadAt: new Date(),
    },
  });
}