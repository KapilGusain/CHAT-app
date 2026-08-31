import dotenv from "dotenv";
import path from "path";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";

import { connectValkey, pubClient, subClient } from "./redis.js";
import { addConnection, removeConnection, syncConnections } from "./presence.js";
import { verifyRealtimeToken, } from "./auth.js";

import { prisma } from "@chat/db";

import { isConversationMember, markConversationAsRead } from "./services/conversation.js";
import { markMessageAsRead, deleteMessage, editMessage } from "./services/message.js";

dotenv.config({
  path: path.resolve(
    process.cwd(),
    "../.env"
  ),
});


const app = express();

const webUrl =
  process.env.NEXT_PUBLIC_WEB_URL ??
  "http://localhost:3000";

app.use(
  cors({
    origin: webUrl,
    credentials: true,
  })
);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "realtime",
  });
});

app.post("/internal/emit", (req, res) => {
  const internalSecret = process.env.REALTIME_INTERNAL_SECRET;

  if (!internalSecret || req.headers["x-internal-secret"] !== internalSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { room, event, payload } = req.body ?? {};

  if (typeof room !== "string" || typeof event !== "string") {
    return res.status(400).json({ error: "room and event are required" });
  }

  io.to(room).emit(event, payload);

  return res.json({ success: true });
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: webUrl,
    credentials: true,
  },
});

/*
 * SOCKET AUTH
 */

io.use(async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token;

    if (
      typeof token !== "string" ||
      !token
    ) {
      console.error(
        "Socket authentication failed: token missing"
      );

      return next(
        new Error(
          "Authentication required"
        )
      );
    }

    const { userId } = await verifyRealtimeToken(token);

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },

      select: {
        id: true,
      },
    });

    if (!user) {
      console.error(
        "Socket authentication failed: user not found",
        {
          userId,
        }
      );

      return next(
        new Error(
          "User not found"
        )
      );
    }

    socket.data.userId = user.id;

    next();
  } catch (error) {
    console.error(
      "Socket authentication failed:",
      error
    );

    next(
      new Error(
        "Authentication failed"
      )
    );
  }
});

/*
 * CONNECTION
 */

const instanceId = process.env.INSTANCE_ID ?? "unknown";


