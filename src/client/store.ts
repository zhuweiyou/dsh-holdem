import { useSyncExternalStore } from 'react'
import type { ClientCommand, PlayerView, ServerEvent } from '../types.ts'
import { ApiError, api, newActionId } from './api.ts'
import { browserId } from './presence.ts'
import { t } from './i18n.ts'

export type Connection = 'idle' | 'connecting' | 'live' | 'polling' | 'offline'

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'error'
}

export interface ClientState {
  booted: boolean
  busy: boolean
  connection: Connection
  view: PlayerView | null
  notice: string | null
  toast: Toast | null
}

let state: ClientState = {
  booted: false,
  busy: false,
  connection: 'idle',
  view: null,
  notice: null,
  toast: null,
}

const listeners = new Set<() => void>()
let socket: WebSocket | null = null
let pollTimer: ReturnType<typeof setInterval> | undefined
let reconnectTimer: ReturnType<typeof setTimeout> | undefined
let toastTimer: ReturnType<typeof setTimeout> | undefined
let toastSeq = 0
let disposed = false

function set(patch: Partial<ClientState>): void {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useClientState(): ClientState {
  return useSyncExternalStore(subscribe, getState, getState)
}

export function getState(): ClientState {
  return state
}

export function toast(text: string, kind: 'info' | 'error' = 'info'): void {
  toastSeq += 1
  set({ toast: { id: toastSeq, text, kind } })
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    set({ toast: null })
  }, kind === 'error' ? 4200 : 2600)
}

export function clearToast(): void {
  if (toastTimer) clearTimeout(toastTimer)
  set({ toast: null })
}

// ------------------------------------------------------------------ 通道

