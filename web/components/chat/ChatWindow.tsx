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
  conversationId?: string;
  currentUserId: string;
  chatUserName: string;
  targetUserId?: string;
}

interface SocketResponse {
  success: boolean;
  error?: string;
  message?: Message;
}

export default function ChatWindow({ conversationId, currentUserId, chatUserName, targetUserId }: ChatWindowProps) {
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

  const [activeConversationId, setActiveConversationId] = useState<string | null>(conversationId ?? null);
  const activeConversationIdRef = useRef<string | null>(conversationId ?? null);
  const joinedConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  const hasRealConversation = Boolean(activeConversationId);

  /*
   * Socket lifecycle
   */
  useEffect(() => {
    let mounted = true;
    let cleanupSocket: (() => void) | null = null;

    async function setupSocket() {
      try {
        const socket = await getSocket();

        if (!mounted) {
          return;
        }

        socketRef.current = socket;

        const joinCurrentConversation = async () => {
          const currentConversationId =
            activeConversationIdRef.current;

          if (!mounted || !currentConversationId) {
            roomReadyRef.current = false;
            setRoomReady(false);
            return;
          }

          if (!socket.connected) {
            setSocketReady(false);
            roomReadyRef.current = false;
            setRoomReady(false);
            return;
          }

          if (
            joinedConversationIdRef.current ===
            currentConversationId
          ) {
            roomReadyRef.current = true;
            setRoomReady(true);
            return;
          }

          const previousConversationId =
            joinedConversationIdRef.current;

          if (
            previousConversationId &&
            previousConversationId !==
            currentConversationId
          ) {
            socket.emit(
              "conversation:leave",
              previousConversationId
            );

            joinedConversationIdRef.current =
              null;

            roomReadyRef.current = false;
            setRoomReady(false);
          }

          try {
            await joinConversationRoom(
              socket,
              currentConversationId
            );

            if (!mounted) {
              return;
            }

            markConversationAsRead(
              socket,
              currentConversationId
            );
          } catch (error) {
            console.error(
              " Failed to join conversation:",
              error
            );

            if (mounted) {
              joinedConversationIdRef.current =
                null;

              roomReadyRef.current = false;
              setRoomReady(false);
            }
          }
        };

        const handleConnect = () => {
          if (!mounted) {
            return;
          }

          console.log(
            " ChatWindow socket connected:",
            socket.id
          );

          setSocketReady(true);

          joinedConversationIdRef.current =
            null;

          roomReadyRef.current = false;
          setRoomReady(false);

          void joinCurrentConversation();
        };

        const handleDisconnect = (
          reason: string
        ) => {
          if (!mounted) {
            return;
          }

          console.log(
            " ChatWindow socket disconnected:",
            reason
          );

          joinedConversationIdRef.current =
            null;

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
            " ChatWindow socket connection error:",
            error.message
          );

          setSocketReady(false);
          joinedConversationIdRef.current = null;

          roomReadyRef.current = false;
          setRoomReady(false);
        };

        const handleNewMessage = (
          message: Message
        ) => {
          const currentConversationId =
            activeConversationIdRef.current;

          if (
            !mounted ||
            !currentConversationId ||
            message.conversationId !==
            currentConversationId
          ) {
            return;
          }

          shouldScrollToBottomRef.current = true;

          setMessages((previousMessages) => {
            const exists =
              previousMessages.some(
                (existingMessage) =>
                  existingMessage.id ===
                  message.id
              );

            if (exists) {
              return previousMessages;
            }

            if (
              message.senderId ===
              currentUserId
            ) {
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
          if (!mounted || data.conversationId !== activeConversationIdRef.current) {
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
          if (!mounted || data.conversationId !== activeConversationIdRef.current) {
            return;
          }

          setMessages((previous) =>
            previous.map((message) =>
              message.id === data.messageId
                ? {
                  ...message,
                  content: "",
                  deletedAt:
                    data.deletedAt,
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
          if (!mounted || data.conversationId !== activeConversationIdRef.current) {
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

        socket.on(
          "connect",
          handleConnect
        );

        socket.on(
          "disconnect",
          handleDisconnect
        );

        socket.on(
          "connect_error",
          handleConnectError
        );

        socket.on(
          "message:new",
          handleNewMessage
        );

        socket.on(
          "message:read",
          handleMessageRead
        );

        socket.on(
          "message:deleted",
          handleMessageDeleted
        );

        socket.on(
          "message:edited",
          handleMessageEdited
        );

        cleanupSocket = () => {
          const joinedConversationId =
            joinedConversationIdRef.current;

          if (joinedConversationId) {
            socket.emit(
              "conversation:leave",
              joinedConversationId
            );
          }

          socket.off(
            "connect",
            handleConnect
          );

          socket.off(
            "disconnect",
            handleDisconnect
          );

          socket.off(
            "connect_error",
            handleConnectError
          );

          socket.off(
            "message:new",
            handleNewMessage
          );

          socket.off(
            "message:read",
            handleMessageRead
          );

          socket.off(
            "message:deleted",
            handleMessageDeleted
          );

          socket.off(
            "message:edited",
            handleMessageEdited
          );

          joinedConversationIdRef.current =
            null;

          roomReadyRef.current = false;

          if (socketRef.current === socket) {
            socketRef.current = null;
          }
        };

        if (socket.connected) {
          setSocketReady(true);
          await joinCurrentConversation();
          
        } else {
          setSocketReady(false);

          roomReadyRef.current = false;
          setRoomReady(false);

          console.log(
            " ChatWindow waiting for SocketProvider connection..."
          );
        }
      } catch (error) {
        console.error(
          " Failed to initialize chat socket:",
          error
        );

        if (mounted) {
          setSocketReady(false);

          joinedConversationIdRef.current =
            null;

          roomReadyRef.current = false;
          setRoomReady(false);
        }
      }
    }

    void setupSocket();

    return () => {
      mounted = false;

      cleanupSocket?.();
      cleanupSocket = null;

      setRoomReady(false);
      setSocketReady(false);
    };
  }, [currentUserId]);

  useEffect(() => {
    const currentConversationId = activeConversationId;

    if (!currentConversationId) {
      setMessages([]);
      setHasMoreMessages(false);
      setLoading(false);

      readMessagesRef.current =
        new Set();

      setReadMessages(new Set());

      return;
    }

    let mounted = true;

    async function loadMessages() {
      setLoading(true);

      try {
        const response = await fetch(
          `/api/conversations/${currentConversationId}/messages`,
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
          if (message.senderId === currentUserId && message.readByOtherUser === true) {
            restoredReadMessages.add(message.id);
          }
        }

        readMessagesRef.current = restoredReadMessages;
        setReadMessages(restoredReadMessages);
        shouldScrollToBottomRef.current = true;

      } catch (error) {
        console.error("Failed to load messages:", error);
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
  }, [activeConversationId, currentUserId]);

  function markConversationAsRead(
    socket: Socket,
    conversationId: string
  ) {
    if (
      !socket.connected ||
      !conversationId
    ) {
      return;
    }

    socket.emit(
      "conversation:read",
      conversationId
    );
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

        console.error(" Failed to mark message as read:",
          {
            messageId,
            error: response.error,
          }
        );
        return;
      }
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
            " Failed to delete message:",
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
            " Failed to edit message:",
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
        `/api/conversations/${activeConversationId}/messages?before=${encodeURIComponent(
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

    const socket = socketRef.current ?? (await getSocket());

    socketRef.current = socket;

    if (!socket.connected) {
      throw new Error(
        "Socket is not connected"
      );
    }

    const resolvedConversationId = await ensureConversation();

    if (
      joinedConversationIdRef.current !==
      resolvedConversationId
    ) {
      await joinConversationRoom(
        socket,
        resolvedConversationId
      );
    }

    try {
      setUploadingImage(true);

      /*
       * Upload image to Nextjs API
       */
      const formData = new FormData();

      formData.append(
        "file",
        file
      );

      formData.append("conversationId", resolvedConversationId);

      const uploadResponse = await fetch("/api/messages/image",
        {
          method: "POST",
          body: formData,
          cache: "no-store",
        }
      );

      const uploadData = await uploadResponse.json();

      if (
        !uploadResponse.ok ||
        !uploadData.success
      ) {
        throw new Error(
          uploadData.error ||
          "Failed to upload image"
        );
      }

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

      const optimisticId = `optimistic-image-${resolvedConversationId}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;

      const optimisticMessage: Message = {
        id: optimisticId,
        conversationId: resolvedConversationId,
        senderId: currentUserId,
        content: null,

        imageUrl: uploadData.imageUrl,
        imageName: uploadData.imageName,
        imageSize: uploadData.imageSize,
        imageMimeType: uploadData.imageMimeType,

        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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

      socket.emit("send_message", {
        conversationId: resolvedConversationId,
        content: null,

        imageUrl: uploadData.imageUrl,
        imageName: uploadData.imageName,
        imageSize: uploadData.imageSize,
        imageMimeType: uploadData.imageMimeType,
      },
        (response: SocketResponse) => {
          if (!response.success || !response.message) {
            console.error(" Failed to send image message:",
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
           * Replace optimistic message with  actual DB message.
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
        " Failed to upload/send image:",
        error
      );
    } finally {
      setUploadingImage(false);
    }
  }

  async function ensureConversation(): Promise<string> {
    const existingConversationId = activeConversationIdRef.current;

    if (existingConversationId) {
      return existingConversationId;
    }

    if (!targetUserId) {
      throw new Error(
        "Target user is required for a new conversation"
      );
    }

    const response = await fetch("/api/conversations/direct",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: targetUserId,
        }),
        cache: "no-store",
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ??
        "Failed to create conversation"
      );
    }

    const newConversationId = data.conversation?.id;

    if (!newConversationId) {
      throw new Error(
        "Conversation was not created"
      );
    }
    activeConversationIdRef.current = newConversationId;
    setActiveConversationId(newConversationId);

    return newConversationId;
  }

  async function joinConversationRoom(
    socket: Socket,
    conversationId: string
  ) {
    if (!socket.connected) {
      throw new Error(
        "Socket is not connected"
      );
    }

    if (
      joinedConversationIdRef.current ===
      conversationId
    ) {
      roomReadyRef.current = true;
      setRoomReady(true);
      return;
    }

    await new Promise<void>(
      (resolve, reject) => {
        socket.emit(
          "conversation:join",
          conversationId,
          (
            response: SocketResponse
          ) => {
            if (!response.success) {
              reject(
                new Error(
                  response.error ??
                  "Failed to join conversation"
                )
              );

              return;
            }

            joinedConversationIdRef.current =
              conversationId;

            roomReadyRef.current = true;
            setRoomReady(true);

            resolve();
          }
        );
      }
    );
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
      const socket = socketRef.current ?? (await getSocket());

      socketRef.current = socket;

      if (!socket.connected) {
        console.error(
          "Cannot send message: socket is not connected"
        );
        return;
      }

      const resolvedConversationId = await ensureConversation();

      if (
        joinedConversationIdRef.current !==
        resolvedConversationId
      ) {
        await joinConversationRoom(
          socket,
          resolvedConversationId
        );
      }

      const optimisticId =
        `optimistic-${resolvedConversationId}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`;

      const optimisticMessage: Message = {
        id: optimisticId,
        conversationId: resolvedConversationId,
        senderId: currentUserId,
        content: trimmed,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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

      setContent("");

      socket.emit(
        "send_message",
        {
          conversationId:
            resolvedConversationId,
          content: trimmed,
        },
        (
          response: SocketResponse
        ) => {
          if (
            !response.success ||
            !response.message
          ) {
            console.error(
              " Failed to send message:",
              response.error
            );

            setMessages(
              (previousMessages) =>
                previousMessages.map(
                  (message) =>
                    message.id ===
                      optimisticId
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

          setMessages(
            (previousMessages) =>
              previousMessages.map(
                (message) =>
                  message.id ===
                    optimisticId
                    ? {
                      ...response.message!,
                      deliveryStatus:
                        "sent",
                    }
                    : message
              )
          );

          window.history.replaceState(null, "", `/chat/${response.message!.conversationId}`);
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
    <div className="flex h-150 flex-col overflow-hidden rounded-lg border border-[#4a3d73]/25 bg-[#140f24] shadow-[0_0_0_1px_rgba(0,0,0,0.4)]">
      
      <div className="h-0.75 w-full bg-linear-to-r from-[#8b6fd9] via-[#8b6fd9]/40 to-transparent" />

      
      <div className="relative border-b border-[#4a3d73]/25 px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-[#ede9f7]">
              {chatUserName}
            </h2>

            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-[#9a8fbf]">
              {roomReady
                ? "Channel open"
                : socketReady
                  ? "Joining channel..."
                  : "Connecting..."}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-4">
            
            <button
              type="button"
              onClick={() => {
                setSearchOpen((previous) => !previous);

                if (searchOpen) {
                  setSearchQuery("");
                  setSearchResults([]);
                }
              }}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-[#4a3d73]/35 bg-[#1e1836] text-[#9a8fbf] transition hover:border-[#8b6fd9]/50 hover:text-[#ede9f7]"
              title="Search messages"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" strokeLinecap="round" />
              </svg>
            </button>

            <div className="flex items-center gap-2">
              <div className="flex items-end gap-0.75" title={roomReady ? "Live" : socketReady ? "Joining" : "Offline"}>
                <span className={`h-2 w-0.75 rounded-sm ${roomReady || socketReady ? "bg-[#8b6fd9]" : "bg-[#b14c6b]"}`} />
                <span className={`h-3 w-0.75 rounded-sm ${roomReady ? "bg-[#8b6fd9]" : socketReady ? "bg-[#8b6fd9]/40" : "bg-[#b14c6b]/30"}`} />
                <span className={`h-4 w-0.75 rounded-sm ${roomReady ? "bg-[#8b6fd9]" : "bg-[#4a3d73]/30"}`} />
              </div>

              <span className="font-mono text-[10px] uppercase tracking-widest text-[#9a8fbf]">
                {roomReady ? "Live" : socketReady ? "Joining" : "Offline"}
              </span>
            </div>
          </div>
        </div>

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
                  className="w-full rounded-md border border-[#4a3d73]/35 bg-[#140f24] px-4 py-2.5 pr-10 text-sm text-[#ede9f7] outline-none placeholder:text-[#6b5f94] focus:border-[#8b6fd9]/60"
                />

                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setSearchResults([]);
                      setSearchPerformed(false);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9a8fbf] transition hover:text-[#ede9f7]"
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
                className="rounded-md bg-[#8b6fd9] px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wide text-[#140f24] transition hover:bg-[#a78bfa] disabled:cursor-not-allowed disabled:opacity-40"
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
                className="rounded-md border border-[#4a3d73]/35 bg-[#1e1836] px-3 py-2.5 text-lg leading-none text-[#9a8fbf] transition hover:text-[#ede9f7]"
                title="Close search"
                aria-label="Close search"
              >
                ×
              </button>
            </div>

            {searchPerformed && (
              <div className="mt-3 max-h-64 overflow-y-auto rounded-md border border-[#4a3d73]/30 bg-[#140f24] shadow-xl">
                {searchResults.length === 0 ? (
                  <div className="p-4 text-center">
                    <p className="font-mono text-xs text-[#9a8fbf]">
                      No messages found in current messages.
                    </p>

                    {hasMoreMessages && (
                      <p className="mt-1 font-mono text-[11px] text-[#6b5f94]">
                        Go to previous messages to search older messages.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-[#4a3d73]/20">
                    {searchResults.map((message) => (
                      <button
                        key={message.id}
                        type="button"
                        onClick={() => void openSearchResult(message)}
                        className="w-full px-4 py-3 text-left transition hover:bg-[#1e1836]"
                      >
                        <p className="font-mono text-[10px] uppercase tracking-widest text-[#a78bfa]">
                          {message.sender.username}
                        </p>

                        <p className="mt-1 line-clamp-2 text-sm text-[#cfc8e6]">
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

      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <p className="font-mono text-xs uppercase tracking-widest text-[#9a8fbf]">
            Loading messages...
          </p>
        ) : messages.length === 0 ? (
          <p className="font-mono text-xs uppercase tracking-widest text-[#9a8fbf]">
            No messages yet.
          </p>
        ) : (
          <>
            {!loading && hasMoreMessages && (
              <div className="mb-4 flex justify-center">
                <button
                  onClick={loadPreviousMessages}
                  disabled={loadingPrevious}
                  className="rounded-md border border-[#4a3d73]/30 bg-[#1e1836] px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-[#9a8fbf] transition hover:text-[#ede9f7] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loadingPrevious ? "Loading previous messages..." : "See previous messages"}
                </button>
              </div>
            )}

            <div className="space-y-3">
              {messages.map((message) => {
                const own = message.senderId === currentUserId;

                return (
                  <div
                    key={message.id}
                    ref={(element) => {
                      messageRefs.current[message.id] = element;
                    }}
                    className={`flex ${own ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[75%] px-4 py-3 ${own
                        ? "rounded-lg rounded-br-sm bg-[#8b6fd9] text-[#140f24]"
                        : "rounded-lg rounded-bl-sm border border-[#4a3d73]/30 bg-[#1e1836] text-[#ede9f7]"
                        }`}
                    >
                      {!own && (
                        <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-[#9a8fbf]">
                          {message.sender.username}
                        </p>
                      )}

                      {own && !message.deletedAt && (
                        <div className="mb-2 flex justify-end gap-1">
                          <button
                            onClick={() => startEditingMessage(message)}
                            className="rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-[#140f24]/60 hover:bg-black/10"
                          >
                            Edit
                          </button>

                          <button
                            onClick={() => requestDeleteMessage(message.id)}
                            className="rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-[#5c1a3a] hover:bg-black/10"
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
                            onChange={(event) => setEditingContent(event.target.value)}
                            autoFocus
                            className="w-full resize-none rounded-md border border-[#4a3d73]/40 bg-[#140f24] px-3 py-2 text-sm text-[#ede9f7] outline-none focus:border-[#8b6fd9]/70"
                            rows={3}
                          />

                          <div className="mt-2 flex justify-end gap-2">
                            <button
                              onClick={cancelEditingMessage}
                              className="rounded-md px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-[#9a8fbf] hover:bg-white/5"
                            >
                              Cancel
                            </button>

                            <button
                              onClick={saveEditedMessage}
                              disabled={!editingContent.trim()}
                              className="rounded-md bg-[#8b6fd9] px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wide text-[#140f24] hover:bg-[#a78bfa] disabled:opacity-40"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-end justify-end gap-2">
                          {message.imageUrl ? (
                            <div className="space-y-2">
                              <img
                                src={message.imageUrl}
                                alt={message.imageName ?? "Image"}
                                className="max-h-96 max-w-full rounded-md object-contain"
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
                                    className={`font-mono text-[11px] ${message.deliveryStatus === "failed"
                                      ? "text-[#5c1a3a]"
                                      : readMessages.has(message.id) || message.readByOtherUser === true
                                        ? "text-[#2e1f57]"
                                        : "text-[#140f24]/50"
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
                                <span className="shrink-0 font-mono text-[10px] opacity-50">
                                  edited
                                </span>
                              )}

                              {own && (
                                <span
                                  className={`font-mono text-[11px] ${message.deliveryStatus === "failed"
                                    ? "text-[#5c1a3a]"
                                    : readMessages.has(message.id)
                                      ? "text-[#2e1f57]"
                                      : "text-[#140f24]/50"
                                    }`}
                                  title={
                                    message.deliveryStatus === "pending"
                                      ? "Sending..."
                                      : message.deliveryStatus === "failed"
                                        ? "Failed to send"
                                        : readMessages.has(message.id)
                                          ? "Read"
                                          : "Sent"
                                  }
                                >
                                  {message.deliveryStatus === "pending"
                                    ? "◷"
                                    : message.deliveryStatus === "failed"
                                      ? "!"
                                      : readMessages.has(message.id)
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
              })}

              <div ref={messagesEndRef} />
            </div>
          </>
        )}
      </div>

      <div className="border-t border-[#4a3d73]/25 p-4">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={
              uploadingImage ||
              (hasRealConversation && !roomReady)
            }
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-[#4a3d73]/35 bg-[#1e1836] text-[#9a8fbf] transition hover:border-[#8b6fd9]/50 hover:text-[#ede9f7] disabled:cursor-not-allowed disabled:opacity-40"
            title="Send image"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
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
            onChange={(event) => setContent(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
            placeholder={
              !hasRealConversation ? `Message ${chatUserName}...` : roomReady ? "Type a message..." : "Connecting to conversation..."
            }
            disabled={hasRealConversation && !roomReady}
            className="flex-1 rounded-md border border-[#4a3d73]/35 bg-[#140f24] px-4 py-3 text-sm text-[#ede9f7] outline-none placeholder:text-[#6b5f94] focus:border-[#8b6fd9]/60 disabled:cursor-not-allowed disabled:opacity-40"
          />

          <button
            onClick={sendMessage}
            disabled={
              !content.trim() ||
              (hasRealConversation && !roomReady)
            }
            className="flex items-center justify-center rounded-md bg-[#8b6fd9] px-5 py-3 text-sm font-semibold text-[#140f24] transition hover:bg-[#a78bfa] disabled:opacity-40"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 20v-6l8-2-8-2V4l19 8-19 8z" />
            </svg>
          </button>
        </div>
      </div>

      {deleteMessageId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-lg border border-[#4a3d73]/35 bg-[#1e1836] p-6 shadow-2xl">
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#b14c6b]">
              Confirm delete
            </p>

            <h3 className="mt-2 text-lg font-semibold text-[#ede9f7]">
              Delete message?
            </h3>

            <p className="mt-2 text-sm leading-6 text-[#9a8fbf]">
              Message deleted will be deleted for both users.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={cancelDeleteMessage}
                className="rounded-md border border-[#4a3d73]/35 px-4 py-2 font-mono text-xs uppercase tracking-wide text-[#9a8fbf] transition hover:bg-white/5"
              >
                Cancel
              </button>

              <button
                onClick={confirmDeleteMessage}
                className="rounded-md bg-[#b14c6b] px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-[#c15f80]"
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