io.on("connection", async (socket) => {

  const userId = socket.data.userId as string;
  const userRoom = `user:${userId}`;
  await socket.join(userRoom);

  /*
 * Presence synchronization.
 */
  async function syncUserPresence(userId: string) {
    try {
      const sockets = await io
        .in(`user:${userId}`)
        .fetchSockets();

      const activeSocketIds = sockets.map(
        (activeSocket) => activeSocket.id
      );

      await syncConnections(userId, activeSocketIds);

      const isOnline = activeSocketIds.length > 0;

      const lastSeenAt = isOnline ? null : new Date();

      await prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          status: isOnline
            ? "ONLINE"
            : "OFFLINE",
          lastSeenAt,
        },
      });

      io.emit("presence:update", {
        userId,
        status: isOnline
          ? "ONLINE"
          : "OFFLINE",
        lastSeenAt: lastSeenAt
          ? lastSeenAt.toISOString()
          : null,
      });

      console.log(
        "📡 Presence synchronized:",
        {
          userId,
          status: isOnline
            ? "ONLINE"
            : "OFFLINE",
          activeSockets:
            activeSocketIds.length,
          socketIds: activeSocketIds,
        }
      );

      return {
        isOnline,
        connectionCount:
          activeSocketIds.length,
        socketIds: activeSocketIds,
      };
    } catch (error) {
      console.error(
        "Failed to synchronize user presence:",
        error
      );

      throw error;
    }
  }

  const connectionRegistration = addConnection(userId, socket.id);

  void connectionRegistration.then(async () => {
    try {
      const presence =
        await syncUserPresence(userId);

      console.log(
        "📡 User is now ONLINE:",
        {
          userId,
          socketId: socket.id,
          activeSockets:
            presence.connectionCount,
          socketIds:
            presence.socketIds,
        }
      );
    } catch (error) {
      console.error(
        "Failed to update online presence:",
        error
      );
    }
  })
    .catch((error) => {
      console.error(
        "Failed to register realtime connection:",
        error
      );
    });

  console.log("👤 Socket joined user room:",
    {
      userId,
      socketId: socket.id,
      room: userRoom,
    });

  /*
   * SEND MESSAGE
   */

  socket.on("send_message", async (
    payload: {
      conversationId?: string;
      content?: string | null;

      imageUrl?: string | null;
      imageName?: string | null;
      imageSize?: number | null;
      imageMimeType?: string | null;
    },
    callback?: (
      response: {
        success: boolean;
        error?: string;
        message?: {
          id: string;
          conversationId: string;
          senderId: string;

          content: string | null;

          imageUrl: string | null;
          imageName: string | null;
          imageSize: number | null;
          imageMimeType: string | null;

          createdAt: string;
          updatedAt: string;
          deletedAt: Date | null;
          editedAt: Date | null;
          sender: {
            id: string;
            username: string;
            avatarUrl: string | null;
          };
        };
      }
    ) => void
  ) => {
    try {
      const userId =
        socket.data.userId as string;

      const conversationId =
        typeof payload?.conversationId === "string"
          ? payload.conversationId.trim()
          : "";

      const content =
        typeof payload?.content === "string"
          ? payload.content.trim()
          : null;

      const imageUrl =
        typeof payload?.imageUrl === "string"
          ? payload.imageUrl.trim()
          : null;

      const imageName =
        typeof payload?.imageName === "string"
          ? payload.imageName
          : null;

      const imageSize =
        typeof payload?.imageSize === "number"
          ? payload.imageSize
          : null;

      const imageMimeType =
        typeof payload?.imageMimeType === "string"
          ? payload.imageMimeType
          : null;

      /*
       * Conversation validation
       */
      if (!conversationId) {
        return callback?.({
          success: false,
          error: "Conversation ID is required",
        });
      }

      /*
       * Determine message type.
       */
      const hasText = Boolean(content);
      const hasImage = Boolean(imageUrl);

      /*
       * A message must contain something.
       */
      if (!hasText && !hasImage) {
        return callback?.({
          success: false,
          error: "Message cannot be empty",
        });
      }

      /*
       * Currently we support either text OR image.
       * Captions can be added later.
       */
      if (hasText && hasImage) {
        return callback?.({
          success: false,
          error: "Message cannot contain both text and image",
        });
      }

      /*
       * Text validation
       */
      if (hasText && content && content.length > 5000) {
        return callback?.({
          success: false,
          error: "Message is too long",
        });
      }

      /*
       * Image validation
       */
      if (hasImage) {
        const allowedImageTypes = [
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/gif",
        ];

        if (
          !imageMimeType ||
          !allowedImageTypes.includes(imageMimeType)
        ) {
          return callback?.({
            success: false,
            error: "Invalid image type",
          });
        }

        if (
          typeof imageSize !== "number" ||
          imageSize <= 0 ||
          imageSize > 10 * 1024 * 1024
        ) {
          return callback?.({
            success: false,
            error: "Invalid image size",
          });
        }

        if (!imageName) {
          return callback?.({
            success: false,
            error: "Image name is required",
          });
        }
      }

      /*
       * Verify conversation membership.
       */
      const member = await isConversationMember(
        conversationId,
        userId
      );

      if (!member) {
        return callback?.({
          success: false,
          error:
            "You are not a member of this conversation",
        });
      }

      /*
       * Persist the message.
       */
      const existingMessage =
        await prisma.message.findFirst({
          where: {
            conversationId,
          },
          select: {
            id: true,
          },
        });

      const isFirstMessage = !existingMessage;

      const message = await prisma.message.create({
        data: {
          conversationId,
          senderId: userId,
          content,
          imageUrl,
          imageName,
          imageSize,
          imageMimeType,
        },

        include: {
          sender: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
            },
          },
        },
      });

      /*
       * Update conversation timestamp.
       */
      await prisma.conversation.update({
        where: {
          id: conversationId,
        },

        data: {
          updatedAt: new Date(),
        },
      });

      /*
       * Get conversation members.
       */
      const conversation = await prisma.conversation.findUnique({
        where: {
          id: conversationId,
        },

        select: {
          id: true,
          type: true,
          name: true,
          createdAt: true,
          updatedAt: true,

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

      if (!conversation) {
        return callback?.({
          success: false,
          error: "Conversation not found",
        });
      }

      /*
       * Create the exact payload sent to clients.
       */
      const messagePayload = {
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

        deletedAt: message.deletedAt,

        editedAt: message.editedAt,

        sender: message.sender,
      };

      const conversationPayload = {
        id: conversation.id,
        type: conversation.type,
        name: conversation.name,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),

        members: conversation.members,

        messages: [
          {
            id: message.id,
            content: message.content,
            senderId: message.senderId,
            createdAt: message.createdAt.toISOString(),
            deletedAt: message.deletedAt ? message.deletedAt.toISOString() : null,
            editedAt: message.editedAt ? message.editedAt.toISOString() : null,
          },
        ],

        unreadCount: 0,
      };

      const room = `conversation:${conversationId}`;

      /*
       * Broadcast to everyone currently inside
       * the conversation.
       */
      io.to(room).emit("message:new", messagePayload);

      /*
       * Notify conversation members through
       * their user rooms.
       */
      for (const member of conversation.members) {
        if (member.userId === userId) {
          continue;
        }

        if (isFirstMessage) {
          io.to(`user:${member.userId}`).emit(
            "conversation:new",
            {
              ...conversationPayload,
              unreadCount: 1,
            }
          );
        }

        io.to(`user:${member.userId}`).emit(
          "conversation:unread",
          {
            conversationId,
            message: messagePayload,
            conversation: conversationPayload,
          }
        );
      }

      /*
       * Acknowledge persistence to sender.
       */
      callback?.({
        success: true,
        message: messagePayload,
      });

    } catch (error) {
      console.error(
        "send_message error:",
        error
      );

      callback?.({
        success: false,
        error: "Failed to send message",
      });
    }
  }
  );

  /*
   * JOIN CONVERSATION
   */

  socket.on("conversation:join", async (
    conversationId: string,
    callback?: (
      response: {
        success: boolean;
        error?: string;
      }
    ) => void
  ) => {
    try {
      const userId =
        socket.data.userId as string;

      if (
        typeof conversationId !==
        "string" ||
        !conversationId.trim()
      ) {
        return callback?.({
          success: false,
          error:
            "Conversation ID is required",
        });
      }

      const member = await isConversationMember(
        conversationId,
        userId
      );

      if (!member) {
        return callback?.({
          success: false,
          error:
            "You are not a member of this conversation",
        });
      }

      const room = `conversation:${conversationId}`;

      await socket.join(room);

      console.log("Socket joined room");

      callback?.({
        success: true,
      });
    } catch (error) {
      console.error(
        " conversation:join error:",
        error
      );

      callback?.({
        success: false,
        error:
          "Unable to join conversation",
      });
    }
  }

  );

  /*
 * MARK AS READ
 */

  socket.on("conversation:read", async (
    conversationId: string,
    callback?: (
      response: {
        success: boolean;
        error?: string;
      }
    ) => void
  ) => {
    try {
      const userId = socket.data.userId as string;

      if (
        typeof conversationId !== "string" ||
        !conversationId.trim()
      ) {
        return callback?.({
          success: false,
          error: "Conversation ID is required",
        });
      }

      const member = await isConversationMember(
        conversationId,
        userId
      );

      if (!member) {
        return callback?.({
          success: false,
          error:
            "You are not a member of this conversation",
        });
      }

      await markConversationAsRead(
        conversationId,
        userId
      );

      /*
       * Notify this user's other tabs/windows.
       */
      io.to(`user:${userId}`).emit("conversation:read",
        {
          conversationId,
          userId,
        }
      );

      callback?.({
        success: true,
      });
    } catch (error) {
      console.error(
        "conversation:read error:",
        error
      );

      callback?.({
        success: false,
        error:
          "Unable to mark conversation as read",
      });
    }
  }
  );

  /*
 * MARK MESSAGE AS READ
 */

  socket.on("message:read",
    async (
      messageId: string,
      callback?: (
        response: {
          success: boolean;
          error?: string;
        }
      ) => void
    ) => {
      try {
        const userId =
          socket.data.userId as string;

        if (
          typeof messageId !== "string" ||
          !messageId.trim()
        ) {
          return callback?.({
            success: false,
            error: "Message ID is required",
          });
        }

        const result = await markMessageAsRead(
          messageId,
          userId
        );

        if (!result) {
          return callback?.({
            success: true,
          });
        }

        await markConversationAsRead(result.conversationId, userId);

        io.to(`user:${result.senderId}`).emit(
          "message:read",
          {
            messageId: result.messageId,
            conversationId: result.conversationId,
            userId,
            readAt: result.readAt.toISOString(),
          }
        );

        callback?.({
          success: true,
        });
      } catch (error) {
        console.error(
          "message:read error:",
          error
        );

        callback?.({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Unable to mark message as read",
        });
      }
    }
  );

  /*
 * DELETE MESSAGE
 */

  socket.on("message:delete",
    async (
      messageId: string,
      callback?: (
        response: {
          success: boolean;
          error?: string;
        }
      ) => void
    ) => {
      try {
        const userId =
          socket.data.userId as string;

        if (
          typeof messageId !== "string" ||
          !messageId.trim()
        ) {
          return callback?.({
            success: false,
            error: "Message ID is required",
          });
        }

        const result =
          await deleteMessage(
            messageId,
            userId
          );

        if (!result) {
          return callback?.({
            success: true,
          });
        }

        const conversation = await prisma.conversation.findUnique({
          where: {
            id: result.conversationId,
          },
          select: {
            members: {
              select: {
                userId: true,
              },
            },
          },
        });

        if (!conversation) {
          return callback?.({
            success: false,
            error: "Conversation not found",
          });
        }

        const deletePayload = {
          messageId: result.id,
          conversationId:
            result.conversationId,
          deletedAt:
            result.deletedAt?.toISOString() ??
            new Date().toISOString(),
        };

        for (const member of conversation.members) {
          io.to(`user:${member.userId}`).emit(
            "message:deleted",
            deletePayload
          );
        }

        callback?.({
          success: true,
        });
      } catch (error) {
        console.error(
          "message:delete error:",
          error
        );

        callback?.({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Unable to delete message",
        });
      }
    }
  );

  /*
 * EDIT MESSAGE
 */

  socket.on("message:edit",
    async (
      payload: {
        messageId?: string;
        content?: string;
      },
      callback?: (
        response: {
          success: boolean;
          error?: string;
        }
      ) => void
    ) => {
      try {
        const userId =
          socket.data.userId as string;

        const messageId =
          typeof payload?.messageId === "string"
            ? payload.messageId.trim()
            : "";

        const content =
          typeof payload?.content === "string"
            ? payload.content.trim()
            : "";

        if (!messageId) {
          return callback?.({
            success: false,
            error: "Message ID is required",
          });
        }

        if (!content) {
          return callback?.({
            success: false,
            error: "Message cannot be empty",
          });
        }

        if (content.length > 5000) {
          return callback?.({
            success: false,
            error: "Message is too long",
          });
        }

        const result = await editMessage(
          messageId,
          userId,
          content
        );

        const conversation = await prisma.conversation.findUnique({
          where: {
            id: result.conversationId,
          },
          select: {
            members: {
              select: {
                userId: true,
              },
            },
          },
        });

        if (!conversation) {
          return callback?.({
            success: false,
            error: "Conversation not found",
          });
        }

        const editPayload = {
          id: result.id,
          conversationId: result.conversationId,
          senderId: result.senderId,
          content: result.content,
          createdAt: result.createdAt.toISOString(),
          updatedAt: result.updatedAt.toISOString(),
          deletedAt: result.deletedAt,
          editedAt: result.editedAt?.toISOString() ?? null,
        };

        for (const member of conversation.members) {
          io.to(`user:${member.userId}`).emit(
            "message:edited",
            editPayload
          );
        }

        callback?.({
          success: true,
        });
      } catch (error) {
        console.error(
          "message:edit error:",
          error
        );

        callback?.({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Unable to edit message",
        });
      }
    }
  );


  /*
   * LEAVE CONVERSATION
   */

  socket.on("conversation:leave",
    async (conversationId: string) => {
      if (!conversationId) {
        return;
      }

      await socket.leave(
        `conversation:${conversationId}`
      );
    }
  );

  /*
   * DISCONNECT
   */
  
  socket.on("disconnect", async (reason) => {
      console.log(
        `🟠 User ${userId} disconnected`,
        {
          socketId: socket.id,
          reason,
          instanceId,
        }
      );

      try {
        /*
         * Make sure this socket was registered before
         * attempting to remove it.
         */
        await connectionRegistration;

        /*
         * Remove this socket from Valkey.
         */
        await removeConnection(
          userId,
          socket.id
        );

        /*
         * IMPORTANT:
         * Socket.IO is now authoritative.
         *
         * This detects:
         * - stale Valkey socket IDs
         * - sockets on another realtime instance
         * - multiple tabs/devices
         */
        const presence =
          await syncUserPresence(
            userId
          );

        console.log(
          "📡 Disconnect presence result:",
          {
            userId,
            disconnectedSocketId:
              socket.id,
            remainingConnections:
              presence.connectionCount,
            remainingSocketIds:
              presence.socketIds,
            status: presence.isOnline
              ? "ONLINE"
              : "OFFLINE",
          }
        );
      } catch (error) {
        console.error(
          "Failed to synchronize disconnect presence:",
          error
        );
      }
    }
  );

}
);

const PORT = Number(process.env.PORT) || 4000;

async function startServer() {
  try {
    await connectValkey();

    io.adapter(createAdapter(
      pubClient,
      subClient
    )
    );

    console.log("✓ Socket.IO Valkey adapter enabled");

    httpServer.listen(PORT,
      () => {
        console.log(`🚀 Realtime server running on port ${PORT}`);
      }
    );
  } catch (error) {
    console.error(
      "Failed to start realtime server:",
      error
    );

    process.exit(1);
  }
}

startServer();