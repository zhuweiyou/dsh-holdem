import type {
  Card,
  HandResultView,
  HandView,
  LegalActions,
  PlayerId,
  Seat,
  ShownHandView,
  Street,
} from '../types.ts'
import { nowIso } from '../types.ts'
import { ALL_IN_RUNOUT_MS } from '../invariant.ts'
import { shuffledDeck, type RandomBelow } from './deck.ts'
import {
  applyAction,
  BettingError,
  legalFor,
  roundComplete,
  type BetAction,
  type BetPlayer,
  type BetRound,
} from './betting.ts'
import { buildPots, distributePots, potTotal } from './pots.ts'
import { describeHand, evaluateBest, type HandValue } from './rank.ts'

export interface HandPlayer extends BetPlayer {
  playerId: PlayerId
  displayName: string
  buyIn: number
  /** 本手累计投入（跨街），边池按此分层。 */
  committed: number
  hole: Card[]
  lastAction: string | null
}

export interface HandSeat {
  seat: Seat
  playerId: PlayerId
  displayName: string
}

export interface CreateHandOptions {
  handNo: number
  /** 本手按钮位（由房间按上一手轮转后传入）。 */
  button: Seat
  seats: HandSeat[]
  sb: number
  bb: number
  buyIn: number
  turnTimeoutMs: number
  now: number
  random?: RandomBelow
  /** 测试用：直接给定牌堆（从末尾取牌）。 */
  deck?: Card[]
}

export interface HandState {
  handNo: number
  button: Seat
  sbSeat: Seat
  bbSeat: Seat
  street: Street
  deck: Card[]
  board: Card[]
  players: HandPlayer[]
  round: BetRound
  toActSeat: Seat | null
  deadlineAt: number | null
  startedAt: number
  runoutDueAt: number | null
  completed: boolean
  result: HandResultView | null
  revealed: boolean
  turnTimeoutMs: number
}

export class HandError extends Error {
  readonly code: 'illegal' | 'not-your-turn' | 'phase'
  constructor(code: 'illegal' | 'not-your-turn' | 'phase', reason: string) {
    super(reason)
    this.code = code
    this.name = 'HandError'
  }
}

const STREET_ORDER: Street[] = ['preflop', 'flop', 'turn', 'river', 'showdown']

export function createHand(options: CreateHandOptions): HandState {
  const seats = [...options.seats].sort((a, b) => a.seat - b.seat)
  if (seats.length < 2) throw new HandError('phase', '至少需要两名玩家')
  if (!seats.some((entry) => entry.seat === options.button)) {
    throw new HandError('phase', '按钮位不在活跃座位上')
  }

  const players: HandPlayer[] = seats.map((entry) => ({
    seat: entry.seat,
    playerId: entry.playerId,
    displayName: entry.displayName,
    buyIn: options.buyIn,
    stack: options.buyIn,
    streetCommitted: 0,
    committed: 0,
    folded: false,
    allIn: false,
    actedEpoch: -1,
    hole: [],
    lastAction: null,
  }))

  const headsUp = players.length === 2
  const button = options.button
  const sbSeat = headsUp ? button : nextSeatIn(players, button)
  const bbSeat = nextSeatIn(players, sbSeat)

  const state: HandState = {
    handNo: options.handNo,
    button,
    sbSeat,
    bbSeat,
    street: 'preflop',
    deck: options.deck ? [...options.deck] : shuffledDeck(options.random),
    board: [],
    players,
    round: { currentBet: 0, lastFullRaise: options.bb, raiseEpoch: 0, bigBlind: options.bb },
    toActSeat: null,
    deadlineAt: null,
    startedAt: options.now,
    runoutDueAt: null,
    completed: false,
    result: null,
    revealed: false,
    turnTimeoutMs: options.turnTimeoutMs,
  }

  // 两轮发底牌：从 SB 起顺时针，每人一张，再来一圈。
  let cursor = sbSeat
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < players.length; i += 1) {
      playerAt(state, cursor)?.hole.push(draw(state))
      cursor = nextSeatIn(players, cursor)
    }
  }

  postBlind(state, sbSeat, options.sb)
  postBlind(state, bbSeat, options.bb)
  state.round.currentBet = Math.max(
    playerAt(state, sbSeat)?.streetCommitted ?? 0,
    playerAt(state, bbSeat)?.streetCommitted ?? 0,
  )
  state.toActSeat = headsUp ? sbSeat : nextActingSeat(state, bbSeat)
  armDeadline(state, options.now)
  if (state.toActSeat === null) progress(state, options.now, null)
  return state
}

