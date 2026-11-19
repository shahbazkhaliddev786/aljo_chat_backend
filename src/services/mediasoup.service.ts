import * as mediasoup from 'mediasoup'
import config from '../config/config.js'
import logger from '../utils/logger.js'
import { badRequest, forbidden, notFound } from '../utils/app-error.js'

type Router = mediasoup.types.Router
type WebRtcTransport = mediasoup.types.WebRtcTransport
type Producer = mediasoup.types.Producer
type Consumer = mediasoup.types.Consumer

/**
 * A peer is one socket taking part in a group call. Every transport, producer
 * and consumer is owned by exactly one peer, so a client can only ever touch
 * media objects it created, and leaving/disconnecting tears down everything
 * the socket owned (no orphaned producers → no ghost participants / rooms).
 */
interface Peer {
  socketId: string
  userId: string
  userName: string
  transports: Map<string, WebRtcTransport>
  producers: Map<string, Producer>
  consumers: Map<string, Consumer>
  /** What the participant is sending, for mute/camera-off indicators. */
  mediaState: { audio: boolean; video: boolean }
}

interface Room {
  conversationId: string
  router: Router
  /** The worker this call runs on. */
  slot: WorkerSlot
  peers: Map<string, Peer> // socketId -> Peer
}

export interface LeaveResult {
  conversationId: string
  socketId: string
  userId: string
  roomClosed: boolean
}

const MEDIA_CODECS: mediasoup.types.RouterRtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
    preferredPayloadType: 111
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    preferredPayloadType: 96,
    parameters: {
      'x-google-start-bitrate': 1000
    }
  }
]

interface WorkerSlot {
  worker: mediasoup.types.Worker
  /** Each worker gets its own slice of the RTC port range, so workers never compete for ports. */
  portRange: { min: number; max: number }
  rooms: number
}

/** Split [min, max] into `count` contiguous, non-overlapping slices. */
export const splitPortRange = (min: number, max: number, count: number) => {
  const total = max - min + 1
  const size = Math.floor(total / count)
  if (size < 2) throw new Error('MEDIASOUP RTC port range is too small for the number of workers')
  return Array.from({ length: count }, (_, i) => ({
    min: min + i * size,
    max: i === count - 1 ? max : min + (i + 1) * size - 1
  }))
}

class MediasoupService {
  private workers: WorkerSlot[] = []
  private workersPromise: Promise<WorkerSlot[]> | null = null
  private rooms: Map<string, Room> = new Map()
  private pendingRooms: Map<string, Promise<Room>> = new Map()
  private shuttingDown = false

  /** Close all workers as part of a graceful shutdown. */
  public close() {
    this.shuttingDown = true
    this.workers.forEach((slot) => slot.worker.close())
    this.rooms.clear()
  }

  /**
   * Start one mediasoup worker per CPU core (MEDIASOUP_NUM_WORKERS). Each worker
   * runs on its own core, so group-call capacity grows with the machine.
   */
  public async init(): Promise<WorkerSlot[]> {
    if (this.workers.length > 0) return this.workers
    if (!this.workersPromise) {
      this.workersPromise = (async () => {
        const { NUM_WORKERS, RTC_MIN_PORT, RTC_MAX_PORT } = config.MEDIASOUP
        const ranges = splitPortRange(RTC_MIN_PORT, RTC_MAX_PORT, NUM_WORKERS)

        const slots = await Promise.all(
          ranges.map(async (portRange) => {
            const worker = await mediasoup.createWorker({ logLevel: 'warn' })

            // Without its workers no group call can work, so exit and let the
            // process manager restart us instead of running on with a dead SFU.
            const onWorkerGone = (reason: string) => {
              if (this.shuttingDown) return // expected during a graceful shutdown
              logger.error('MEDIASOUP_WORKER_DIED', { meta: { pid: worker.pid, reason } })
              setTimeout(() => process.exit(1), 2000)
            }
            worker.on('died', (err) => onWorkerGone(err?.message || 'died'))
            worker.on('subprocessclose', () => onWorkerGone('subprocess closed'))
            return { worker, portRange, rooms: 0 }
          })
        )

        if (!config.MEDIASOUP.ANNOUNCED_ADDRESS && config.MEDIASOUP.LISTEN_IP === '0.0.0.0') {
          logger.warn('MEDIASOUP_ANNOUNCED_IP_MISSING', {
            meta: {
              message:
                'MEDIASOUP_ANNOUNCED_IP is not set. Group calls will only work for clients that can reach this host directly.'
            }
          })
        }

        logger.info('MEDIASOUP_WORKERS_READY', {
          meta: { workers: slots.map((s) => ({ pid: s.worker.pid, ports: `${s.portRange.min}-${s.portRange.max}` })) }
        })
        this.workers = slots
        return slots
      })().catch((err) => {
        this.workersPromise = null
        throw err
      })
    }
    return this.workersPromise
  }

