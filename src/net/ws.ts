import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocket, WebSocketServer } from 'ws'
import type { WebServer } from '@deepseek-ai/cordis'
import { DISCONNECT_AFTER_MS, MAX_FRAME_BYTES, SUBPROTOCOL } from '../invariant.ts'
import type { RoomManager } from '../room/RoomManager.ts'
import type { PlayerId, RoomId, ServerEvent } from '../types.ts'
import { assertOrigin } from './auth.ts'
import { encodeJson } from './json.ts'

interface SocketState {
  playerId: PlayerId
  roomId: RoomId
  lastSeen: number
}

export function registerHoldemSocket(server: WebServer, manager: RoomManager): () => void {
  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => (protocols.has(SUBPROTOCOL) ? SUBPROTOCOL : false),
  })
  const sockets = new Map<WebSocket, SocketState>()

  const off = manager.onEvent((playerId, event) => {
    for (const [socket, state] of sockets) {
      if (state.playerId === playerId && socket.readyState === WebSocket.OPEN) send(socket, event)
    }
  })

  const heartbeat = setInterval(() => {
    const now = Date.now()
    const limit = DISCONNECT_AFTER_MS
    for (const [socket, state] of sockets) {
      if (now - state.lastSeen > limit) {
        socket.terminate()
        continue
      }
      if (socket.readyState === WebSocket.OPEN) socket.ping()
    }
  }, 15_000)
  if (typeof heartbeat === 'object' && 'unref' in heartbeat) heartbeat.unref()

  const disposeRoute = server.registerUpgrade({
    path: `${manager.getConfig().routePrefix}/ws`,
    handler: (req, socket, head) => {
      try {
        assertOrigin(req as IncomingMessage, manager.getConfig().publicBaseUrl)
      } catch {
        reject(socket, '403 Forbidden')
        return
      }
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const ticket = url.searchParams.get('ticket') ?? ''
      const consumed = manager.consumeTicket(ticket)
      if (!consumed) {
        reject(socket, '401 Unauthorized')
        return
      }
      wss.handleUpgrade(req as IncomingMessage, socket as Duplex, head, (ws) => {
        const state: SocketState = { playerId: consumed.playerId, roomId: consumed.roomId, lastSeen: Date.now() }
        sockets.set(ws, state)
        manager.counters.wsConnected += 1
        manager.markConnected(state.playerId, state.roomId, true)
        try {
          send(ws, { type: 'snapshot', seq: 0, view: manager.view(state.roomId, state.playerId) })
        } catch {
          ws.close()
          return
        }
        ws.on('pong', () => {
          state.lastSeen = Date.now()
          manager.markConnected(state.playerId, state.roomId, true)
        })
        ws.on('message', (data) => {
          state.lastSeen = Date.now()
          if (Buffer.byteLength(data.toString()) > MAX_FRAME_BYTES) {
            ws.close()
            return
          }
          let parsed: { type?: string } | null = null
          try {
            parsed = JSON.parse(data.toString()) as { type?: string }
          } catch {
            return
          }
          if (parsed?.type === 'ping') send(ws, { type: 'pong', ts: Date.now() })
        })
        ws.on('close', () => {
          sockets.delete(ws)
          manager.counters.wsConnected = Math.max(0, manager.counters.wsConnected - 1)
          const stillOpen = [...sockets.values()].some(
            (entry) => entry.playerId === state.playerId && entry.roomId === state.roomId,
          )
          if (!stillOpen) manager.markConnected(state.playerId, state.roomId, false)
        })
        ws.on('error', () => {
          ws.terminate()
        })
      })
    },
  })

  return () => {
    clearInterval(heartbeat)
    off()
    disposeRoute()
    for (const socket of sockets.keys()) socket.terminate()
    wss.close()
  }
}

function send(ws: WebSocket, event: ServerEvent): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(encodeJson(event))
}

function reject(socket: Duplex, status: string): void {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`)
  socket.destroy()
}