export function playerAt(state: HandState, seat: Seat): HandPlayer | undefined {
  return state.players.find((player) => player.seat === seat)
}

export function livePlayers(state: HandState): HandPlayer[] {
  return state.players.filter((player) => !player.folded)
}

export function actingPlayers(state: HandState): HandPlayer[] {
  return state.players.filter((player) => !player.folded && !player.allIn)
}

export function legalForSeat(state: HandState, seat: Seat): LegalActions | null {
  if (state.completed || state.runoutDueAt !== null) return null
  if (state.toActSeat !== seat) return null
  const player = playerAt(state, seat)
  if (!player) return null
  return legalFor(player, state.round)
}

export interface ActOutcome {
  seat: Seat
  label: string
  streetChanged: boolean
  completed: boolean
}

export function act(state: HandState, seat: Seat, action: BetAction, now: number): ActOutcome {
  if (state.completed) throw new HandError('phase', '本手已结束')
  if (state.runoutDueAt !== null) throw new HandError('phase', '全下跑马中，等待发完公共牌')
  if (state.toActSeat !== seat) throw new HandError('not-your-turn', '还没轮到你行动')
  const player = playerAt(state, seat)
  if (!player) throw new HandError('illegal', '座位不存在')

  const before = state.street
  let applied
  try {
    applied = applyAction(player, state.round, action)
  } catch (error) {
    if (error instanceof BettingError) throw new HandError(error.code, error.message)
    throw error
  }
  player.committed += applied.paid
  player.lastAction = applied.label
  state.deadlineAt = null
  state.toActSeat = null
  progress(state, now, seat)
  return {
    seat,
    label: applied.label,
    streetChanged: state.street !== before,
    completed: state.completed,
  }
}

/** 超时自动行动：能过牌就过牌，否则弃牌。 */
export function forceTimeout(state: HandState, now: number): ActOutcome | null {
  if (state.completed || state.toActSeat === null) return null
  const seat = state.toActSeat
  const player = playerAt(state, seat)
  if (!player) return null
  const legal = legalFor(player, state.round)
  const action: BetAction = legal.canCheck ? { type: 'check' } : { type: 'fold' }
  return act(state, seat, action, now)
}

/** 玩家在非自己回合离开/断线：直接弃牌；只在自己回合或只剩一人时推进。 */
export function foldSeat(state: HandState, seat: Seat, now: number): boolean {
  if (state.completed) return false
  const player = playerAt(state, seat)
  if (!player || player.folded) return false
  const wasToAct = state.toActSeat === seat
  player.folded = true
  player.actedEpoch = state.round.raiseEpoch
  player.lastAction = '弃牌'
  if (!wasToAct) {
    if (livePlayers(state).length <= 1) {
      state.toActSeat = null
      state.deadlineAt = null
      progress(state, now, seat)
    }
    return true
  }
  state.toActSeat = null
  state.deadlineAt = null
  if (state.runoutDueAt !== null) return true
  progress(state, now, seat)
  return true
}

/** 驱动全下跑马：到期逐街发牌，最后摊牌。返回状态是否变化。 */
export function tick(state: HandState, now: number): boolean {
  if (state.completed || state.runoutDueAt === null) return false
  if (now < state.runoutDueAt) return false
  if (state.street === 'river' || state.street === 'showdown') {
    showdown(state, now)
    return true
  }
  dealNextStreet(state)
  state.runoutDueAt = now + ALL_IN_RUNOUT_MS
  return true
}

