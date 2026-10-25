import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebServer } from '@deepseek-ai/cordis'
import { type ClientCommand } from '../types.ts'
import { asRoomId } from '../types.ts'
import type { RoomManager } from '../room/RoomManager.ts'
import { assertMutatingHeaders, assertOrigin, cookieHeader, header, isLoopbackHost, parseCookies } from './auth.ts'
import { encodeJson, readJson } from './json.ts'
import { joinPageHtml } from './join-page.ts'

/** 每个房间一个座位 cookie：同一个浏览器可以同时待在不同房间的多个标签页里。 */
const SEAT_COOKIE_PREFIX = 'hdm_seat'

function seatCookieName(roomId: string): string {
  return `${SEAT_COOKIE_PREFIX}_${roomId}`
}

function seatTokens(cookies: Record<string, string>): string[] {
  return Object.entries(cookies)
    .filter(([name]) => name.startsWith(SEAT_COOKIE_PREFIX))
    .map(([, value]) => value)
    .filter((value) => value !== '')
}

function sessionOf(manager: RoomManager, cookies: Record<string, string>, roomId?: string) {
  const sessions = manager.sessionsForTokens(seatTokens(cookies))
  if (roomId) return sessions.find((session) => session.roomId === roomId)
  return sessions[0]
}

export function registerHoldemHttp(server: WebServer, manager: RoomManager): () => void {
  const prefix = manager.getConfig().routePrefix
  return server.register({
    kind: 'prefix',
    path: prefix,
    handler: (req, res) => {
      void handle(req, res, manager, prefix)
    },
  })
}

async function handle(req: IncomingMessage, res: ServerResponse, manager: RoomManager, prefix: string): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const path = url.pathname
    const cookies = parseCookies(req)

    if (req.method === 'GET' && (path === prefix || path === `${prefix}/` || path === `${prefix}/join`)) {
      const role = url.searchParams.get('role') === 'watch' ? 'watch' : 'sit'
      html(res, joinPageHtml({
        prefix,
        code: String(url.searchParams.get('code') ?? ''),
        invite: String(url.searchParams.get('invite') ?? ''),
        role,
        shareable: manager.getConfig().publicBaseUrl !== '',
      }))
      return
    }

    if (req.method === 'GET' && path === `${prefix}/api/ready`) {
      json(res, 200, {
        ok: true,
        plugin: 'dsh-holdem-p2p',
        shareable: manager.getConfig().publicBaseUrl !== '',
        turnTimeoutMs: manager.getConfig().turnTimeoutMs,
      })
      return
    }

    if (req.method === 'GET' && path === `${prefix}/api/health`) {
      if (!isLoopbackHost(header(req, 'host'), req.socket.remoteAddress)) throw auth('仅本机可查看健康状态')
      json(res, 200, manager.health())
      return
    }

    if (req.method === 'GET' && path === `${prefix}/api/session`) {
      const session = sessionOf(manager, cookies)
      if (!session) {
        json(res, 200, { inRoom: false })
        return
      }
      try {
        json(res, 200, { inRoom: true, roomId: session.roomId, view: manager.view(session.roomId, session.playerId) })
      } catch {
        json(res, 200, { inRoom: false })
      }
      return
    }

    if (req.method === 'POST' && path === `${prefix}/api/rooms`) {
      assertOrigin(req, manager.getConfig().publicBaseUrl)
      assertMutatingHeaders(req)
      const local = isLoopbackHost(header(req, 'host'), req.socket.remoteAddress)
      if (!local) throw auth('只能在运行 Harness 的本机开房')
      const body = await readJson<{ title?: string; blindLevel?: string; displayName?: string; browserId?: string }>(req)
      const created = manager.createRoom({
        title: body.title,
        blindLevel: body.blindLevel,
        displayName: body.displayName,
        browserId: body.browserId,
      })
      json(res, 200, {
        roomId: created.roomId,
        roomCode: created.roomCode,
        hostPlayerId: created.hostPlayerId,
        sitUrl: created.sitUrl,
        watchUrl: created.watchUrl,
        shareable: created.shareable,
        wsTicket: created.wsTicket,
        view: created.view,
      }, [seatCookie(manager, created.sessionToken, created.roomId)])
      return
    }

    if (req.method === 'GET' && path === `${prefix}/api/preview`) {
      const preview = manager.peek({
        roomCode: String(url.searchParams.get('code') ?? ''),
        invite: String(url.searchParams.get('invite') ?? ''),
        role: url.searchParams.get('role') === 'watch' ? 'watch' : 'sit',
        local: isLoopbackHost(header(req, 'host'), req.socket.remoteAddress),
        browserId: url.searchParams.get('browser') ?? undefined,
        cookies: seatTokens(cookies),
      })
      json(res, 200, preview)
      return
    }

    if (req.method === 'POST' && path === `${prefix}/api/join`) {
      assertOrigin(req, manager.getConfig().publicBaseUrl)
      assertMutatingHeaders(req)
      const body = await readJson<{
        roomCode?: string
        invite?: string
        displayName?: string
        role?: 'sit' | 'watch'
        browserId?: string
      }>(req)
      const joined = manager.join({
        roomCode: String(body.roomCode ?? ''),
        invite: String(body.invite ?? ''),
        role: body.role === 'watch' ? 'watch' : 'sit',
        displayName: String(body.displayName ?? ''),
        local: isLoopbackHost(header(req, 'host'), req.socket.remoteAddress),
        browserId: body.browserId,
        cookies: seatTokens(cookies),
      })
      json(res, 200, {
        playerId: joined.playerId,
        roomId: joined.roomId,
        seat: joined.seat,
        wsTicket: joined.wsTicket,
        view: joined.view,
      }, [seatCookie(manager, joined.sessionToken, joined.roomId)])
      return
    }

    if (req.method === 'POST' && path === `${prefix}/api/leave`) {
      assertOrigin(req, manager.getConfig().publicBaseUrl)
      assertMutatingHeaders(req)
      const body = await readJson<{ roomId?: string }>(req).catch(() => ({}) as { roomId?: string })
      const session = sessionOf(manager, cookies, body.roomId) ?? sessionOf(manager, cookies)
      if (session) {
        manager.leave(session.playerId)
        json(res, 200, { ok: true }, [clearSeatCookie(manager, session.roomId)])
        return
      }
      json(res, 200, { ok: true })
      return
    }

    if (req.method === 'POST' && path === `${prefix}/api/ws-ticket`) {
      assertOrigin(req, manager.getConfig().publicBaseUrl)
      assertMutatingHeaders(req)
      const body = await readJson<{ roomId?: string }>(req).catch(() => ({}) as { roomId?: string })
      const session = sessionOf(manager, cookies, body.roomId) ?? sessionOf(manager, cookies)
      if (!session) throw auth('还没进房间')
      json(res, 200, { wsTicket: manager.issueTicket(session.playerId, session.roomId) })
      return
    }

    const roomMatch = /^\/api\/rooms\/([^/]+)(?:\/(state|action|history))?$/.exec(path.slice(prefix.length))
    if (roomMatch) {
      const action = roomMatch[2]
      const roomId = asRoomId(decodeURIComponent(roomMatch[1] ?? ''))
      const session = sessionOf(manager, cookies, roomId)
      if (!session) throw auth('不在这个房间里')
      if (req.method === 'GET' && (!action || action === 'state')) {
        const view = manager.view(roomId, session.playerId)
        json(res, 200, { seq: view.room.seq, view })
        return
      }
      if (req.method === 'GET' && action === 'history') {
        json(res, 200, { summary: manager.exportSummary(roomId, session.playerId) })
        return
      }
      if (req.method === 'POST' && action === 'action') {
        assertOrigin(req, manager.getConfig().publicBaseUrl)
        assertMutatingHeaders(req)
        const body = await readJson<{
          actionId?: string
          baseSeq?: number
          command?: ClientCommand
        }>(req)
        if (!body.command || typeof body.command !== 'object') throw Object.assign(new Error('缺少 command'), { status: 400, code: 'illegal' })
        const result = manager.command(
          roomId,
          session.playerId,
          body.command,
          Number.isFinite(body.baseSeq) ? Number(body.baseSeq) : undefined,
          typeof body.actionId === 'string' ? body.actionId : undefined,
        )
        json(res, 200, { seq: result.seq, view: result.view, duplicate: result.duplicate === true })
        return
      }
      send(res, 404, encodeJson({ error: 'expired', message: 'not found' }), jsonHeaders())
      return
    }

    send(res, 404, encodeJson({ error: 'expired', message: 'not found' }), jsonHeaders())
  } catch (error) {
    writeError(res, error)
  }
}