function wsUrl(ticket: string): string {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${location.host}/holdem-p2p/ws?ticket=${encodeURIComponent(ticket)}`
}

function stopPolling(): void {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = undefined
}

function startPolling(roomId: string): void {
  if (pollTimer || disposed) return
  pollTimer = setInterval(() => {
    void refresh(roomId).catch(() => undefined)
  }, 1000)
}

function scheduleReconnect(roomId: string): void {
  if (reconnectTimer || disposed) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined
    void reissueTicket(roomId)
  }, 3000)
}

async function reissueTicket(roomId: string): Promise<void> {
  if (disposed) return
  try {
    const { wsTicket } = await api.wsTicket(roomId)
    connectChannel(roomId, wsTicket)
  } catch {
    scheduleReconnect(roomId)
  }
}

function closeChannel(): void {
  stopPolling()
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = undefined
  if (socket) {
    socket.onclose = null
    socket.close()
  }
  socket = null
}

function connectChannel(roomId: string, ticket: string): void {
  closeChannel()
  if (disposed) return
  set({ connection: 'connecting' })
  let ws: WebSocket
  try {
    ws = new WebSocket(wsUrl(ticket), 'holdem-p2p.v1')
  } catch {
    set({ connection: 'polling' })
    startPolling(roomId)
    scheduleReconnect(roomId)
    return
  }
  socket = ws
  ws.onopen = () => {
    set({ connection: 'live' })
    stopPolling()
  }
  ws.onmessage = (event) => {
    try {
      handleEvent(JSON.parse(String(event.data)) as ServerEvent)
    } catch {
      // ignore malformed frames
    }
  }
  ws.onclose = () => {
    if (socket === ws) socket = null
    if (disposed) return
    set({ connection: 'polling' })
    const room = state.view?.room.roomId
    if (room) {
      startPolling(room)
      scheduleReconnect(room)
    }
  }
  ws.onerror = () => {
    ws.close()
  }
}

function handleEvent(event: ServerEvent): void {
  if (event.type === 'snapshot') {
    if (!state.view || state.view.room.roomId === event.view.room.roomId) set({ view: event.view })
    return
  }
  if (event.type === 'settled') {
    toast(t('toast.settlement'))
    const room = state.view?.room.roomId
    if (room) void refresh(room)
    return
  }
  if (event.type === 'kicked') {
    closeChannel()
    set({ view: null, notice: t('error.kicked'), connection: 'idle' })
    return
  }
  if (event.type === 'left') {
    closeChannel()
    set({ view: null, notice: event.reason, connection: 'idle' })
    return
  }
  if (event.type === 'reject') {
    toast(event.reason, 'error')
  }
}

async function refresh(roomId: string): Promise<void> {
  if (!roomId) return
  try {
    const response = await api.state(roomId)
    set({ view: response.view })
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      await recoverSession(roomId)
    } else {
      throw error
    }
  }
}

/**
 * 状态接口说「不在这个房间」时，先确认浏览器现在到底在哪个房间：
 * 同一个浏览器可能有多个标签页各自在别的房间，cookie 还在就别把用户踢回大厅。
 */
async function recoverSession(roomId: string): Promise<void> {
  let session: Awaited<ReturnType<typeof api.session>> | null = null
  try {
    session = await api.session()
  } catch {
    session = null
  }
  if (session?.inRoom && session.view) {
    const next = session.view.room.roomId
    set({ view: session.view, notice: null })
    if (next !== roomId) toast(t('toast.switched', { code: session.view.room.roomCode }))
    try {
      const { wsTicket } = await api.wsTicket(next)
      connectChannel(next, wsTicket)
    } catch {
      set({ connection: 'polling' })
      startPolling(next)
      scheduleReconnect(next)
    }
    return
  }
  closeChannel()
  set({ view: null, connection: 'idle', notice: t('error.roomGone') })
}

// ------------------------------------------------------------------ 生命周期

export async function bootstrap(): Promise<void> {
  // 插件热重载会先 dispose 再重新挂载：此时状态已清空，直接重来一次
  if (disposed) disposed = false
  else if (state.booted) return
  try {
    const session = await api.session()
    if (session.inRoom && session.view) {
      set({ view: session.view })
      try {
        const { wsTicket } = await api.wsTicket(session.view.room.roomId)
        connectChannel(session.view.room.roomId, wsTicket)
      } catch {
        set({ connection: 'polling' })
        startPolling(session.view.room.roomId)
      }
    }
  } catch {
    // 没有会话时保持大厅
  } finally {
    set({ booted: true })
  }
}

export function dispose(): void {
  disposed = true
  closeChannel()
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = undefined
  listeners.clear()
  socket = null
  state = { booted: false, busy: false, connection: 'idle', view: null, notice: null, toast: null }
}

export async function createRoom(input: { title?: string | undefined; blindLevel: string; displayName: string }): Promise<void> {
  set({ busy: true })
  try {
    const created = await api.createRoom({ ...input, browserId: browserId() })
    set({ view: created.view, busy: false, notice: null })
    toast(t('toast.created', { code: created.roomCode }))
    connectChannel(created.view.room.roomId, created.wsTicket)
  } catch (error) {
    set({ busy: false })
    toast(errorText(error), 'error')
    throw error
  }
}

export async function joinRoom(input: {
  roomCode: string
  invite?: string | undefined
  displayName: string
  role: 'sit' | 'watch'
}): Promise<void> {
  set({ busy: true })
  try {
    const joined = await api.join({ ...input, browserId: browserId() })
    set({ view: joined.view, busy: false, notice: null })
    toast(t('toast.joined', { code: joined.view.room.roomCode }))
    connectChannel(joined.view.room.roomId, joined.wsTicket)
  } catch (error) {
    set({ busy: false })
    toast(errorText(error), 'error')
    throw error
  }
}

export async function leaveRoom(): Promise<void> {
  try {
    await api.leave(state.view?.room.roomId)
  } catch {
    // 房间可能已解散
  }
  closeChannel()
  set({ view: null, connection: 'idle', notice: null })
  toast(t('toast.left'))
}

export async function runCommand(command: ClientCommand): Promise<void> {
  const view = state.view
  if (!view) return
  set({ busy: true })
  try {
    const response = await api.action(view.room.roomId, {
      actionId: newActionId(),
      baseSeq: view.room.seq,
      command,
    })
    set({ view: response.view, busy: false })
    if (response.duplicate) toast(t('toast.duplicate'))
  } catch (error) {
    set({ busy: false })
    if (error instanceof ApiError) {
      if (error.code === 'stale' && error.view) {
        set({ view: error.view })
        toast(t('error.stale'))
        return
      }
      if (error.code === 'not-your-turn') {
        toast(t('error.notYourTurn'), 'error')
      } else {
        toast(error.message || t('error.generic'), 'error')
      }
      const roomId = state.view?.room.roomId
      if (roomId) void refresh(roomId).catch(() => undefined)
      return
    }
    toast(errorText(error), 'error')
  }
}

export function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message || t('error.generic')
  if (error instanceof Error) return error.message
  return t('error.generic')
}
