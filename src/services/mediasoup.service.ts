import * as mediasoup from 'mediasoup'

interface RoomState {
  router: mediasoup.types.Router
  transports: Map<string, mediasoup.types.WebRtcTransport>
  producers: Map<string, { producer: mediasoup.types.Producer; socketId: string; userId: string; userName: string }>
  consumers: Map<string, { consumer: mediasoup.types.Consumer; socketId: string; userId: string }>
}

class MediasoupService {
  private worker: mediasoup.types.Worker | null = null
  private rooms: Map<string, RoomState> = new Map()

  public async init() {
    if (this.worker) return

    try {
      this.worker = await mediasoup.createWorker({
        logLevel: 'warn',
        rtcMinPort: 20000,
        rtcMaxPort: 20100,
      })

      this.worker.on('died', () => {
        console.error('mediasoup Worker died, exiting process...')
        setTimeout(() => process.exit(1), 2000)
      })

      console.log('mediasoup Worker initialized successfully')
    } catch (err) {
      console.error('Failed to create mediasoup Worker:', err)
    }
  }

  public async getOrCreateRoom(conversationId: string): Promise<RoomState> {
    if (!this.worker) {
      await this.init()
    }

    let room = this.rooms.get(conversationId)
    if (!room) {
      const mediaCodecs: mediasoup.types.RtpCodecCapability[] = [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
          preferredPayloadType: 111,
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
          preferredPayloadType: 96,
          parameters: {
            'x-google-start-bitrate': 1000,
          },
        },
      ]

      const router = await this.worker!.createRouter({ mediaCodecs })
      room = {
        router,
        transports: new Map(),
        producers: new Map(),
        consumers: new Map(),
      }
      this.rooms.set(conversationId, room)
    }

    return room
  }

  public async createWebRtcTransport(conversationId: string) {
    const room = await this.getOrCreateRoom(conversationId)

    const transport = await room.router.createWebRtcTransport({
      listenIps: [
        {
          ip: process.env.MEDIASOUP_LISTEN_IP || '127.0.0.1',
          announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || undefined,
        },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    })

    room.transports.set(transport.id, transport)

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    }
  }

  public async connectTransport(
    conversationId: string,
    transportId: string,
    dtlsParameters: mediasoup.types.DtlsParameters
  ) {
    const room = this.rooms.get(conversationId)
    if (!room) throw new Error('Room not found')

    const transport = room.transports.get(transportId)
    if (!transport) throw new Error('Transport not found')

    await transport.connect({ dtlsParameters })
  }

  public async produce(
    conversationId: string,
    transportId: string,
    kind: mediasoup.types.MediaKind,
    rtpParameters: any,
    socketId: string,
    userId: string,
    userName: string
  ) {
    const room = this.rooms.get(conversationId)
    if (!room) throw new Error('Room not found')

    const transport = room.transports.get(transportId)
    if (!transport) throw new Error('Transport not found')

    const producer = await transport.produce({ kind, rtpParameters })
    room.producers.set(producer.id, { producer, socketId, userId, userName })

    producer.on('transportclose', () => {
      producer.close()
      room.producers.delete(producer.id)
    })

    return { id: producer.id }
  }

  public async consume(
    conversationId: string,
    transportId: string,
    producerId: string,
    rtpCapabilities: mediasoup.types.RtpCapabilities,
    socketId: string,
    userId: string
  ) {
    const room = this.rooms.get(conversationId)
    if (!room) throw new Error('Room not found')

    if (!room.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error('Cannot consume producer with provided capabilities')
    }

    const transport = room.transports.get(transportId)
    if (!transport) throw new Error('Transport not found')

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: false,
    })

    room.consumers.set(consumer.id, { consumer, socketId, userId })

    consumer.on('transportclose', () => {
      consumer.close()
      room.consumers.delete(consumer.id)
    })

    const producerData = room.producers.get(producerId)

    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      producerUserId: producerData?.userId || '',
      producerUserName: producerData?.userName || '',
    }
  }

  public getRoomProducers(conversationId: string) {
    const room = this.rooms.get(conversationId)
    if (!room) return []

    return Array.from(room.producers.values()).map((p) => ({
      producerId: p.producer.id,
      kind: p.producer.kind,
      socketId: p.socketId,
      userId: p.userId,
      userName: p.userName,
    }))
  }

  public removeSocketFromRoom(conversationId: string, socketId: string, userId?: string) {
    const room = this.rooms.get(conversationId)
    if (!room) return

    for (const [id, p] of room.producers.entries()) {
      if (p.socketId === socketId || (userId && p.userId === userId)) {
        p.producer.close()
        room.producers.delete(id)
      }
    }

    for (const [id, c] of room.consumers.entries()) {
      if (c.socketId === socketId || (userId && c.userId === userId)) {
        c.consumer.close()
        room.consumers.delete(id)
      }
    }

    // Garbage collect empty rooms to prevent ghost rooms and memory leaks
    if (room.producers.size === 0) {
      room.router.close()
      this.rooms.delete(conversationId)
    }
  }

  public removeSocketFromAllRooms(socketId: string, userId?: string): string[] {
    const affectedRooms: string[] = []
    
    for (const [conversationId, room] of this.rooms.entries()) {
      let wasInRoom = false

      for (const p of room.producers.values()) {
        if (p.socketId === socketId || (userId && p.userId === userId)) wasInRoom = true
      }
      for (const c of room.consumers.values()) {
        if (c.socketId === socketId || (userId && c.userId === userId)) wasInRoom = true
      }

      if (wasInRoom) {
        this.removeSocketFromRoom(conversationId, socketId, userId)
        affectedRooms.push(conversationId)
      }
    }

    return affectedRooms
  }
}

export const mediasoupService = new MediasoupService()