export function isRunout(state: HandState): boolean {
  return state.runoutDueAt !== null && !state.completed
}

function progress(state: HandState, now: number, fromSeat: Seat | null): void {
  if (livePlayers(state).length <= 1) {
    finishFoldWin(state, now)
    return
  }
  if (!roundComplete(state.players, state.round)) {
    const from = fromSeat ?? state.players.find((p) => !p.folded)?.seat ?? state.button
    state.toActSeat = nextActingSeat(state, from)
    if (state.toActSeat === null) {
      beginRunout(state, now)
      return
    }
    armDeadline(state, now)
    return
  }
  if (actingPlayers(state).length <= 1) {
    beginRunout(state, now)
    return
  }
  advanceStreet(state, now)
}

function beginRunout(state: HandState, now: number): void {
  state.toActSeat = null
  state.deadlineAt = null
  if (state.street === 'river' || state.street === 'showdown') {
    showdown(state, now)
    return
  }
  state.runoutDueAt = now + ALL_IN_RUNOUT_MS
}

function advanceStreet(state: HandState, now: number): void {
  if (state.street === 'river' || state.street === 'showdown') {
    showdown(state, now)
    return
  }
  dealNextStreet(state)
  state.runoutDueAt = null
  state.toActSeat = nextActingSeat(state, state.button)
  armDeadline(state, now)
  if (actingPlayers(state).length <= 1) beginRunout(state, now)
}

function dealNextStreet(state: HandState): void {
  const index = STREET_ORDER.indexOf(state.street)
  const next = STREET_ORDER[Math.min(index + 1, STREET_ORDER.length - 1)]!
  burn(state)
  if (next === 'flop') {
    for (let i = 0; i < 3; i += 1) state.board.push(draw(state))
  } else if (next === 'turn' || next === 'river') {
    state.board.push(draw(state))
  }
  state.street = next
  state.round = {
    currentBet: 0,
    lastFullRaise: state.round.bigBlind,
    raiseEpoch: state.round.raiseEpoch + 1,
    bigBlind: state.round.bigBlind,
  }
  for (const player of state.players) {
    player.streetCommitted = 0
    if (!player.folded && !player.allIn) player.actedEpoch = -1
  }
}

function armDeadline(state: HandState, now: number): void {
  state.deadlineAt = state.completed || state.toActSeat === null ? null : now + state.turnTimeoutMs
}

function showdown(state: HandState, _now: number): void {
  if (state.completed) return
  while (state.board.length < 5) {
    if (state.board.length === 0) {
      burn(state)
      for (let i = 0; i < 3; i += 1) state.board.push(draw(state))
    } else {
      burn(state)
      state.board.push(draw(state))
    }
  }
  state.street = 'showdown'
  state.revealed = true
  state.toActSeat = null
  state.deadlineAt = null
  state.runoutDueAt = null

  const live = livePlayers(state)
  const values = new Map<number, HandValue>()
  const shown: ShownHandView[] = []
  for (const player of live) {
    const value = evaluateBest([...player.hole, ...state.board])
    values.set(player.seat, value)
    shown.push({
      seat: player.seat,
      cards: [...player.hole],
      name: describeHand(value),
      score: value.score,
    })
  }

  const built = buildPots(state.players)
  const scoreMap = new Map<number, number>([...values].map(([seat, value]) => [seat, value.score]))
  const distribution = distributePots(built.pots, scoreMap, state.button)
  for (const entry of built.returned) addStack(state, entry.seat, entry.amount)
  for (const [seat, amount] of distribution.awards) addStack(state, seat, amount)

  const winners = [...new Set(distribution.pots.flatMap((pot) => pot.winners))]
  finishHand(state, {
    foldedWin: false,
    pots: built.pots,
    winners,
    shownHands: shown,
  })
}

