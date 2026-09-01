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
        ? body.userId.trim()
        : "";

    if (!otherUserId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    if (otherUserId === session.user.id) {
      return NextResponse.json(
        {
          error: "You cannot create a chat with yourself",
        },
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

    const directKey = [
      session.user.id,
      otherUserId,
    ]
      .sort()
      .join(":");

    /*
     * Whether the conversation already exists
     */
    const existingConversation =
      await prisma.conversation.findUnique({
        where: {
          directKey,
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
        },
      });

    if (existingConversation) {
      return NextResponse.json({
        conversation: existingConversation,
        existing: true,
      });
    }

    const conversation =
      await prisma.conversation.create({
        data: {
          type: "DIRECT",
          directKey,
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
                  lastSeenAt: true,
                },
              },
            },
          },
        },
      });

    return NextResponse.json({
      conversation,
      existing: false,
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      try {
        const session = await auth();

        if (!session?.user?.id) {
          return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
          );
        }

        const body = await request
          .clone()
          .json();

        const otherUserId =
          typeof body.userId === "string"
            ? body.userId.trim()
            : "";

        const directKey = [
          session.user.id,
          otherUserId,
        ]
          .sort()
          .join(":");

        const conversation =
          await prisma.conversation.findUnique({
            where: {
              directKey,
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
            },
          });

        if (conversation) {
          return NextResponse.json({
            conversation,
            existing: true,
          });
        }
      } catch (raceError) {
        console.error(
          "Failed to recover direct conversation race:",
          raceError
        );
      }
    }

    console.error(
      "Find/create direct conversation error:",
      error
    );

    return NextResponse.json(
      {
        error: "Failed to find or create conversation",
      },
      {
        status: 500,
      }
    );
  }
}