import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const conversations =
      await prisma.conversation.findMany({
        where: {
          members: {
            some: {
              userId: session.user.id,
            },
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
                  lastSeenAt: true,
                },
              },
            },
          },

          messages: {
            orderBy: {
              createdAt: "desc",
            },
            take: 1,
            select: {
              id: true,
              content: true,
              senderId: true,
              createdAt: true,
              deletedAt: true,
            },
          },
        },

        orderBy: {
          updatedAt: "desc",
        },
      });

    return NextResponse.json({
      conversations,
    });
  } catch (error) {
    console.error(
      "Get conversations error:",
      error
    );

    return NextResponse.json(
      {
        error: "Failed to load conversations",
      },
      {
        status: 500,
      }
    );
  }
}