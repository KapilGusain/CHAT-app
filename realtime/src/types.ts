export interface SendMessagePayload {
  conversationId: string;
  content: string;
}

export interface MessageCreatedPayload {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  sender: {
    id: string;
    username: string;
    avatarUrl: string | null;
  };
}