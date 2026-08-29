"use client";

import { useEffect, useRef, useState } from "react";

import { getSocket } from "@/lib/socket";
import type { Socket } from "socket.io-client";

interface Message {
  id: string;
  conversationId: string;
  senderId: string;

  content: string | null;

  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
  editedAt?: string | null;

  imageUrl?: string | null;
  imageName?: string | null;
  imageSize?: number | null;
  imageMimeType?: string | null;

  sender: {
    id: string;
    username: string;
    avatarUrl: string | null;
  };

  readByOtherUser?: boolean;

  deliveryStatus?: "pending" | "sent" | "failed";
}

interface ChatWindowProps {
  conversationId: string;
  currentUserId: string;
  chatUserName: string;
}

interface SocketResponse {
  success: boolean;
  error?: string;
  message?: Message;
}

export default function ChatWindow({ conversationId, currentUserId, chatUserName }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);

  const [readMessages, setReadMessages] = useState<Set<string>>(new Set());
  const [socketReady, setSocketReady] = useState(false);

  const [roomReady, setRoomReady] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const roomReadyRef = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const readMessagesRef = useRef<Set<string>>(new Set());
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const imageInputRef = useRef<HTMLInputElement>(null);
  const shouldScrollToBottomRef = useRef(true);
  const restoringOlderMessagesRef = useRef(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [deleteMessageId, setDeleteMessageId] = useState<string | null>(null);

  /*
   * Load existing messages
   */
  useEffect(() => {
    let mounted = true;

    async function loadMessages() {
      setLoading(true);

      try {
        const response = await fetch(
          `/api/conversations/${conversationId}/messages`,
          {
            cache: "no-store",
          }
        );

        if (!response.ok) {
          console.error(
            "Failed to load messages:",
            response.status
          );

          return;
        }

        const data = await response.json();

        if (!mounted) {
          return;
        }

        const loadedMessages: Message[] = data.messages ?? [];

        setMessages(loadedMessages);

        setHasMoreMessages(data.hasMore === true);

        const restoredReadMessages = new Set<string>();

        for (const message of loadedMessages) {
          if (
            message.senderId === currentUserId &&
            message.readByOtherUser === true
          ) {
            restoredReadMessages.add(message.id);
          }
        }

        readMessagesRef.current = restoredReadMessages;
        setReadMessages(restoredReadMessages);

        shouldScrollToBottomRef.current = true;
      } catch (error) {
        console.error(
          "Failed to load messages:",
          error
        );
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadMessages();

    return () => {
      mounted = false;
    };
  }, [conversationId, currentUserId]);

  /*
 * Socket lifecycle
 */
  useEffect(() => {
    let mounted = true;
    let currentSocket: Socket | null = null;
    let joined = false;

    let cleanupSocket: (() => void) | null = null;

    async function setupSocket() {
      try {
        const socket = await getSocket();

        if (!mounted) {
          return;
        }

        currentSocket = socket;
        socketRef.current = socket;

        const joinConversation = () => {
          if (!mounted) {
            return;
          }

          if (!socket.connected) {
            console.log(
              "⚠️ Cannot join conversation: socket is not connected"
            );

            setSocketReady(false);
            setRoomReady(false);

            return;
          }

          if (joined) {
            return;
          }

          socket.emit("conversation:join",
            conversationId,
            (response: SocketResponse) => {
              if (!mounted) {
                return;
              }

              if (!response.success) {
                joined = false;

                roomReadyRef.current = false;
                setRoomReady(false);

                console.error(
                  "❌ Failed to join conversation:",
                  response.error
                );

                return;
              }

              joined = true;

              roomReadyRef.current = true;
              setRoomReady(true);

              markConversationAsRead(socket);
            }
          );
        };

        const handleNewMessage = (message: Message) => {
          if (
            !mounted ||
            message.conversationId !== conversationId
          ) {
            return;
          }

          shouldScrollToBottomRef.current = true;

          setMessages((previousMessages) => {
            const exists = previousMessages.some(
              (existingMessage) =>
                existingMessage.id === message.id
            );

            if (exists) {
              return previousMessages;
            }

            if (message.senderId === currentUserId) {
              const optimisticIndex =
                previousMessages.findIndex(
                  (existingMessage) => {
                    if (
                      existingMessage.deliveryStatus !==
                      "pending"
                    ) {
                      return false;
                    }

                    if (
                      existingMessage.senderId !==
                      currentUserId
                    ) {
                      return false;
                    }

                    if (message.imageUrl) {
                      return (
                        existingMessage.imageUrl ===
                        message.imageUrl
                      );
                    }

                    return (
                      !existingMessage.imageUrl &&
                      !message.imageUrl &&
                      existingMessage.content ===
                      message.content
                    );
                  }
                );

              if (optimisticIndex !== -1) {
                const next = [
                  ...previousMessages,
                ];

                next[optimisticIndex] = {
                  ...message,
                  deliveryStatus: "sent",
                };

                return next;
              }
            }

            return [
              ...previousMessages,
              {
                ...message,
                deliveryStatus: "sent",
              },
            ];
          });
        };

        const handleMessageRead = (data: {
          messageId: string;
          conversationId: string;
          userId: string;
          readAt: string;
        }) => {
          if (
            !mounted ||
            data.conversationId !== conversationId
          ) {
            return;
          }

          setReadMessages((previous) => {
            const next = new Set(previous);

            next.add(data.messageId);

            readMessagesRef.current = next;

            return next;
          });
        };

        const handleMessageDeleted = (data: {
          messageId: string;
          conversationId: string;
          deletedAt: string;
        }) => {
          if (
            !mounted ||
            data.conversationId !== conversationId
          ) {
            return;
          }

          setMessages((previous) =>
            previous.map((message) =>
              message.id === data.messageId
                ? {
                  ...message,
                  content: "",
                  deletedAt: data.deletedAt,
                }
                : message
            )
          );
        };

        const handleMessageEdited = (data: {
          id: string;
          conversationId: string;
          senderId: string;
          content: string;
          createdAt: string;
          updatedAt: string;
          deletedAt: string | null;
          editedAt: string | null;
        }) => {
          if (
            !mounted ||
            data.conversationId !== conversationId
          ) {
            return;
          }

          setMessages((previous) =>
            previous.map((message) =>
              message.id === data.id
                ? {
                  ...message,
                  content: data.content,
                  updatedAt: data.updatedAt,
                  editedAt: data.editedAt,
                  deletedAt: data.deletedAt,
                }
                : message
            )
          );
        };

        const handleConnect = () => {
          if (!mounted) {
            return;
          }

          console.log(
            "🟢 ChatWindow socket connected:",
            socket.id
          );

          setSocketReady(true);

          joined = false;

          roomReadyRef.current = false;
          setRoomReady(false);

          joinConversation();
        };

        const handleDisconnect = (
          reason: string
        ) => {
          if (!mounted) {
            return;
          }

          console.log(
            "🟠 ChatWindow socket disconnected:",
            reason
          );

          joined = false;

          setSocketReady(false);

          roomReadyRef.current = false;
          setRoomReady(false);
        };

        const handleConnectError = (
          error: Error
        ) => {
          if (!mounted) {
            return;
          }

          console.error(
            "🔴 ChatWindow socket connection error:",
            error.message
          );

          setSocketReady(false);

          roomReadyRef.current = false;
          setRoomReady(false);
        };

        /*
         * Register listeners.
         */
        socket.on(
          "message:new",
          handleNewMessage
        );

        socket.on(
          "connect",
          handleConnect
        );

        socket.on(
          "message:read",
          handleMessageRead
        );

        socket.on(
          "message:edited",
          handleMessageEdited
        );

        socket.on(
          "message:deleted",
          handleMessageDeleted
        );

        socket.on(
          "disconnect",
          handleDisconnect
        );

        socket.on(
          "connect_error",
          handleConnectError
        );

        /*
         * Define cleanup immediately after
         * registering the listeners.
         */
        cleanupSocket = () => {
          if (joined) {
            socket.emit("conversation:leave",
              conversationId
            );
          }

          socket.off(
            "message:new",
            handleNewMessage
          );

          socket.off(
            "connect",
            handleConnect
          );

          socket.off(
            "message:read",
            handleMessageRead
          );

          socket.off(
            "message:edited",
            handleMessageEdited
          );

          socket.off(
            "message:deleted",
            handleMessageDeleted
          );

          socket.off(
            "disconnect",
            handleDisconnect
          );

          socket.off(
            "connect_error",
            handleConnectError
          );

          joined = false;

          if (
            socketRef.current === socket
          ) {
            socketRef.current = null;
          }

          roomReadyRef.current = false;
        };

        /*
         * If cleanup happened while getSocket()
         * was resolving, don't connect/join.
         */
        if (!mounted) {
          cleanupSocket();
          cleanupSocket = null;
          return;
        }

        /*
         * Socket is already connected.
         */
        if (socket.connected) {
          console.log(
            "🟢 Socket already connected:",
            socket.id
          );

          setSocketReady(true);

          joinConversation();
        } else {
          console.log(
            "🟡 Socket not connected yet. Waiting for connect..."
          );

          setSocketReady(false);
          setRoomReady(false);

          socket.connect();
        }
      } catch (error) {
        console.error(
          " Failed to initialize chat socket:",
          error
        );

        if (mounted) {
          setSocketReady(false);

          roomReadyRef.current = false;
          setRoomReady(false);
        }
      }
    }

    void setupSocket();

    /*
     *  React cleanup.
     */
    return () => {
      mounted = false;

      cleanupSocket?.();
      cleanupSocket = null;

      currentSocket = null;
      joined = false;

      roomReadyRef.current = false;

      if (socketRef.current) {
        socketRef.current = null;
      }

      setRoomReady(false);
      setSocketReady(false);
    };
  }, [conversationId]);

  function markConversationAsRead(socket: Socket) {
    if (!socket.connected || !conversationId) {
      return;
    }

    socket.emit("conversation:read", conversationId);
  }

  function markMessageAsRead(socket: Socket, messageId: string) {
    if (!socket.connected || !messageId) {
      return;
    }

    if (readMessagesRef.current.has(messageId)) {
      return;
    }

    readMessagesRef.current.add(messageId);

    socket.emit("message:read", messageId, (response: SocketResponse) => {
      if (!response.success) {

        readMessagesRef.current.delete(
          messageId
        );

        console.error("❌ Failed to mark message as read:",
          {
            messageId,
            error: response.error,
          }
        );
        return;
      }
      console.log("📖 Message marked as read:", messageId);
    }
    );
  }

  function requestDeleteMessage(
    messageId: string
  ) {
    setDeleteMessageId(messageId);
  }

  function confirmDeleteMessage() {
    const socket = socketRef.current;

    if (
      !socket ||
      !socket.connected ||
      !deleteMessageId
    ) {
      return;
    }

    socket.emit(
      "message:delete",
      deleteMessageId,
      (response: SocketResponse) => {
        if (!response.success) {
          console.error(
            "❌ Failed to delete message:",
            response.error
          );
          return;
        }

        setDeleteMessageId(null);
      }
    );
  }

  function cancelDeleteMessage() {
    setDeleteMessageId(null);
  }

  function startEditingMessage(
    message: Message
  ) {
    if (message.senderId !== currentUserId || message.deletedAt || !message.content) {
      return;
    }

    setEditingMessageId(message.id);
    setEditingContent(message.content);
  }

  function cancelEditingMessage() {
    setEditingMessageId(null);
    setEditingContent("");
  }

  function saveEditedMessage() {
    const socket = socketRef.current;

    const trimmed = editingContent.trim();

    if (!socket || !socket.connected || !editingMessageId || !trimmed) {
      return;
    }

    socket.emit(
      "message:edit",
      {
        messageId: editingMessageId,
        content: trimmed,
      },
      (response: SocketResponse) => {
        if (!response.success) {
          console.error(
            "❌ Failed to edit message:",
            response.error
          );
          return;
        }

        setEditingMessageId(null);
        setEditingContent("");
      }
    );
  }

  function getMessageStatus(message: Message) {
    if (
      message.deliveryStatus ===
      "pending"
    ) {
      return "◷";
    }

    if (
      message.deliveryStatus ===
      "failed"
    ) {
      return "!";
    }

    if (
      readMessages.has(message.id) ||
      message.readByOtherUser === true
    ) {
      return "✓✓";
    }

    return "✓";
  }

  useEffect(() => {
    const socket = socketRef.current;

    if (!socket || !socket.connected || !roomReady) {
      return;
    }

    for (const message of messages) {
      if (message.senderId === currentUserId) {
        continue;
      }

      if (message.deletedAt) {
        continue;
      }

      if (readMessagesRef.current.has(message.id)) {
        continue;
      }

      markMessageAsRead(socket, message.id);
    }
  }, [messages, currentUserId, roomReady]);

  /*
   * Auto-scroll
   */
  useEffect(() => {
    if (!shouldScrollToBottomRef.current) {
      return;
    }

    if (restoringOlderMessagesRef.current) {
      return;
    }

    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });

    shouldScrollToBottomRef.current = false;
  }, [messages]);


  async function loadPreviousMessages() {
    if (
      loadingPrevious ||
      !hasMoreMessages ||
      messages.length === 0
    ) {
      return;
    }

    const container = messagesContainerRef.current;

    const oldestMessage = messages[0];

    if (!container || !oldestMessage) {
      return;
    }

    const previousScrollHeight = container.scrollHeight;

    const previousScrollTop = container.scrollTop;

    setLoadingPrevious(true);

    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/messages?before=${encodeURIComponent(
          oldestMessage.createdAt
        )}`,
        {
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error(
          "Failed to load previous messages"
        );
      }

      const data = await response.json();

      const olderMessages: Message[] = data.messages ?? [];

      if (olderMessages.length === 0) {
        setHasMoreMessages(false);
        return;
      }

      const restoredReadMessages = new Set(readMessagesRef.current);

      for (const message of olderMessages) {
        if (message.senderId === currentUserId && message.readByOtherUser === true) {
          restoredReadMessages.add(message.id);
        }
      }

      readMessagesRef.current = restoredReadMessages;

      setReadMessages(restoredReadMessages);

      restoringOlderMessagesRef.current = true;

      setMessages((previousMessages) => {
        const existingIds = new Set(
          previousMessages.map(
            (message) => message.id
          )
        );

        const uniqueOlderMessages =
          olderMessages.filter(
            (message) =>
              !existingIds.has(message.id)
          );

        return [
          ...uniqueOlderMessages,
          ...previousMessages,
        ];
      });

      setHasMoreMessages(
        data.hasMore === true
      );

      /*
       * Restore the user's visual position
       * after the older messages are inserted.
       */
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const currentContainer = messagesContainerRef.current;

          if (!currentContainer) {
            return;
          }

          const newScrollHeight = currentContainer.scrollHeight;

          const heightDifference = newScrollHeight - previousScrollHeight;

          currentContainer.scrollTop = previousScrollTop + heightDifference;

          restoringOlderMessagesRef.current = false;
        });
      });
    } catch (error) {
      console.error("Failed to load previous messages:", error);
    } finally {
      setLoadingPrevious(false);
    }
  }

  function searchMessages() {
    const trimmed = searchQuery.trim().toLowerCase();

    if (!trimmed) {
      setSearchResults([]);
      setSearchPerformed(false);
      return;
    }

    const results = messages.filter((message) => {
      if (message.deletedAt) {
        return false;
      }

      return message.content?.toLowerCase().includes(trimmed) ?? false;
    });

    setSearchResults(results);
    setSearchPerformed(true);
  }

  function openSearchResult(message: Message) {
    setSearchOpen(false);

    requestAnimationFrame(() => {
      messageRefs.current[message.id]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }

  async function handleImageSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ];

    if (!allowedTypes.includes(file.type)) {
      console.error(
        "Only JPG, PNG, WEBP and GIF images are allowed"
      );
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      console.error(
        "Image must be smaller than 10 MB"
      );
      return;
    }

    if (!roomReady) {
      console.error(
        "Cannot send image: conversation room is not ready"
      );
      return;
    }

    try {
      setUploadingImage(true);

      console.log("🖼️ Selected image:", {
        name: file.name,
        size: file.size,
        type: file.type,
      });

      /*
       * Upload image to Next.js API.
       */
      const formData = new FormData();

      formData.append(
        "file",
        file
      );

      formData.append(
        "conversationId",
        conversationId
      );

      const uploadResponse =
        await fetch(
          "/api/messages/image",
          {
            method: "POST",
            body: formData,
            cache: "no-store",
          }
        );

      const uploadData =
        await uploadResponse.json();

      if (
        !uploadResponse.ok ||
        !uploadData.success
      ) {
        throw new Error(
          uploadData.error ||
          "Failed to upload image"
        );
      }

      console.log(
        "✅ Image uploaded successfully"
      );

      const socket =
        socketRef.current;

      if (
        !socket ||
        !socket.connected
      ) {
        throw new Error(
          "Socket is not connected"
        );
      }

      /*
       * Create optimistic ID.
       */
      const optimisticId =
        `optimistic-image-${conversationId}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`;

      /*
       * Show image immediately.
       */
      const optimisticMessage: Message = {
        id: optimisticId,

        conversationId,

        senderId:
          currentUserId,

        content: null,

        imageUrl:
          uploadData.imageUrl,

        imageName:
          uploadData.imageName,

        imageSize:
          uploadData.imageSize,

        imageMimeType:
          uploadData.imageMimeType,

        createdAt:
          new Date().toISOString(),

        updatedAt:
          new Date().toISOString(),

        deletedAt: null,

        editedAt: null,

        sender: {
          id: currentUserId,
          username: "You",
          avatarUrl: null,
        },

        deliveryStatus: "pending",
      };

      setMessages(
        (previousMessages) => [
          ...previousMessages,
          optimisticMessage,
        ]
      );

      /*
       * Send the persisted image metadata
       * through Socket.IO.
       */
      socket.emit(
        "send_message",
        {
          conversationId,

          content: null,

          imageUrl:
            uploadData.imageUrl,

          imageName:
            uploadData.imageName,

          imageSize:
            uploadData.imageSize,

          imageMimeType:
            uploadData.imageMimeType,
        },
        (
          response: SocketResponse
        ) => {
          if (
            !response.success ||
            !response.message
          ) {
            console.error(
              "❌ Failed to send image message:",
              response.error
            );

            setMessages(
              (previousMessages) =>
                previousMessages.map(
                  (message) =>
                    message.id === optimisticId
                      ? {
                        ...message,
                        deliveryStatus:
                          "failed",
                      }
                      : message
                )
            );

            return;
          }

          /*
           * Replace optimistic message
           * with the actual DB message.
           */
          setMessages(
            (previousMessages) =>
              previousMessages.map(
                (message) =>
                  message.id === optimisticId
                    ? {
                      ...response.message!,
                      deliveryStatus:
                        "sent",
                    }
                    : message
              )
          );
        }
      );

    } catch (error) {
      console.error(
        "❌ Failed to upload/send image:",
        error
      );
    } finally {
      setUploadingImage(false);
    }
  }

  /*
   * Send message
   */
  async function sendMessage() {
    const trimmed = content.trim();

    if (!trimmed) {
      return;
    }

    try {
      const socket =
        socketRef.current ??
        (await getSocket());

      socketRef.current = socket;

      if (!socket.connected) {
        console.error(
          "Cannot send message: socket is not connected"
        );
        return;
      }

      if (!roomReady) {
        console.error(
          "❌ Cannot send message: conversation room is not ready"
        );
        return;
      }

      /*
       * Create a temporary client-side ID.
       *
       * This message exists only in React state.
       */
      const optimisticId =
        `optimistic-${conversationId}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`;

      /*
       * Create optimistic message.
       */
      const optimisticMessage: Message = {
        id: optimisticId,
        conversationId,
        senderId: currentUserId,
        content: trimmed,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        editedAt: null,

        /*
         * We already know who the sender is.
         */
        sender: {
          id: currentUserId,
          username: "You",
          avatarUrl: null,
        },

        deliveryStatus: "pending",
      };

      /*
       * Immediately show the message.
       */
      setMessages((previousMessages) => [
        ...previousMessages,
        optimisticMessage,
      ]);

      /*
       * Clear the input immediately.
       */
      setContent("");

      socket.emit(
        "send_message",
        {
          conversationId,
          content: trimmed,
        },
        (response: SocketResponse) => {
          /*
           * Server rejected the message.
           */
          if (!response.success || !response.message) {
            console.error(
              "❌ Failed to send message:",
              response.error
            );

            setMessages((previousMessages) =>
              previousMessages.map((message) =>
                message.id === optimisticId
                  ? {
                    ...message,
                    deliveryStatus: "failed",
                  }
                  : message
              )
            );

            return;
          }

          /*
           * Server successfully persisted the message.
           *
           * Replace optimistic message with the
           * actual database message.
           */
          setMessages((previousMessages) =>
            previousMessages.map((message) =>
              message.id === optimisticId
                ? {
                  ...response.message!,
                  deliveryStatus: "sent",
                }
                : message
            )
          );
        }
      );
    } catch (error) {
      console.error(
        "Failed to send message:",
        error
      );
    }
  }

  return (
    <div className="flex h-150 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5">

      {/* Header */}
      {/* Header */}
      <div className="relative border-b border-white/10 px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-white">
              {chatUserName}
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              {roomReady
                ? "Realtime connected"
                : socketReady
                  ? "Joining conversation..."
                  : "Connecting..."}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-4">
            {/* Search button */}
            <button
              type="button"
              onClick={() => {
                setSearchOpen((previous) => !previous);

                if (searchOpen) {
                  setSearchQuery("");
                  setSearchResults([]);
                }
              }}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
              title="Search messages"
            >
              🔍
            </button>

            {/* Connection status */}
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${roomReady
                  ? "bg-emerald-400"
                  : socketReady
                    ? "bg-amber-400"
                    : "bg-red-400"
                  }`}
              />

              <span className="text-xs text-slate-400">
                {roomReady
                  ? "Live"
                  : socketReady
                    ? "Joining"
                    : "Offline"}
              </span>
            </div>
          </div>
        </div>

        {/* Search */}
        {searchOpen && (
          <div className="mt-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      searchMessages();
                    }

                    if (event.key === "Escape") {
                      setSearchOpen(false);
                      setSearchQuery("");
                      setSearchResults([]);
                      setSearchPerformed(false);
                    }
                  }}
                  autoFocus
                  placeholder="Search messages..."
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 pr-10 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400"
                />

                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setSearchResults([]);
                      setSearchPerformed(false);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-white"
                    title="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={searchMessages}
                disabled={!searchQuery.trim()}
                className="rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Search
              </button>

              <button
                type="button"
                onClick={() => {
                  setSearchOpen(false);
                  setSearchQuery("");
                  setSearchResults([]);
                  setSearchPerformed(false);
                }}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-lg leading-none text-slate-400 transition hover:bg-white/10 hover:text-white"
                title="Close search"
                aria-label="Close search"
              >
                ×
              </button>
            </div>


            {/* Search results */}
            {searchPerformed && (
              <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-slate-950 shadow-xl">
                {searchResults.length === 0 ? (
                  <div className="p-4 text-center">
                    <p className="text-xs text-slate-500">
                      No messages found in current messages.
                    </p>

                    {hasMoreMessages && (
                      <p className="mt-1 text-[11px] text-slate-600">
                        Go to previous messages to search older messages.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {searchResults.map((message) => (
                      <button
                        key={message.id}
                        type="button"
                        onClick={() => void openSearchResult(message)}
                        className="w-full px-4 py-3 text-left transition hover:bg-white/5"
                      >
                        <p className="text-xs font-medium text-cyan-400">
                          {message.sender.username}
                        </p>

                        <p className="mt-1 line-clamp-2 text-sm text-slate-300">
                          {message.deletedAt ? "This message was deleted" : message.content}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <p className="text-sm text-slate-500">
            Loading messages...
          </p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-slate-500">
            No messages yet.
          </p>
        ) : (

          <>
            {!loading && hasMoreMessages && (
              <div className="mb-4 flex justify-center">
                <button
                  onClick={loadPreviousMessages}
                  disabled={loadingPrevious}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loadingPrevious
                    ? "Loading previous messages..."
                    : "See previous messages"}
                </button>
              </div>
            )}

            <div className="space-y-3">
              {messages.map(
                (message) => {
                  const own =
                    message.senderId === currentUserId;

                  return (
                    <div
                      key={message.id}
                      ref={(element) => {
                        messageRefs.current[message.id] = element;
                      }}
                      className={`flex ${own ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-3 ${own
                          ? "bg-cyan-500 text-slate-950"
                          : "bg-slate-800 text-white"
                          }`}
                      >
                        {!own && (
                          <p className="mb-1 text-xs font-medium opacity-60">
                            {
                              message.sender.username
                            }
                          </p>
                        )}

                        {own && !message.deletedAt && (
                          <div className="mb-2 flex justify-end gap-1">
                            <button
                              onClick={() =>
                                startEditingMessage(message)
                              }
                              className="rounded-md px-2 py-1 text-[10px] text-slate-700 hover:bg-black/10"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() =>
                                requestDeleteMessage(message.id)
                              }
                              className="rounded-md px-2 py-1 text-[10px] text-red-700 hover:bg-black/10"
                            >
                              Delete
                            </button>
                          </div>
                        )}

                        {message.deletedAt ? (
                          <p className="text-sm italic opacity-60">
                            This message was deleted
                          </p>
                        ) : editingMessageId === message.id ? (
                          <div className="min-w-[240px]">
                            <textarea
                              value={editingContent}
                              onChange={(event) =>
                                setEditingContent(
                                  event.target.value
                                )
                              }
                              autoFocus
                              className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                              rows={3}
                            />

                            <div className="mt-2 flex justify-end gap-2">
                              <button
                                onClick={cancelEditingMessage}
                                className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:bg-white/10"
                              >
                                Cancel
                              </button>

                              <button
                                onClick={saveEditedMessage}
                                disabled={!editingContent.trim()}
                                className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-end gap-2">
                            {message.imageUrl ? (
                              <div className="space-y-2">
                                <img
                                  src={message.imageUrl}
                                  alt={message.imageName ?? "Image"}
                                  className="max-h-96 max-w-full rounded-xl object-contain"
                                  loading="lazy"
                                />

                                <div className="flex items-end gap-2">
                                  {message.imageName && (
                                    <p className="max-w-48 truncate text-xs opacity-60">
                                      {message.imageName}
                                    </p>
                                  )}

                                  {own && (
                                    <span
                                      className={`text-[11px] ${message.deliveryStatus === "failed"
                                        ? "text-red-700"
                                        : readMessages.has(message.id) ||
                                          message.readByOtherUser === true
                                          ? "text-blue-900"
                                          : "text-slate-700"
                                        }`}
                                    >
                                      {getMessageStatus(message)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-end gap-2">
                                <p className="wrap-break-word text-sm">
                                  {message.content}
                                </p>

                                {message.editedAt && (
                                  <span className="shrink-0 text-[10px] opacity-50">
                                    edited
                                  </span>
                                )}

                                {own && (
                                  <span
                                    className={`text-[11px] ${message.deliveryStatus === "failed"
                                      ? "text-red-700"
                                      : readMessages.has(message.id)
                                        ? "text-blue-900"
                                        : "text-slate-700"
                                      }`}
                                    title={
                                      message.deliveryStatus === "pending" ? "Sending..." : message.deliveryStatus === "failed"
                                        ? "Failed to send"
                                        : readMessages.has(message.id) ? "Read" : "Sent"
                                    }
                                  >
                                    {message.deliveryStatus === "pending" ? "◷" : message.deliveryStatus === "failed" ? "!" : readMessages.has(message.id)
                                      ? "✓✓"
                                      : "✓"}
                                  </span>
                                )}
                              </div>
                            )}

                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
              )}

              <div
                ref={messagesEndRef}
              />
            </div>
          </>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-white/10 p-4">
        <div className="flex gap-3">
          {/* Image picker */}
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={!roomReady || uploadingImage}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            title="Send image"
          >
            🖼️
          </button>

          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelected}
          />

          <input
            value={content}
            onChange={(event) =>
              setContent(event.target.value)
            }
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey
              ) {
                event.preventDefault();
                sendMessage();
              }
            }}
            placeholder={
              roomReady
                ? "Type a message..."
                : "Connecting to conversation..."
            }
            disabled={!roomReady}
            className="flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          />

          <button
            onClick={sendMessage}
            disabled={
              !content.trim() ||
              !roomReady
            }
            className="rounded-xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
      {deleteMessageId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">
              Delete message?
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              Message deleted will be deleted for both users.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={cancelDeleteMessage}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/5"
              >
                Cancel
              </button>

              <button
                onClick={confirmDeleteMessage}
                className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-400"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}