import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type Params = {
  params: Promise<{
    conversationId: string;
  }>;
};

export async function GET(
  _request: Request,
  { params }: Params
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { conversationId } = await params;

    const member =
      await prisma.conversationMember.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId: session.user.id,
          },
        },
      });

    if (!member) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    const messages = await prisma.message.findMany({
      where: {
        conversationId,
      },

      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },

        reads: {
          where: {
            userId: {
              not: session.user.id,
            },
          },

          select: {
            id: true,
            userId: true,
            readAt: true,
          },
        },
      },

      orderBy: {
        createdAt: "desc",
      },

      take: 50,
    });
    messages.reverse();

    const messagesWithReadState = messages.map(
      (message) => ({
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        content: message.content,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
        deletedAt: message.deletedAt,
        editedAt: message.editedAt,

        sender: message.sender,

        readByCurrentUser:
          message.senderId === session.user.id &&
          message.reads.length > 0,
      })
    );

    return NextResponse.json({
      messages: messagesWithReadState,
    });
  } catch (error) {
    console.error(
      "Get messages error:",
      error
    );

    return NextResponse.json(
      {
        error: "Failed to load messages",
      },
      {
        status: 500,
      }
    );
  }
}