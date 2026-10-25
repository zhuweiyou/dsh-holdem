import { describe, expect, it } from 'vitest'
import {
  applyAction,
  BettingError,
  legalFor,
  minRaiseTo,
  roundComplete,
  type BetPlayer,
  type BetRound,
} from '../../src/engine/betting.ts'

function player(overrides: Partial<BetPlayer> = {}): BetPlayer {
  return {
    seat: 0,
    stack: 1000,
    streetCommitted: 0,
    folded: false,
    allIn: false,
    actedEpoch: -1,
    ...overrides,
  }
}

function round(overrides: Partial<BetRound> = {}): BetRound {
  return { currentBet: 0, lastFullRaise: 100, raiseEpoch: 0, bigBlind: 100, ...overrides }
}

describe('legalFor', () => {
  it('无人下注时可过牌并可下注', () => {
    const legal = legalFor(player(), round())
    expect(legal.canCheck).toBe(true)
    expect(legal.canFold).toBe(true)
    expect(legal.canRaise).toBe(true)
    expect(legal.minRaiseTo).toBe(100)
    expect(legal.maxRaiseTo).toBe(1000)
  })

  it('面对下注时可跟注、加注', () => {
    const legal = legalFor(player({ streetCommitted: 100 }), round({ currentBet: 300, lastFullRaise: 200, raiseEpoch: 1 }))
    expect(legal.canCheck).toBe(false)
    expect(legal.callAmount).toBe(200)
    expect(legal.minRaiseTo).toBe(500)
  })

  it('筹码不足最小加注时只能全下', () => {
    const legal = legalFor(player({ streetCommitted: 100, stack: 250 }), round({ currentBet: 300, lastFullRaise: 200, raiseEpoch: 1 }))
    expect(legal.canRaise).toBe(true)
    expect(legal.minRaiseTo).toBe(350)
    expect(legal.maxRaiseTo).toBe(350)
  })
})

describe('applyAction', () => {
  it('过牌与跟注', () => {
    const a = player()
    applyAction(a, round(), { type: 'check' })
    expect(a.actedEpoch).toBe(0)

    const b = player({ streetCommitted: 100 })
    const applied = applyAction(b, round({ currentBet: 300, lastFullRaise: 200 }), { type: 'call' })
    expect(applied.paid).toBe(200)
    expect(b.streetCommitted).toBe(300)
    expect(b.allIn).toBe(false)
  })

  it('满额加注会推进 raiseEpoch 并更新最小加注', () => {
    const r = round({ currentBet: 100, lastFullRaise: 100 })
    const a = player({ streetCommitted: 100 })
    const applied = applyAction(a, r, { type: 'raise', to: 400 })
    expect(applied.fullRaise).toBe(true)
    expect(r.currentBet).toBe(400)
    expect(r.lastFullRaise).toBe(300)
    expect(r.raiseEpoch).toBe(1)
    expect(minRaiseTo(r)).toBe(700)
  })

  it('短筹码全下不重开加注', () => {
    const r = round({ currentBet: 100, lastFullRaise: 100, raiseEpoch: 1 })
    const shortie = player({ seat: 2, streetCommitted: 0, stack: 150, actedEpoch: -1 })
    const applied = applyAction(shortie, r, { type: 'allin' })
    expect(applied.fullRaise).toBe(false)
    expect(r.currentBet).toBe(150)
    expect(r.raiseEpoch).toBe(1)

    const alreadyActed = player({ streetCommitted: 100, actedEpoch: 1 })
    const legal = legalFor(alreadyActed, r)
    expect(legal.canCall).toBe(true)
    expect(legal.canRaise).toBe(false)

    const notYet = player({ streetCommitted: 100, actedEpoch: -1 })
    const legalNotYet = legalFor(notYet, r)
    expect(legalNotYet.canRaise).toBe(true)
    expect(legalNotYet.minRaiseTo).toBe(250)
  })

  it('低于最小加注且非全下会被拒绝', () => {
    const r = round({ currentBet: 100, lastFullRaise: 100 })
    const a = player({ streetCommitted: 100 })
    expect(() => applyAction(a, r, { type: 'raise', to: 150 })).toThrow(BettingError)
  })

  it('筹码不足时全下只能跟注', () => {
    const r = round({ currentBet: 500, lastFullRaise: 400, raiseEpoch: 2 })
    const a = player({ streetCommitted: 0, stack: 200 })
    const applied = applyAction(a, r, { type: 'allin' })
    expect(applied.action).toBe('call')
    expect(a.streetCommitted).toBe(200)
    expect(a.allIn).toBe(true)
  })
})

describe('roundComplete', () => {
  it('所有人行动且补齐注额时结束', () => {
    const players = [
      player({ seat: 0, streetCommitted: 100, actedEpoch: 1 }),
      player({ seat: 1, streetCommitted: 100, actedEpoch: 1 }),
    ]
    expect(roundComplete(players, round({ currentBet: 100, raiseEpoch: 1 }))).toBe(true)
  })

  it('全下玩家被跳过', () => {
    const players = [
      player({ seat: 0, streetCommitted: 100, actedEpoch: 1 }),
      player({ seat: 1, streetCommitted: 40, actedEpoch: 0, allIn: true }),
    ]
    expect(roundComplete(players, round({ currentBet: 100, raiseEpoch: 1 }))).toBe(true)
  })

  it('还有人未行动时未结束', () => {
    const players = [
      player({ seat: 0, streetCommitted: 100, actedEpoch: 1 }),
      player({ seat: 1, streetCommitted: 100, actedEpoch: -1 }),
    ]
    expect(roundComplete(players, round({ currentBet: 100, raiseEpoch: 1 }))).toBe(false)
  })
})
