import type { BlindLevelId } from './invariant.ts'

export type RoomId = string & { readonly __brand: 'RoomId' }
export type PlayerId = string & { readonly __brand: 'PlayerId' }
export type HandId = string & { readonly __brand: 'HandId' }
export type SessionId = string & { readonly __brand: 'SessionId' }
/** 牌面：'As' / 'Td' / '9h'。 */
export type Card = string & { readonly __brand: 'Card' }
export type Seat = number

export type RoomPhase = 'lobby' | 'hand' | 'handOver' | 'settling' | 'closed'
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'

export interface RoomSettingsView {
  blindLevel: BlindLevelId
  sb: number
  bb: number
  buyIn: number
  turnTimeoutMs: number
  autoAdvanceMs: number
  allowSpectators: boolean
  /** 观战席位上限；0 表示这桌不接观战。 */
  maxSpectators: number
  chatEnabled: boolean
}

export interface SeatView {
  seat: Seat
  playerId: PlayerId | null
  displayName: string | null
  ready: boolean
  connected: boolean
  sittingOut: boolean
  autoFold: boolean
  host: boolean
  stack: number
  committed: number
  handNet: number
  folded: boolean
  allIn: boolean
  lastAction: string | null
  holeCount: number
}

export interface PotView {
  amount: number
  eligible: Seat[]
}

export interface ShownHandView {
  seat: Seat
  cards: Card[]
  name: string
  score: number
}

export interface HandView {
  handNo: number
  street: Street
  board: Card[]
  button: Seat
  sbSeat: Seat
  bbSeat: Seat
  toActSeat: Seat | null
  currentBet: number
  minRaiseTo: number
  potTotal: number
  pots: PotView[]
  deadlineAt: string | null
  shownHands: ShownHandView[]
  winners: Seat[]
}

export interface HandDelta {
  seat: Seat
  playerId: PlayerId
  displayName: string
  net: number
}

export interface HandResultView {
  handNo: number
  board: Card[]
  pots: PotView[]
  winners: Seat[]
  shownHands: ShownHandView[]
  deltas: HandDelta[]
  foldedWin: boolean
  endedAt: string
}

export interface LeaderboardEntry {
  playerId: PlayerId
  displayName: string
  seat: Seat | null
  handsPlayed: number
  handsWon: number
  netChips: number
  biggestWin: number
  showdownsWon: number
  showdownsPlayed: number
}

export interface ChatLine {
  playerId: PlayerId
  displayName: string
  text: string
  ts: string
}

export interface LegalActions {
  canFold: boolean
  canCheck: boolean
  canCall: boolean
  callAmount: number
  canRaise: boolean
  minRaiseTo: number
  maxRaiseTo: number
  canAllIn: boolean
  allInTo: number
}

export interface RoomView {
  roomId: RoomId
  roomCode: string
  title: string
  hostPlayerId: PlayerId
  hostDisplayName: string
  phase: RoomPhase
  settings: RoomSettingsView
  seats: SeatView[]
  handNo: number
  createdAt: string
  /** handOver 阶段自动开下一手的时间点；其它阶段为 null。 */
  nextHandAt: string | null
  seq: number
  /** 一条链接搞定：有空位就入座，没空位自动转观战。 */
  joinUrl: string
  /** 同一个局域网里可以直接用的地址（没有可用网卡时为空）。 */
  lanUrl: string
}

export interface YouView {
  playerId: PlayerId
  displayName: string
  seat: Seat | null
  spectator: boolean
  ready: boolean
  sittingOut: boolean
  holeCards: Card[]
  legal: LegalActions | null
  canAct: boolean
  netChips: number
  handsPlayed: number
}

export interface SpectatorView {
  playerId: PlayerId
  displayName: string
}

export interface SessionPlayerView {
  rank: number
  playerId: PlayerId
  displayName: string
  handsPlayed: number
  handsWon: number
  netChips: number
  biggestWin: number
  showdownsWon: number
  showdownsPlayed: number
}

export interface SessionSummary {
  sessionId: SessionId
  roomCode: string
  title: string
  startedAt: string
  endedAt: string
  durationMs: number
  handsPlayed: number
  players: SessionPlayerView[]
  history: HandResultView[]
  reason: 'host-dissolved' | 'host-idle'
}

export interface PlayerView {
  room: RoomView
  you: YouView
  hand: HandView | null
  lastHand: HandResultView | null
  leaderboard: LeaderboardEntry[]
  settlement: SessionSummary | null
  chat: ChatLine[]
  spectators: SpectatorView[]
  serverNow: string
}

export type TableAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise'; to: number }
  | { type: 'allin' }

export type ClientCommand =
  | { type: 'sit'; seat?: Seat; displayName?: string }
  | { type: 'stand' }
  | { type: 'ready'; ready: boolean }
  | { type: 'start' }
  | { type: 'action'; action: TableAction }
  | { type: 'chat'; text: string }
  | { type: 'hostPause' }
  | { type: 'hostKick'; playerId: PlayerId }
  | { type: 'hostDissolve' }
  | { type: 'ping' }

export type RejectCode =
  | 'auth'
  | 'illegal'
  | 'phase'
  | 'not-your-turn'
  | 'stale'
  | 'duplicate-nonce'
  | 'room-full'
  | 'room-not-found'
  | 'expired'
  | 'already-in-room'
  | 'not-seated'
  | 'host-only'
  | 'rate-limited'

export type ServerEvent =
  | { type: 'snapshot'; seq: number; view: PlayerView }
  | { type: 'reject'; code: RejectCode; reason: string }
  | { type: 'settled'; seq: number; summary: SessionSummary }
  | { type: 'left'; seq: number; reason: string }
  | { type: 'kicked'; seq: number; reason: string }
  | { type: 'pong'; ts: number }

export class CommandError extends Error {
  readonly code: RejectCode
  constructor(code: RejectCode, reason: string) {
    super(reason)
    this.code = code
    this.name = 'CommandError'
  }
}

export interface RoomPreviewSeat {
  seat: Seat
  displayName: string | null
  ready: boolean
  host: boolean
  connected: boolean
}

export interface RoomPreview {
  roomCode: string
  title: string
  hostDisplayName: string
  phase: RoomPhase
  settings: RoomSettingsView
  seated: number
  spectators: number
  seats: RoomPreviewSeat[]
  canSit: boolean
  alreadyInRoom: boolean
  inviteExpiresAt: string
}

export function asRoomId(value: string): RoomId {
  return value as RoomId
}

export function asPlayerId(value: string): PlayerId {
  return value as PlayerId
}

export function asCard(value: string): Card {
  return value as Card
}

export function asSessionId(value: string): SessionId {
  return value as SessionId
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function isSeat(value: unknown): value is Seat {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 6
}
