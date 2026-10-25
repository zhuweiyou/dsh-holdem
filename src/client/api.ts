import type { ClientCommand, PlayerView, RoomPreview, SessionSummary } from '../types.ts'

export const PREFIX = '/holdem-p2p'
const HEADERS = {
  'content-type': 'application/json',
  'x-requested-with': 'dsh-holdem-p2p',
}

/** 后端基址：'' = 当前 DSH 进程；也可以指到 Cloudflare Worker 上。 */
let apiBase = ''

export function setApiBase(base: string): void {
  const trimmed = base.trim().replace(/\/+$/, '')
  apiBase = trimmed === '' ? '' : trimmed
}

export function getApiBase(): string {
  return apiBase
}

/** 座位 token 走请求头，不依赖浏览器是否保留 cookie。 */
let seatTokens: string[] = []

export function setSeatTokens(tokens: string[]): void {
  seatTokens = [...new Set(tokens.filter((token) => token !== ''))]
}

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly view: PlayerView | undefined

  constructor(code: string, message: string, status: number, view?: PlayerView) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.view = view
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${PREFIX}${path}`, {
    credentials: apiBase === '' ? 'same-origin' : 'omit',
    ...init,
    headers: {
      ...HEADERS,
      ...(seatTokens.length > 0 ? { 'x-holdem-seat': seatTokens.join(',') } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  })
  const text = await response.text()
  const body = (text ? JSON.parse(text) : {}) as T & { error?: string; message?: string; view?: PlayerView }
  if (!response.ok) {
    throw new ApiError(body.error ?? `http-${response.status}`, body.message ?? response.statusText, response.status, body.view)
  }
  return body
}

export interface CreateRoomResponse {
  roomId: string
  roomCode: string
  hostPlayerId: string
  joinUrl: string
  shareable: boolean
  wsTicket: string
  sessionToken: string
  view: PlayerView
}

export interface JoinResponse {
  playerId: string
  roomId: string
  seat: number | null
  wsTicket: string
  sessionToken: string
  view: PlayerView
}

export interface TunnelStatus {
  state: 'off' | 'starting' | 'on' | 'error'
  url: string
  target: string
  error: string
}

export interface SessionResponse {
  inRoom: boolean
  roomId?: string
  view?: PlayerView
  /** 浏览器实际带上来几个座位凭证（0 说明 cookie 没存/被拦）。 */
  seatCookies?: number
}

export interface StateResponse {
  seq: number
  view: PlayerView
}

export const api = {
  createRoom(input: { title?: string | undefined; blindLevel?: string | undefined; displayName?: string | undefined; browserId?: string | undefined }) {
    return request<CreateRoomResponse>('/api/rooms', { method: 'POST', body: JSON.stringify(input) })
  },
  preview(input: { code: string; invite?: string | undefined; role?: 'sit' | 'watch' | undefined; browserId?: string | undefined }) {
    const query = new URLSearchParams({ code: input.code })
    if (input.invite) query.set('invite', input.invite)
    if (input.role) query.set('role', input.role)
    if (input.browserId) query.set('browser', input.browserId)
    return request<RoomPreview>(`/api/preview?${query.toString()}`)
  },
  join(input: { roomCode: string; invite?: string | undefined; displayName: string; role: 'sit' | 'watch'; browserId?: string | undefined }) {
    return request<JoinResponse>('/api/join', { method: 'POST', body: JSON.stringify(input) })
  },
  session(roomId?: string) {
    const query = roomId ? `?roomId=${encodeURIComponent(roomId)}` : ''
    return request<SessionResponse>(`/api/session${query}`)
  },
  state(roomId: string) {
    return request<StateResponse>(`/api/rooms/${encodeURIComponent(roomId)}/state`)
  },
  action(roomId: string, input: { actionId: string; baseSeq: number; command: ClientCommand }) {
    return request<{ seq: number; view: PlayerView; duplicate: boolean }>(
      `/api/rooms/${encodeURIComponent(roomId)}/action`,
      { method: 'POST', body: JSON.stringify(input) },
    )
  },
  leave(roomId?: string) {
    return request<{ ok: boolean }>('/api/leave', {
      method: 'POST',
      body: JSON.stringify(roomId ? { roomId } : {}),
      keepalive: true,
    })
  },
  wsTicket(roomId?: string) {
    return request<{ wsTicket: string }>('/api/ws-ticket', {
      method: 'POST',
      body: JSON.stringify(roomId ? { roomId } : {}),
    })
  },
  history(roomId: string) {
    return request<{ summary: SessionSummary | null }>(`/api/rooms/${encodeURIComponent(roomId)}/history`)
  },
  tunnel() {
    return request<TunnelStatus>('/api/tunnel')
  },
  tunnelStart() {
    return request<TunnelStatus>('/api/tunnel?action=start', { method: 'POST', body: '{}' })
  },
  tunnelStop() {
    return request<TunnelStatus>('/api/tunnel?action=stop', { method: 'POST', body: '{}' })
  },
  ready() {
    return request<{ ok: boolean; plugin: string; shareable: boolean }>('/api/ready')
  },
}

export function newActionId(): string {
  const cryptoObject = globalThis.crypto
  if (cryptoObject?.randomUUID) return cryptoObject.randomUUID()
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}
