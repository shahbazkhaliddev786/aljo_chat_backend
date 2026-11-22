import type { Request, Response } from 'express'
import { asyncHandler } from '../utils/async.handler.js'
import { apiResponse } from '../utils/api.response.js'
import { createMessage, getConversationMessages } from '../services/message.service.js'
import { uploadFile } from '../utils/storage.js'
import { getIO } from '../loaders/socket.js'
import { ESocketEvents } from '../constants/socket-events.js'
import { userRooms } from '../sockets/rooms.js'

export const getMessages = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const conversationId = req.params.conversationId as string
  const limit = req.query.limit ? Number(req.query.limit) : 50
  const before = req.query.before as string | undefined

  const { messages, hasMore } = await getConversationMessages(conversationId, userId, limit, before)
  return apiResponse(res, 200, 'success', 'Messages retrieved', { messages, hasMore })
})

export const sendMessageHttp = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const conversationId = req.params.conversationId as string
  let mediaUrl: string | undefined
  // Clients may only send text, image and file messages; "system" is server-only.
  let messageType: 'text' | 'image' | 'file' | 'audio' | 'system' = 'text'

  if (req.file) {
    mediaUrl = await uploadFile(req.file, 'aljo-chat/attachments')
    // Encrypted uploads are opaque (application/octet-stream), so honour the client's
    // image/file choice; anything else is derived from the upload's mime type.
    messageType =
      req.body.type === 'image' || req.body.type === 'file'
        ? req.body.type
        : req.file.mimetype.startsWith('image/')
          ? 'image'
          : 'file'
  }

  const message = await createMessage({
    conversationId,
    senderId: userId,
    content: req.body.content,
    type: messageType,
    mediaUrl,
    replyToId: req.body.replyToId,
    isEncrypted: req.body.isEncrypted === true || req.body.isEncrypted === 'true',
    ciphertext: req.body.ciphertext,
    iv: req.body.iv,
    senderPublicKey: req.body.senderPublicKey,
    recipientPublicKey: req.body.recipientPublicKey,
    keyEnvelopes: req.body.keyEnvelopes,
    clientMessageId: req.body.clientMessageId
  })

  // Broadcast message over Socket.io
  try {
    // A single emit to all member rooms delivers the message once per socket.
    getIO().to(userRooms(message.memberUserIds)).emit(ESocketEvents.RECEIVE_MESSAGE, message)
  } catch {
    // Non-blocking socket error fallback
  }

  return apiResponse(res, 201, 'success', 'Message sent successfully', { message })
})
