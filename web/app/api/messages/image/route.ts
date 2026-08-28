import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@chat/db";
import { supabaseAdmin } from "@/lib/supabase/server";

const BUCKET_NAME = "chat-app-images";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const formData = await request.formData();

    const file = formData.get("file");
    const conversationId = formData.get("conversationId");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: "Image file is required",
        },
        { status: 400 }
      );
    }

    if (
      typeof conversationId !== "string" ||
      !conversationId.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Conversation ID is required",
        },
        { status: 400 }
      );
    }

    const normalizedConversationId = conversationId.trim();

    /*
     * Verify that the authenticated user actually
     * belongs to this conversation.
     */
    const membership = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: normalizedConversationId,
          userId: session.user.id,
        },
      },
      select: {
        id: true,
      },
    });

    if (!membership) {
      return NextResponse.json(
        {
          success: false,
          error: "You are not a member of this conversation",
        },
        { status: 403 }
      );
    }

    /*
     * Validate MIME type.
     */
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: "Only JPG, PNG, WEBP and GIF images are allowed",
        },
        { status: 400 }
      );
    }

    /*
     * Validate file size.
     */
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: "Image must be smaller than 10 MB",
        },
        { status: 400 }
      );
    }

    /*
     * Generate a random storage filename.
     *
     * We never use the original filename as the
     * actual storage filename.
     */
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";

    const fileName = `${crypto.randomUUID()}.${extension}`;

    const storagePath = `${normalizedConversationId}/${session.user.id}/${fileName}`;

    const arrayBuffer = await file.arrayBuffer();

    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .upload(storagePath, buffer, {
          contentType: file.type,
          upsert: false,
        });

    if (uploadError) {
      console.error(
        "Supabase image upload error:",
        uploadError
      );

      return NextResponse.json(
        {
          success: false,
          error: "Failed to upload image",
        },
        { status: 500 }
      );
    }

    /*
     * The bucket is expected to be public.
     */
    const {
      data: { publicUrl },
    } = supabaseAdmin.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);

    return NextResponse.json({
      success: true,
      imageUrl: publicUrl,
      imageName: file.name,
      imageSize: file.size,
      imageMimeType: file.type,
      storagePath,
    });
  } catch (error) {
    console.error(
      "Image upload error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: "Failed to upload image",
      },
      { status: 500 }
    );
  }
}