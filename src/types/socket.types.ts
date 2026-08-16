import { Socket } from 'socket.io'

export interface AuthenticatedSocket extends Socket {
  user?: {
    id: string
    email: string
    name: string
    avatarUrl?: string | null
  }
}

export interface ISendMessagePayload {
  conversationId: string
  content?: string
  type?: 'text' | 'image' | 'file' | 'audio' | 'system'
  mediaUrl?: string
  replyToId?: string
  isEncrypted?: boolean
  ciphertext?: string
  iv?: string
}

export interface ITypingPayload {
  conversationId: string
}

export interface IReadReceiptPayload {
  conversationId: string
  messageId: string
}
