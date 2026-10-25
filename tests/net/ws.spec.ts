import { createServer, type Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { WebServer } from '@deepseek-ai/cordis'
import { WebSocket } from 'ws'
import { resolveConfig } from '../../src/config.ts'
import { RoomManager } from '../../src/room/RoomManager.ts'
import { registerHoldemSocket } from '../../src/net/ws.ts'
import { noopStore } from '../../src/persist/store.ts'

let server: Server
let manager: RoomManager
let wsBase = ''

beforeAll(async () => {
  manager = new RoomManager({
    config: resolveConfig({ defaultBlindLevel: '25/50' }),
    origin: () => 'http://127.0.0.1:0',
    now: Date.now,
    store: noopStore,
  })
  const upgrades: ((req: unknown, socket: Duplex, head: Buffer) => void)[] = []
  const fake: WebServer = {
    host: '127.0.0.1',
    port: 0,
    getOrigin: () => wsBase,
    register: () => () => undefined,
    registerUpgrade(route) {
      upgrades.push(route.handler as never)
      return () => undefined
    },
    registerFallback: () => () => undefined,
  }
  const dispose = registerHoldemSocket(fake, manager)
  server = createServer()
  server.on('upgrade', (req, socket, head) => {
    for (const handler of upgrades) handler(req, socket as Duplex, head)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  wsBase = `ws://127.0.0.1:${port}`
  ;(server as Server & { disposeHoldem?: () => void }).disposeHoldem = dispose
})

afterAll(async () => {
  ;(server as Server & { disposeHoldem?: () => void }).disposeHoldem?.()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

/** 连上去，拿到第一条消息（或失败结果）。 */
function connect(url: string, protocols?: string): Promise<{ opened: boolean; message: string; error?: string }> {
  return new Promise((resolve) => {
    const ws = protocols ? new WebSocket(url, protocols) : new WebSocket(url)
    let message = ''
    const done = (opened: boolean, error?: string): void => {
      clearTimeout(timer)
      try {
        ws.close()
      } catch {
        // 忽略
      }
      resolve({ opened, message, error })
    }
    const timer = setTimeout(() => done(false, 'timeout'), 4000)
    ws.on('message', (data) => {
      message = String(data)
      done(true)
    })
    ws.on('open', () => {
      if (message) done(true)
    })
    ws.on('error', (error) => done(false, String(error.message)))
  })
}

describe('实时通道', () => {
  it('不请求子协议也能连上（Worker 那边回不了 Sec-WebSocket-Protocol）', async () => {
    const fresh = manager.createRoom({ displayName: '房主' })
    const result = await connect(`${wsBase}/holdem/ws?ticket=${encodeURIComponent(fresh.wsTicket)}`)
    expect(result.error).toBeUndefined()
    expect(result.opened).toBe(true)
    const event = JSON.parse(result.message) as { type: string; view: { room: { roomId: string } } }
    expect(event.type).toBe('snapshot')
    expect(event.view.room.roomId).toBe(fresh.roomId)
  })

  it('老客户端带着子协议来也照收', async () => {
    const fresh = manager.createRoom({ displayName: '房主3' })
    const result = await connect(`${wsBase}/holdem/ws?ticket=${encodeURIComponent(fresh.wsTicket)}`, 'holdem.v1')
    expect(result.error).toBeUndefined()
    expect(result.opened).toBe(true)
  })

  it('票据不对就被挡在门外', async () => {
    const result = await connect(`${wsBase}/holdem/ws?ticket=nope`)
    expect(result.opened).toBe(false)
  })
})