  /** Number of workers and rooms per worker (for health/metrics). */
  public stats() {
    return this.workers.map((s) => ({ pid: s.worker.pid, rooms: s.rooms, ports: s.portRange }))
  }

  // ---------------------------------------------------------------------------
  // Rooms & peers
  // ---------------------------------------------------------------------------

  private async getOrCreateRoom(conversationId: string): Promise<Room> {
    const existing = this.rooms.get(conversationId)
    if (existing) return existing

    // Deduplicate concurrent creations so two joiners never get two routers.
    let pending = this.pendingRooms.get(conversationId)
    if (!pending) {
      pending = (async () => {
        // Put each new call on the least busy worker.
        const slots = await this.init()
        const slot = slots.reduce((best, s) => (s.rooms < best.rooms ? s : best))
        const router = await slot.worker.createRouter({ mediaCodecs: MEDIA_CODECS })
        slot.rooms++
        const room: Room = { conversationId, router, peers: new Map(), slot }
        this.rooms.set(conversationId, room)
        return room
      })().finally(() => this.pendingRooms.delete(conversationId))
      this.pendingRooms.set(conversationId, pending)
    }
    return pending
  }

  private getPeer(conversationId: string, socketId: string): { room: Room; peer: Peer } {
    const room = this.rooms.get(conversationId)
    const peer = room?.peers.get(socketId)
    if (!room || !peer) throw forbidden('You are not in this call')
    return { room, peer }
  }

  /** Register a socket as a call participant. Returns the router capabilities. */
  public async joinRoom(conversationId: string, socketId: string, userId: string, userName: string) {
    const room = await this.getOrCreateRoom(conversationId)
    const isFirstPeer = room.peers.size === 0

    if (!room.peers.has(socketId)) {
      room.peers.set(socketId, {
        socketId,
        userId,
        userName,
        transports: new Map(),
        producers: new Map(),
        consumers: new Map(),
        mediaState: { audio: true, video: true }
      })
    }

    return { rtpCapabilities: room.router.rtpCapabilities, isFirstPeer }
  }

  public isInRoom(conversationId: string, socketId: string): boolean {
    return !!this.rooms.get(conversationId)?.peers.has(socketId)
  }

  public hasActiveCall(conversationId: string): boolean {
    return (this.rooms.get(conversationId)?.peers.size || 0) > 0
  }

  /** Socket ids of everyone in the call, optionally excluding one. */
  public getPeerSocketIds(conversationId: string, excludeSocketId?: string): string[] {
    const room = this.rooms.get(conversationId)
    if (!room) return []
    return Array.from(room.peers.keys()).filter((id) => id !== excludeSocketId)
  }

  // ---------------------------------------------------------------------------
  // Transports / producers / consumers (all scoped to the calling peer)
  // ---------------------------------------------------------------------------

  public async createWebRtcTransport(conversationId: string, socketId: string) {
    const { room, peer } = this.getPeer(conversationId, socketId)
    const { LISTEN_IP, ANNOUNCED_ADDRESS } = config.MEDIASOUP
    const portRange = room.slot.portRange

    const transport = await room.router.createWebRtcTransport({
      listenInfos: [
        { protocol: 'udp', ip: LISTEN_IP, announcedAddress: ANNOUNCED_ADDRESS, portRange },
        { protocol: 'tcp', ip: LISTEN_IP, announcedAddress: ANNOUNCED_ADDRESS, portRange }
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true
    })

    peer.transports.set(transport.id, transport)
    transport.on('routerclose', () => peer.transports.delete(transport.id))

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters
    }
  }

  public async connectTransport(
    conversationId: string,
    socketId: string,
    transportId: string,
    dtlsParameters: mediasoup.types.DtlsParameters
  ) {
    const { peer } = this.getPeer(conversationId, socketId)
    const transport = peer.transports.get(transportId)
    if (!transport) throw notFound('Transport not found')
    await transport.connect({ dtlsParameters })
  }

  public async produce(
    conversationId: string,
    socketId: string,
    transportId: string,
    kind: mediasoup.types.MediaKind,
    rtpParameters: mediasoup.types.RtpParameters
  ) {
    if (kind !== 'audio' && kind !== 'video') throw badRequest('Invalid media kind')

    const { peer } = this.getPeer(conversationId, socketId)
    const transport = peer.transports.get(transportId)
    if (!transport) throw notFound('Transport not found')

    const producer = await transport.produce({ kind, rtpParameters })
    peer.producers.set(producer.id, producer)
    producer.on('transportclose', () => peer.producers.delete(producer.id))

    return { id: producer.id }
  }

