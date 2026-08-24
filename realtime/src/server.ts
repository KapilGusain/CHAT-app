import dotenv from "dotenv";
import path from "path";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";

import { connectValkey, pubClient, subClient } from "./redis.js";
import { addConnection, removeConnection } from "./presence.js";
import { verifyRealtimeToken, } from "./auth.js";

import { prisma } from "@chat/db";

import { isConversationMember, markConversationAsRead, getConversation, } from "./services/conversation.js";
import { markMessageAsRead } from "./services/message.js";

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

    const { userId } =
      await verifyRealtimeToken(token);

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

const instanceId =
  process.env.INSTANCE_ID ??
  "unknown";

io.on("connection", async (socket) => {

  const userId = socket.data.userId as string;

  const userRoom = `user:${userId}`;

  await socket.join(userRoom);

  console.log("👤 Socket joined user room:",
    {
      userId,
      socketId: socket.id,
      room: userRoom,
    }
  );


  /*
   * SEND MESSAGE
   */

  socket.on("send_message",
    async (
      payload: {
        conversationId?: string;
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

        const conversationId =
          typeof payload?.conversationId === "string" ? payload.conversationId.trim() : "";

        const content = typeof payload?.content === "string" ? payload.content.trim() : "";

        if (!conversationId) {
          return callback?.({
            success: false,
            error:
              "Conversation ID is required",
          });
        }

        if (!content) {
          return callback?.({
            success: false,
            error:
              "Message cannot be empty",
          });
        }

        if (content.length > 5000) {
          return callback?.({
            success: false,
            error:
              "Message is too long",
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

        const message = await prisma.message.create({
          data: {
            conversationId,
            senderId: userId,
            content,
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

        await prisma.conversation.update({
          where: {
            id: conversationId,
          },
          data: {
            updatedAt: new Date(),
          },
        });

        const conversation = await prisma.conversation.findUnique({
          where: {
            id: conversationId,
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

        const messagePayload = {
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          content: message.content,
          createdAt: message.createdAt.toISOString(),
          updatedAt: message.updatedAt.toISOString(),
          sender: message.sender,
        };

        const room = `conversation:${conversationId}`;

        io.to(room).emit("message:new", messagePayload);

        for (const member of conversation.members) {
          if (member.userId === userId) {
            continue;
          }
          io.to(`user:${member.userId}`).emit("conversation:updated", messagePayload);
          io.to(`user:${member.userId}`).emit("conversation:unread",
            {
              conversationId,
              message: messagePayload,
            }
          );
        }
        callback?.({
          success: true,
        });

      } catch (error) {
        console.error(
          "send_message error:",
          error
        );

        callback?.({
          success: false,
          error:
            "Failed to send message",
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
   * LEAVE CONVERSATION
   */

  socket.on("conversation:leave",
    async (
      conversationId: string
    ) => {
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

  socket.on("disconnect",
    async (reason) => {
      console.log(
        `🟠 User ${userId} disconnected`,
        {
          socketId: socket.id,
          reason,
          instanceId,
        }
      );

      const stillOnline =
        await removeConnection(
          userId,
          socket.id
        );

      if (!stillOnline) {
        io.emit("presence:update",
          {
            userId,
            status: "OFFLINE",
          }
        );
      }
    }
  );

  void addConnection(userId, socket.id)
    .then(() => {
      io.emit("presence:update", {
        userId,
        status: "ONLINE",
      });
    })
    .catch((error) => {
      console.error(
        "Failed to add realtime connection:",
        error
      );
    });
}
);


const PORT =
  Number(process.env.PORT) || 4000;

async function startServer() {
  try {
    await connectValkey();

    io.adapter(
      createAdapter(
        pubClient,
        subClient
      )
    );

    console.log(
      "✓ Socket.IO Valkey adapter enabled"
    );

    httpServer.listen(
      PORT,
      () => {
        console.log(
          `🚀 Realtime server running on port ${PORT}`
        );
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