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
] as const;

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

    /*
     * Read multipart form data
     */
    const formData = await request.formData();

    const file = formData.get("file");
    const conversationId = formData.get("conversationId");

    /*
     * Validate file
     */
    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: "Image file is required",
        },
        { status: 400 }
      );
    }

    /*
     * Validate conversation ID.
     *
     * This route expects the conversation to already exist.
     * For a brand-new chat, ChatWindow must first call
     * /api/conversations/direct and then use that returned ID.
     */
    if (typeof conversationId !== "string" || !conversationId.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "Conversation ID is required",
        },
        { status: 400 }
      );
    }

    const normalizedConversationId =
      conversationId.trim();

    /*
     * Verify conversation membership.
     */
    const membership =
      await prisma.conversationMember.findUnique({
        where: {
          conversationId_userId: {
            conversationId:
              normalizedConversationId,
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
          error:
            "You are not a member of this conversation",
        },
        { status: 403 }
      );
    }

    /*
     * Validate MIME type
     */
    if (!ALLOWED_TYPES.includes(file.type as any)) {
      return NextResponse.json(
        {
          success: false,
          error: "Only JPG, PNG, WEBP and GIF images are allowed",
        },
        { status: 400 }
      );
    }

    /*
     * Validate file size
     */
    if (file.size <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Image file is empty",
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Image must be smaller than 10 MB",
        },
        { status: 400 }
      );
    }

    /*
     * Generate a safe random storage filename.
     *
     * Never use the original filename as the
     * actual Supabase object name.
     */
    const extension =
      file.name
        .split(".")
        .pop()
        ?.toLowerCase() || "jpg";

    const fileName =
      `${crypto.randomUUID()}.${extension}`;

    /*
     * Storage structure:
     *
     * conversationId/
     *   userId/
     *     random-file-name.ext
     */
    const storagePath =
      `${normalizedConversationId}/${session.user.id}/${fileName}`;

    /*
     * Convert File -> Buffer
     */
    const arrayBuffer =
      await file.arrayBuffer();

    const buffer =
      Buffer.from(arrayBuffer);

    /*
     * Upload to Supabase Storage
     */
    const { error: uploadError } =
      await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .upload(
          storagePath,
          buffer,
          {
            contentType: file.type,
            upsert: false,
          }
        );

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
     * Get public URL
     *
     * The bucket must be configured as public.
     */
    const {
      data: { publicUrl },
    } =
      supabaseAdmin.storage
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