import { Server } from 'socket.io'
import { AuthenticatedSocket } from '../types/socket.types.js'

export const registerCallHandlers = (io: Server, socket: AuthenticatedSocket) => {
  const currentUserId = socket.user?.id

  // 1-on-1 Call Signaling: Send Call Invite
  socket.on('call:invite', ({ targetUserId, conversationId, callType }) => {
    if (!currentUserId) return

    // Broadcast to target user's sockets
    socket.to(`user:${targetUserId}`).emit('call:incoming', {
      callerUserId: currentUserId,
      callerName: socket.user?.name || 'User',
      callerAvatar: socket.user?.avatarUrl || null,
      callerSocketId: socket.id,
      conversationId,
      callType,
    })
  })

  // Accept incoming call
  socket.on('call:accept', ({ callerSocketId }) => {
    io.to(callerSocketId).emit('call:accepted', {
      acceptorSocketId: socket.id,
      acceptorUserId: currentUserId,
    })
  })

  // Reject incoming call
  socket.on('call:reject', ({ callerSocketId, reason }) => {
    io.to(callerSocketId).emit('call:rejected', {
      rejectorUserId: currentUserId,
      reason: reason || 'declined',
    })
  })

  // Exchange WebRTC SDP Offer
  socket.on('call:offer', ({ targetSocketId, sdp }) => {
    io.to(targetSocketId).emit('call:offer', {
      senderSocketId: socket.id,
      sdp,
    })
  })

  // Exchange WebRTC SDP Answer
  socket.on('call:answer', ({ targetSocketId, sdp }) => {
    io.to(targetSocketId).emit('call:answer', {
      senderSocketId: socket.id,
      sdp,
    })
  })

  // Exchange ICE Candidate
  socket.on('ice:candidate', ({ targetSocketId, candidate }) => {
    io.to(targetSocketId).emit('ice:candidate', {
      senderSocketId: socket.id,
      candidate,
    })
  })

  // End Call
  socket.on('call:end', ({ targetSocketId, conversationId }) => {
    if (targetSocketId) {
      io.to(targetSocketId).emit('call:ended', { conversationId })
    }
    if (conversationId) {
      socket.to(`conversation:${conversationId}`).emit('call:ended', { conversationId })
    }
  })
}
