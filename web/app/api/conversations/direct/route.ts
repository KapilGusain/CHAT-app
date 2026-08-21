import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();

    const otherUserId =
      typeof body.userId === "string"
        ? body.userId
        : "";

    if (!otherUserId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    if (otherUserId === session.user.id) {
      return NextResponse.json(
        { error: "You cannot create a chat with yourself" },
        { status: 400 }
      );
    }

    const otherUser = await prisma.user.findUnique({
      where: {
        id: otherUserId,
      },
      select: {
        id: true,
      },
    });

    if (!otherUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Find  existing direct conversation
    const existingConversation =
      await prisma.conversation.findFirst({
        where: {
          type: "DIRECT",
          AND: [
            {
              members: {
                some: {
                  userId: session.user.id,
                },
              },
            },
            {
              members: {
                some: {
                  userId: otherUserId,
                },
              },
            },
          ],
        },
        include: {
          members: true,
        },
      });

    if (existingConversation) {
      const hasExactlyTwoMembers = existingConversation.members.length === 2;

      if (hasExactlyTwoMembers) {
        return NextResponse.json({
          conversation: existingConversation,
          existing: true,
        });
      }
    }

    const conversation = await prisma.conversation.create({
      data: {
        type: "DIRECT",
        createdById: session.user.id,

        members: {
          create: [
            {
              userId: session.user.id,
            },
            {
              userId: otherUserId,
            },
          ],
        },
      },

      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                avatarUrl: true,
                status: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json(
      {
        conversation,
        existing: false,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "Create direct conversation error:",
      error
    );

    return NextResponse.json(
      {
        error: "Failed to create conversation",
      },
      {
        status: 500,
      }
    );
  }
}