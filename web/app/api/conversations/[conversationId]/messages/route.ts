import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@chat/db";

const PAGE_SIZE = 50;

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      conversationId: string;
    }>;
  }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    const { conversationId } = await params;

    if (!conversationId) {
      return NextResponse.json(
        {
          error: "Conversation ID is required",
        },
        {
          status: 400,
        }
      );
    }

    const member = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: session.user.id,
        },
      },
    });

    if (!member) {
      return NextResponse.json(
        {
          error: "You are not a member of this conversation",
        },
        {
          status: 403,
        }
      );
    }

    const { searchParams } = new URL(request.url);

    const before = searchParams.get("before");

    const messages = await prisma.message.findMany({
      where: {
        conversationId,

        ...(before
          ? {
            createdAt: {
              lt: new Date(before),
            },
          }
          : {}),
      },

      orderBy: {
        createdAt: "desc",
      },

      take: PAGE_SIZE + 1,

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
    });

    const hasMore = messages.length > PAGE_SIZE;

    const pageMessages = messages
      .slice(0, PAGE_SIZE)
      .map((message) => ({
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        content: message.content,

        imageUrl: message.imageUrl,
        imageName: message.imageName,
        imageSize: message.imageSize,
        imageMimeType: message.imageMimeType,

        createdAt: message.createdAt.toISOString(),
        updatedAt: message.updatedAt.toISOString(),

        deletedAt: message.deletedAt ? message.deletedAt.toISOString() : null,
        editedAt: message.editedAt ? message.editedAt.toISOString() : null,

        sender: message.sender,
        readByOtherUser: message.reads.length > 0,
      }))
      .reverse();

    return NextResponse.json({
      messages: pageMessages,
      hasMore,
    });
  } catch (error) {
    console.error(
      "GET messages error:",
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