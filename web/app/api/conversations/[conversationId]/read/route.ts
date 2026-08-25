import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type Params = {
  params: Promise<{
    conversationId: string;
  }>;
};

export async function POST(
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

    const { conversationId } =
      await params;

    if (!conversationId) {
      return NextResponse.json(
        {
          error:
            "Conversation ID is required",
        },
        { status: 400 }
      );
    }

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

    const lastMessage =
      await prisma.message.findFirst({
        where: {
          conversationId,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          createdAt: true,
        },
      });

    const lastReadAt = lastMessage?.createdAt ?? new Date();

    await prisma.conversationMember.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId: session.user.id,
        },
      },
      data: {
        lastReadAt,
      },
    });

    return NextResponse.json({
      success: true,
      lastReadAt,
    });
  } catch (error) {
    console.error(
      "Mark conversation read error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to mark conversation as read",
      },
      { status: 500 }
    );
  }
}