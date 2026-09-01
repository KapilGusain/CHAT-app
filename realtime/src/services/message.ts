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

  // Dont mark own message as read
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

export async function deleteMessage(
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
      deletedAt: true,
    },
  });

  if (!message) {
    throw new Error("Message not found");
  }

  if (message.senderId !== userId) {
    throw new Error(
      "You can only delete your own messages"
    );
  }

  if (message.deletedAt) {
    return null;
  }

  const deleted = await prisma.message.update({
    where: {
      id: messageId,
    },
    data: {
      deletedAt: new Date(),
    },
  });

  return {
    id: deleted.id,
    conversationId: deleted.conversationId,
    senderId: deleted.senderId,
    deletedAt: deleted.deletedAt,
  };
}


export async function editMessage(
  messageId: string,
  userId: string,
  content: string
) {
  const message = await prisma.message.findUnique({
    where: {
      id: messageId,
    },
    select: {
      id: true,
      conversationId: true,
      senderId: true,
      deletedAt: true,
    },
  });

  if (!message) {
    throw new Error("Message not found");
  }

  if (message.senderId !== userId) {
    throw new Error(
      "You can only edit your own messages"
    );
  }

  if (message.deletedAt) {
    throw new Error(
      "Deleted messages cannot be edited"
    );
  }

  const trimmedContent = content.trim();

  if (!trimmedContent) {
    throw new Error(
      "Message cannot be empty"
    );
  }

  if (trimmedContent.length > 5000) {
    throw new Error(
      "Message is too long"
    );
  }

  const edited = await prisma.message.update({
    where: {
      id: messageId,
    },
    data: {
      content: trimmedContent,
      editedAt: new Date(),
    },
    select: {
      id: true,
      conversationId: true,
      senderId: true,
      content: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      editedAt: true,
    },
  });

  return edited;
}