function seatCookie(manager: RoomManager, token: string, roomId: string): string {
  return cookieHeader(seatCookieName(roomId), token, {
    secure: manager.getConfig().publicBaseUrl.startsWith('https://'),
    sameSite: 'Lax',
    maxAge: 86400,
    path: manager.getConfig().routePrefix,
  })
}

function clearSeatCookie(manager: RoomManager, roomId: string): string {
  return cookieHeader(seatCookieName(roomId), '', {
    secure: manager.getConfig().publicBaseUrl.startsWith('https://'),
    sameSite: 'Lax',
    maxAge: 0,
    path: manager.getConfig().routePrefix,
  })
}

function auth(message: string): Error {
  return Object.assign(new Error(message), { status: 403, code: 'auth' })
}

function json(res: ServerResponse, status: number, body: unknown, cookies?: string[]): void {
  const headers: Record<string, string | string[]> = jsonHeaders()
  if (cookies && cookies.length > 0) headers['set-cookie'] = cookies
  send(res, status, encodeJson(body), headers)
}

function html(res: ServerResponse, body: string): void {
  send(res, 200, body, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
}

function jsonHeaders(): Record<string, string> {
  return { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
}

function send(res: ServerResponse, status: number, body: string, headers: Record<string, string | string[]>): void {
  if (res.headersSent) return
  res.writeHead(status, headers)
  res.end(body)
}

function writeError(res: ServerResponse, error: unknown): void {
  const coded = error as { code?: string; status?: number; view?: unknown }
  const code = coded.code ?? 'illegal'
  const status = coded.status ?? statusOf(code)
  const payload: Record<string, unknown> = {
    error: code,
    message: error instanceof Error ? error.message : 'error',
  }
  if (code === 'stale' && coded.view) payload.view = coded.view
  send(res, status, encodeJson(payload), jsonHeaders())
}

function statusOf(code: string): number {
  if (code === 'auth') return 403
  if (code === 'room-not-found' || code === 'expired') return 404
  if (code === 'rate-limited') return 429
  if (code === 'room-full' || code === 'phase' || code === 'stale' || code === 'already-in-room' || code === 'duplicate-nonce') return 409
  return 400
}