function finishFoldWin(state: HandState, now: number): void {
  const winner = livePlayers(state)[0]
  if (!winner) return
  const built = buildPots(state.players)
  for (const entry of built.returned) addStack(state, entry.seat, entry.amount)
  const winnings = built.pots.reduce((sum, pot) => sum + pot.amount, 0)
  addStack(state, winner.seat, winnings)
  winner.lastAction = winner.lastAction ?? '获胜'
  state.street = 'showdown'
  state.revealed = true
  state.toActSeat = null
  state.deadlineAt = null
  state.runoutDueAt = null
  finishHand(state, {
    foldedWin: true,
    pots: built.pots,
    winners: [winner.seat],
    shownHands: [],
  })
  void now
}

function finishHand(
  state: HandState,
  payload: {
    foldedWin: boolean
    pots: { amount: number; eligible: Seat[] }[]
    winners: Seat[]
    shownHands: ShownHandView[]
  },
): void {
  state.completed = true
  state.result = {
    handNo: state.handNo,
    board: [...state.board],
    pots: payload.pots,
    winners: payload.winners,
    shownHands: payload.shownHands,
    deltas: state.players.map((player) => ({
      seat: player.seat,
      playerId: player.playerId,
      displayName: player.displayName,
      net: player.stack - player.buyIn,
    })),
    foldedWin: payload.foldedWin,
    endedAt: nowIso(),
  }
}

export function handView(state: HandState): HandView {
  const built = buildPots(state.players)
  const revealed = state.revealed && state.result !== null && !state.result.foldedWin
  return {
    handNo: state.handNo,
    street: state.street,
    board: [...state.board],
    button: state.button,
    sbSeat: state.sbSeat,
    bbSeat: state.bbSeat,
    toActSeat: state.toActSeat,
    currentBet: state.round.currentBet,
    minRaiseTo: state.round.currentBet === 0 ? state.round.bigBlind : state.round.currentBet + state.round.lastFullRaise,
    potTotal: potTotal(built.pots),
    pots: built.pots.map((pot) => ({ amount: pot.amount, eligible: [...pot.eligible] })),
    deadlineAt: state.deadlineAt === null ? null : new Date(state.deadlineAt).toISOString(),
    shownHands: revealed
      ? livePlayers(state).map((player) => {
        const value = evaluateBest([...player.hole, ...state.board])
        return {
          seat: player.seat,
          cards: [...player.hole],
          name: describeHand(value),
          score: value.score,
        }
      })
      : [],
    winners: state.result?.winners ?? [],
  }
}

function postBlind(state: HandState, seat: Seat, amount: number): void {
  const player = playerAt(state, seat)
  if (!player) return
  const paid = Math.min(amount, player.stack)
  player.stack -= paid
  player.streetCommitted += paid
  player.committed += paid
  if (player.stack === 0) player.allIn = true
  player.lastAction = amount === state.round.bigBlind ? `大盲 ${paid}` : `小盲 ${paid}`
}

function addStack(state: HandState, seat: Seat, amount: number): void {
  const player = playerAt(state, seat)
  if (player) player.stack += amount
}

function burn(state: HandState): void {
  draw(state)
}

function draw(state: HandState): Card {
  const card = state.deck.pop()
  if (!card) throw new HandError('phase', '牌堆已空')
  return card
}

function nextSeatIn(players: readonly { seat: Seat }[], from: Seat): Seat {
  const order = players.map((player) => player.seat).sort((a, b) => a - b)
  for (let step = 1; step <= 12; step += 1) {
    const candidate = ((from + step) % 12) as Seat
    if (order.includes(candidate)) return candidate
  }
  return order[0]!
}

function nextActingSeat(state: HandState, from: Seat): Seat | null {
  const seats = state.players
    .filter((player) => !player.folded && !player.allIn)
    .map((player) => player.seat)
    .sort((a, b) => a - b)
  if (seats.length === 0) return null
  for (let step = 1; step <= 12; step += 1) {
    const candidate = ((from + step) % 12) as Seat
    if (seats.includes(candidate)) return candidate
  }
  return seats[0]!
}
