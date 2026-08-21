import { auth } from "@/auth";
import { createRealtimeToken } from "@/lib/realtime-token";
import { NextResponse } from "next/server";

export async function GET() {
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

    const token = await createRealtimeToken(
      session.user.id
    );

    return NextResponse.json(
      {
        token,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "Failed to create realtime token:",
      error
    );

    return NextResponse.json(
      {
        error: "Failed to create realtime token",
      },
      {
        status: 500,
      }
    );
  }
}