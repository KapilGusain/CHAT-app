import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);

    const query = searchParams.get("q")?.trim() ?? "";

    if (query.length < 2) {
      return NextResponse.json({
        users: [],
      });
    }

    const users = await prisma.user.findMany({
      where: {
        AND: [
          {
            id: {
              not: session.user.id,
            },
          },
          {
            OR: [
              {
                username: {
                  contains: query,
                  mode: "insensitive",
                },
              },
              {
                email: {
                  contains: query,
                  mode: "insensitive",
                },
              },
            ],
          },
        ],
      },

      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        status: true,
        lastSeenAt: true,
      },

      orderBy: {
        username: "asc",
      },

      take: 20,
    });

    return NextResponse.json({
      users,
    });
  } catch (error) {
    console.error("User search error:", error);

    return NextResponse.json(
      {
        error: "Failed to search users",
      },
      {
        status: 500,
      }
    );
  }
}