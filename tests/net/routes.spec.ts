import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { WebServer } from '@deepseek-ai/cordis'
import { resolveConfig } from '../../src/config.ts'
import { RoomManager } from '../../src/room/RoomManager.ts'
import { registerHoldemHttp } from '../../src/net/routes.ts'
import { noopStore } from '../../src/persist/store.ts'

interface Jar {
  cookie?: string
}

let server: Server
let base = ''
let manager: RoomManager
let prefix = '/holdem-p2p'

beforeAll(async () => {
  manager = new RoomManager({
    config: resolveConfig({ publicBaseUrl: '', defaultBlindLevel: '25/50', autoAdvanceSec: 2 }),
    origin: () => 'http://127.0.0.1:0',
    now: Date.now,
    store: noopStore,
  })
  prefix = manager.getConfig().routePrefix
  const routes: { path: string; handler: (req: unknown, res: unknown) => unknown }[] = []
  const fake: WebServer = {
    host: '127.0.0.1',
    port: 0,
    getOrigin: () => base,
    register(route) {
      routes.push(route as never)
      return () => undefined
    },
    registerUpgrade() {
      return () => undefined
    },
    registerFallback() {
      return () => undefined
    },
  }
  registerHoldemHttp(fake, manager)
  server = createServer((req, res) => {
    const route = routes.find((entry) => (req.url ?? '').startsWith(entry.path))
    if (!route) {
      res.statusCode = 404
      res.end()
      return
    }
    void route.handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  base = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

function headers(jar: Jar, extra: Record<string, string> = {}): Record<string, string> {
  return {
    origin: base,
    'x-requested-with': 'dsh-holdem-p2p',
    'content-type': 'application/json',
    ...(jar.cookie ? { cookie: jar.cookie } : {}),
    ...extra,
  }
}

async function call<T>(
  path: string,
  options: { method?: string; body?: unknown; jar?: Jar; omitCsrf?: boolean } = {},
): Promise<{ status: number; body: T; jar: Jar }> {
  const jar = options.jar ?? {}
  const extra: Record<string, string> = options.omitCsrf ? {} : {}
  const rawHeaders = options.omitCsrf
    ? { origin: base, 'content-type': 'application/json', ...(jar.cookie ? { cookie: jar.cookie } : {}) }
    : headers(jar, extra)
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? 'GET',
    headers: rawHeaders,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  })
  const setCookies = response.headers.getSetCookie()
  const current = new Map<string, string>(
    (jar.cookie ?? '')
      .split('; ')
      .filter(Boolean)
      .map((part) => [part.slice(0, part.indexOf('=')), part.slice(part.indexOf('=') + 1)]),
  )
  for (const cookie of setCookies) {
    const first = cookie.split(';')[0] ?? ''
    const index = first.indexOf('=')
    if (index < 0) continue
    const name = first.slice(0, index)
    const value = first.slice(index + 1)
    if (!name.startsWith('hdm_seat')) continue
    if (value === '') current.delete(name)
    else current.set(name, value)
  }
  const merged = [...current].map(([name, value]) => `${name}=${value}`).join('; ')
  jar.cookie = merged === '' ? undefined : merged
  const text = await response.text()
  return { status: response.status, body: (text ? JSON.parse(text) : {}) as T, jar }
}

describe('HTTP 路由', () => {
  it('ready 与加入页可用', async () => {
    const ready = await call<{ ok: boolean; plugin: string }>(`${prefix}/api/ready`)
    expect(ready.status).toBe(200)
    expect(ready.body.plugin).toBe('dsh-holdem-p2p')

    const page = await fetch(`${base}${prefix}/join?code=123456&invite=x&role=sit`)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('dsh-holdem-p2p')
  })

  it('变更请求缺少 CSRF 头会被拒绝', async () => {
    const jar: Jar = {}
    const response = await call<{ error: string }>(`${prefix}/api/rooms`, {
      method: 'POST',
      body: { displayName: '无头' },
      jar,
      omitCsrf: true,
    })
    expect(response.status).toBe(403)
    expect(response.body.error).toBe('auth')
  })

  it('建房、加入、查询会话、预览与离开', async () => {
    const hostJar: Jar = {}
    const created = await call<{ roomCode: string; view: { room: { roomId: string; seats: { displayName: string | null }[] } } }>(
      `${prefix}/api/rooms`,
      { method: 'POST', body: { title: '测试桌', displayName: '房主' }, jar: hostJar },
    )
    expect(created.status).toBe(200)
    expect(created.jar.cookie).toBeTruthy()
    expect(created.body.view.room.seats[0]!.displayName).toBe('房主')
    const roomCode = created.body.roomCode
    const roomId = created.body.view.room.roomId

    const session = await call<{ inRoom: boolean; view: { you: { displayName: string } } }>(
      `${prefix}/api/session`,
      { jar: hostJar },
    )
    expect(session.body.inRoom).toBe(true)
    expect(session.body.view.you.displayName).toBe('房主')

    const preview = await call<{ seated: number; canSit: boolean }>(
      `${prefix}/api/preview?code=${roomCode}`,
      { jar: {} },
    )
    expect(preview.body.seated).toBe(1)
    expect(preview.body.canSit).toBe(true)

    const guestJar: Jar = {}
    const joined = await call<{ playerId: string; seat: number }>(`${prefix}/api/join`, {
      method: 'POST',
      body: { roomCode, displayName: '客人', role: 'sit' },
      jar: guestJar,
    })
    expect(joined.status).toBe(200)
    expect(joined.body.seat).toBe(1)

    const ticket = await call<{ wsTicket: string }>(`${prefix}/api/ws-ticket`, {
      method: 'POST',
      body: {},
      jar: guestJar,
    })
    expect(ticket.body.wsTicket.length).toBeGreaterThan(10)

    const left = await call<{ ok: boolean }>(`${prefix}/api/leave`, { method: 'POST', body: {}, jar: guestJar })
    expect(left.body.ok).toBe(true)
    const after = await call<{ inRoom: boolean }>(`${prefix}/api/session`, { jar: guestJar })
    expect(after.body.inRoom).toBe(false)

    // 房间仍在，房主仍可行动
    const hostRoom = await call<{ view: { room: { roomId: string } } }>(`${prefix}/api/rooms/${roomId}/state`, { jar: hostJar })
    expect(hostRoom.body.view.room.roomId).toBe(roomId)
  })

  it('同一浏览器可以同时待在两个房间（每个房间一个 cookie）', async () => {
    const jar: Jar = {}
    const first = await call<{ roomCode: string; view: { room: { roomId: string } } }>(`${prefix}/api/rooms`, {
      method: 'POST',
      body: { title: '房间 A', displayName: '甲' },
      jar,
    })
    const second = await call<{ roomCode: string; view: { room: { roomId: string } } }>(`${prefix}/api/rooms`, {
      method: 'POST',
      body: { title: '房间 B', displayName: '甲' },
      jar,
    })
    const firstId = first.body.view.room.roomId
    const secondId = second.body.view.room.roomId
    expect(firstId).not.toBe(secondId)

    const stateA = await call<{ view: { room: { roomId: string } } }>(`${prefix}/api/rooms/${firstId}/state`, { jar })
    expect(stateA.status).toBe(200)
    expect(stateA.body.view.room.roomId).toBe(firstId)

    const stateB = await call<{ view: { room: { roomId: string } } }>(`${prefix}/api/rooms/${secondId}/state`, { jar })
    expect(stateB.status).toBe(200)
    expect(stateB.body.view.room.roomId).toBe(secondId)

    const ticketA = await call<{ wsTicket: string }>(`${prefix}/api/ws-ticket`, {
      method: 'POST',
      body: { roomId: firstId },
      jar,
    })
    expect(ticketA.status).toBe(200)

    // 离开 A 不影响 B
    await call(`${prefix}/api/leave`, { method: 'POST', body: { roomId: firstId }, jar })
    const stateAAfter = await call<{ error: string }>(`${prefix}/api/rooms/${firstId}/state`, { jar })
    expect(stateAAfter.status).toBe(403)
    const stateBAfter = await call<{ view: { room: { roomId: string } } }>(`${prefix}/api/rooms/${secondId}/state`, { jar })
    expect(stateBAfter.status).toBe(200)
  })

  it('动作接口校验 baseSeq 并回传最新视图', async () => {
    const hostJar: Jar = {}
    const created = await call<{ roomCode: string; view: { room: { roomId: string; seq: number } } }>(
      `${prefix}/api/rooms`,
      { method: 'POST', body: { displayName: '房主' }, jar: hostJar },
    )
    const roomCode = created.body.roomCode
    const roomId = created.body.view.room.roomId
    await call(`${prefix}/api/join`, { method: 'POST', body: { roomCode, displayName: '客人' }, jar: {} })
    const view = await call<{ view: { room: { seq: number } } }>(`${prefix}/api/rooms/${roomId}/state`, { jar: hostJar })

    const stale = await call<{ error: string; view: unknown }>(`${prefix}/api/rooms/${roomId}/action`, {
      method: 'POST',
      body: { command: { type: 'ready', ready: true }, baseSeq: view.body.view.room.seq + 99 },
      jar: hostJar,
    })
    expect(stale.status).toBe(409)
    expect(stale.body.error).toBe('stale')
    expect(stale.body.view).toBeTruthy()

    const actionId = 'idem-1'
    const ok = await call<{ seq: number; duplicate: boolean }>(`${prefix}/api/rooms/${roomId}/action`, {
      method: 'POST',
      body: { actionId, command: { type: 'ready', ready: true }, baseSeq: view.body.view.room.seq },
      jar: hostJar,
    })
    expect(ok.status).toBe(200)
    expect(ok.body.duplicate).toBe(false)
  })
})
