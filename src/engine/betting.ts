import type { LegalActions } from '../types.ts'

export interface BetPlayer {
  seat: number
  stack: number
  streetCommitted: number
  folded: boolean
  allIn: boolean
  /** 上一次行动时的 raiseEpoch；-1 表示本街还未行动。 */
  actedEpoch: number
}

export interface BetRound {
  currentBet: number
  /** 最近一次「满额加注」的加注量，用于计算最小加注。 */
  lastFullRaise: number
  /** 每发生一次满额加注 +1；短筹码全下不递增。 */
  raiseEpoch: number
  bigBlind: number
}

export type BetAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise'; to: number }
  | { type: 'allin' }

export class BettingError extends Error {
  readonly code: 'illegal' | 'not-your-turn'
  constructor(code: 'illegal' | 'not-your-turn', reason: string) {
    super(reason)
    this.code = code
    this.name = 'BettingError'
  }
}

export function toCall(player: BetPlayer, round: BetRound): number {
  return Math.max(0, round.currentBet - player.streetCommitted)
}

export function maxTo(player: BetPlayer): number {
  return player.streetCommitted + player.stack
}

/** 最小加注到的总额：无人下注时为 BB，否则为当前注 + 上次满额加注量。 */
export function minRaiseTo(round: BetRound): number {
  return round.currentBet === 0 ? round.bigBlind : round.currentBet + round.lastFullRaise
}

export function isActing(player: BetPlayer): boolean {
  return !player.folded && !player.allIn
}

export function legalFor(player: BetPlayer, round: BetRound): LegalActions {
  const empty: LegalActions = {
    canFold: false,
    canCheck: false,
    canCall: false,
    callAmount: 0,
    canRaise: false,
    minRaiseTo: 0,
    maxRaiseTo: 0,
    canAllIn: false,
    allInTo: 0,
  }
  if (!isActing(player)) return empty

  const owed = toCall(player, round)
  const ceiling = maxTo(player)
  const canRaise = player.actedEpoch !== round.raiseEpoch && ceiling > round.currentBet && player.stack > 0
  const minTo = canRaise ? Math.min(minRaiseTo(round), ceiling) : 0
  return {
    canFold: true,
    canCheck: owed === 0,
    canCall: owed > 0,
    callAmount: Math.min(owed, player.stack),
    canRaise,
    minRaiseTo: minTo,
    maxRaiseTo: canRaise ? ceiling : 0,
    canAllIn: player.stack > 0,
    allInTo: ceiling,
  }
}

export interface AppliedAction {
  action: BetAction['type']
  paid: number
  fullRaise: boolean
  label: string
}

/** 就地更新 player 与 round；非法动作抛 BettingError。 */
export function applyAction(player: BetPlayer, round: BetRound, action: BetAction): AppliedAction {
  if (!isActing(player)) throw new BettingError('illegal', '该玩家已弃牌或已全下')

  if (action.type === 'fold') {
    player.folded = true
    player.actedEpoch = round.raiseEpoch
    return { action: 'fold', paid: 0, fullRaise: false, label: '弃牌' }
  }

  if (action.type === 'check') {
    if (toCall(player, round) > 0) throw new BettingError('illegal', '有人下注时不能过牌')
    player.actedEpoch = round.raiseEpoch
    return { action: 'check', paid: 0, fullRaise: false, label: '过牌' }
  }

  if (action.type === 'call') {
    const owed = toCall(player, round)
    if (owed === 0) {
      player.actedEpoch = round.raiseEpoch
      return { action: 'check', paid: 0, fullRaise: false, label: '过牌' }
    }
    const paid = commit(player, Math.min(owed, player.stack))
    player.actedEpoch = round.raiseEpoch
    const short = paid < owed
    return {
      action: 'call',
      paid,
      fullRaise: false,
      label: short ? `全下跟注 ${paid}` : `跟注 ${paid}`,
    }
  }

  const target = action.type === 'allin' ? maxTo(player) : action.to
  const wasOpeningBet = round.currentBet === 0
  if (!Number.isInteger(target)) throw new BettingError('illegal', '加注额必须是整数')
  if (target <= round.currentBet) {
    if (action.type === 'allin') {
      const paid = commit(player, Math.min(toCall(player, round), player.stack))
      player.actedEpoch = round.raiseEpoch
      return { action: 'call', paid, fullRaise: false, label: `全下跟注 ${paid}` }
    }
    throw new BettingError('illegal', '加注额必须大于当前注')
  }
  const ceiling = maxTo(player)
  if (target > ceiling) throw new BettingError('illegal', '加注额超过自己的筹码')
  if (player.actedEpoch === round.raiseEpoch) {
    throw new BettingError('illegal', '本轮已行动，短筹码全下后不能再加注')
  }
  const paid = commit(player, target - player.streetCommitted)
  const raiseBy = target - round.currentBet
  const allIn = player.stack === 0
  const fullRaise = raiseBy >= round.lastFullRaise
  if (!fullRaise && !allIn) {
    throw new BettingError('illegal', `最小加注到 ${minRaiseTo(round)}`)
  }
  if (fullRaise) {
    round.lastFullRaise = raiseBy
    round.raiseEpoch += 1
  }
  round.currentBet = Math.max(round.currentBet, target)
  player.actedEpoch = round.raiseEpoch
  return {
    action: allIn ? 'allin' : 'raise',
    paid,
    fullRaise,
    label: allIn ? `全下 ${target}` : wasOpeningBet ? `下注 ${target}` : `加注到 ${target}`,
  }
}

function commit(player: BetPlayer, amount: number): number {
  const paid = Math.max(0, Math.min(amount, player.stack))
  player.stack -= paid
  player.streetCommitted += paid
  if (player.stack === 0) player.allIn = true
  return paid
}

export function roundComplete(
  players: readonly BetPlayer[],
  round: BetRound,
): boolean {
  const live = players.filter((p) => !p.folded)
  if (live.length <= 1) return true
  return live.every(
    (p) => p.allIn || (p.actedEpoch === round.raiseEpoch && p.streetCommitted === round.currentBet),
  )
}

export function canActCount(players: readonly BetPlayer[]): number {
  return players.filter(isActing).length
}