  public async consume(
    conversationId: string,
    socketId: string,
    transportId: string,
    producerId: string,
    rtpCapabilities: mediasoup.types.RtpCapabilities
  ) {
    const { room, peer } = this.getPeer(conversationId, socketId)

    // The producer must belong to another participant of *this* call.
    let producerOwner: Peer | undefined
    for (const other of room.peers.values()) {
      if (other.socketId !== socketId && other.producers.has(producerId)) {
        producerOwner = other
        break
      }
    }
    if (!producerOwner) throw notFound('Producer not found')

    if (!room.router.canConsume({ producerId, rtpCapabilities })) {
      throw badRequest('Cannot consume producer with provided capabilities')
    }

    const transport = peer.transports.get(transportId)
    if (!transport) throw notFound('Transport not found')

    // Start paused: the client resumes once its consumer is ready, which makes
    // mediasoup request a fresh keyframe so video does not start black.
    const consumer = await transport.consume({ producerId, rtpCapabilities, paused: true })
    peer.consumers.set(consumer.id, consumer)
    consumer.on('transportclose', () => peer.consumers.delete(consumer.id))
    consumer.on('producerclose', () => {
      consumer.close()
      peer.consumers.delete(consumer.id)
    })

    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      producerUserId: producerOwner.userId,
      producerUserName: producerOwner.userName,
      producerSocketId: producerOwner.socketId
    }
  }

  public async resumeConsumer(conversationId: string, socketId: string, consumerId: string) {
    const { peer } = this.getPeer(conversationId, socketId)
    const consumer = peer.consumers.get(consumerId)
    if (!consumer) throw notFound('Consumer not found')
    await consumer.resume()
  }

  public setMediaState(conversationId: string, socketId: string, state: { audio: boolean; video: boolean }) {
    const { peer } = this.getPeer(conversationId, socketId)
    peer.mediaState = state
  }

  /** Mute/camera state of every *other* participant (for late joiners). */
  public getOtherPeerStates(conversationId: string, socketId: string) {
    const room = this.rooms.get(conversationId)
    if (!room) return []
    return Array.from(room.peers.values())
      .filter((p) => p.socketId !== socketId)
      .map((p) => ({ socketId: p.socketId, userId: p.userId, userName: p.userName, ...p.mediaState }))
  }

  /** Producers of every *other* participant in the call. */
  public getOtherProducers(conversationId: string, socketId: string) {
    const room = this.rooms.get(conversationId)
    if (!room) return []

    const result: Array<{ producerId: string; kind: string; socketId: string; userId: string; userName: string }> = []
    for (const peer of room.peers.values()) {
      if (peer.socketId === socketId) continue
      for (const producer of peer.producers.values()) {
        result.push({
          producerId: producer.id,
          kind: producer.kind,
          socketId: peer.socketId,
          userId: peer.userId,
          userName: peer.userName
        })
      }
    }
    return result
  }

  // ---------------------------------------------------------------------------
  // Leaving
  // ---------------------------------------------------------------------------

  /** Remove one socket from a call, closing every transport it owned. */
  public leaveRoom(conversationId: string, socketId: string): LeaveResult | null {
    const room = this.rooms.get(conversationId)
    const peer = room?.peers.get(socketId)
    if (!room || !peer) return null

    // Closing a transport closes its producers and consumers; consumers on
    // other peers receive 'producerclose' and clean themselves up.
    for (const transport of peer.transports.values()) transport.close()
    room.peers.delete(socketId)

    let roomClosed = false
    if (room.peers.size === 0) {
      room.router.close()
      room.slot.rooms--
      this.rooms.delete(conversationId)
      roomClosed = true
    }

    return { conversationId, socketId, userId: peer.userId, roomClosed }
  }

  /** Remove every socket of a user from one call (e.g. they were removed from the group). */
  public removeUserFromRoom(conversationId: string, userId: string): LeaveResult[] {
    const room = this.rooms.get(conversationId)
    if (!room) return []
    const socketIds = Array.from(room.peers.values())
      .filter((p) => p.userId === userId)
      .map((p) => p.socketId)
    return socketIds.map((id) => this.leaveRoom(conversationId, id)).filter((r): r is LeaveResult => !!r)
  }

  /** Remove a socket from every call it is in (used on disconnect). */
  public removeSocketFromAllRooms(socketId: string): LeaveResult[] {
    const results: LeaveResult[] = []
    for (const conversationId of Array.from(this.rooms.keys())) {
      const result = this.leaveRoom(conversationId, socketId)
      if (result) results.push(result)
    }
    return results
  }
}

export const mediasoupService = new MediasoupService()
