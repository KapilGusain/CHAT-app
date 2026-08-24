import { prisma } from "@chat/db";

export async function markMessageAsRead(
  messageId: string,
  userId: string
) {
  const message = await prisma.message.findUnique({
    where: {
      id: messageId,
    },
    select: {
      id: true,
      conversationId: true,
      senderId: true,
    },
  });

  if (!message) {
    throw new Error("Message not found");
  }

  // Don't mark your own message as read
  if (message.senderId === userId) {
    return null;
  }

  const existingRead =
    await prisma.messageRead.findUnique({
      where: {
        messageId_userId: {
          messageId,
          userId,
        },
      },
    });

  if (existingRead) {
    return null;
  }

  const read = await prisma.messageRead.create({
    data: {
      messageId,
      userId,
    },
  });

  return {
    ...read,
    conversationId: message.conversationId,
    senderId: message.senderId,
  };
}