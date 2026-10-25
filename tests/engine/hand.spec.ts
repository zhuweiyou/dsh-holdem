import { describe, expect, it } from 'vitest'
import type { Card, PlayerId } from '../../src/types.ts'
import { asCard } from '../../src/engine/cards.ts'
import { makeDeck } from '../../src/engine/deck.ts'
import {
  act,
  createHand,
  forceTimeout,
  handView,
  legalForSeat,
  livePlayers,
  tick,
  type HandState,
} from '../../src/engine/hand.ts'

const card = asCard
const pid = (value: string) => value as PlayerId

/** pop 顺序 → 牌堆数组（从末尾取牌），不足部分用剩余牌补齐。 */
function deckFrom(popOrder: string[]): Card[] {
  const used = new Set(popOrder)
  const filler = makeDeck().filter((value) => !used.has(value))
  return [...popOrder, ...filler].reverse().map(card)
}

function makeHeadsUp(popOrder: string[], options: { now?: number } = {}): HandState {
  return createHand({
    handNo: 1,
    button: 0,
    seats: [
      { seat: 0, playerId: pid('p0'), displayName: 'A' },
      { seat: 1, playerId: pid('p1'), displayName: 'B' },
    ],
    sb: 25,
    bb: 50,
    buyIn: 5000,
    turnTimeoutMs: 30_000,
    now: options.now ?? 0,
    deck: deckFrom(popOrder),
  })
}

describe('createHand', () => {
  it('单挑：按钮下小盲，翻前按钮先行动', () => {
    const hand = makeHeadsUp([
      'As', 'Kd', 'Ah', 'Kc',
      '2c', '7d', '9s', 'Jh', '3d', '4c',
    ])
    expect(hand.sbSeat).toBe(0)
    expect(hand.bbSeat).toBe(1)
    expect(hand.toActSeat).toBe(0)
    expect(hand.players[0]!.streetCommitted).toBe(25)
    expect(hand.players[1]!.streetCommitted).toBe(50)
    expect(hand.players[0]!.hole).toEqual(['As', 'Ah'])
    expect(hand.players[1]!.hole).toEqual(['Kd', 'Kc'])
  })

  it('三人桌：按钮左手小盲，UTG 先行动', () => {
    const hand = createHand({
      handNo: 1,
      button: 0,
      seats: [
        { seat: 0, playerId: pid('p0'), displayName: 'A' },
        { seat: 1, playerId: pid('p1'), displayName: 'B' },
        { seat: 2, playerId: pid('p2'), displayName: 'C' },
      ],
      sb: 25,
      bb: 50,
      buyIn: 5000,
      turnTimeoutMs: 30_000,
      now: 0,
      deck: deckFrom(['Kd', 'Qd', 'As', 'Kc', 'Qc', 'Ah', '2c', '7d', '9s', 'Jh', '3d', '4c']),
    })
    expect(hand.sbSeat).toBe(1)
    expect(hand.bbSeat).toBe(2)
    expect(hand.toActSeat).toBe(0)
    expect(hand.players[0]!.hole).toEqual(['As', 'Ah'])
  })
})

describe('act', () => {
  it('check-down 到摊牌，赢家收池', () => {
    const hand = makeHeadsUp([
      'As', 'Kd', 'Ah', 'Kc',
      '2c', '7d', '9s', 'Jh', '3d', '4c',
    ])
    act(hand, 0, { type: 'call' }, 1)
    act(hand, 1, { type: 'check' }, 2)
    expect(hand.street).toBe('flop')
    act(hand, 1, { type: 'check' }, 3)
    act(hand, 0, { type: 'check' }, 4)
    expect(hand.street).toBe('turn')
    act(hand, 1, { type: 'check' }, 5)
    act(hand, 0, { type: 'check' }, 6)
    expect(hand.street).toBe('river')
    act(hand, 1, { type: 'check' }, 7)
    act(hand, 0, { type: 'check' }, 8)

    expect(hand.completed).toBe(true)
    expect(hand.result).not.toBeNull()
    const result = hand.result!
    expect(result.foldedWin).toBe(false)
    expect(result.winners).toEqual([0])
    expect(result.deltas.find((d) => d.seat === 0)!.net).toBe(50)
    expect(result.deltas.find((d) => d.seat === 1)!.net).toBe(-50)
    expect(hand.street).toBe('showdown')
  })

  it('弃牌获胜时只亮赢家且不摊牌', () => {
    const hand = makeHeadsUp([
      'As', 'Kd', 'Ah', 'Kc',
      '2c', '7d', '9s', 'Jh', '3d', '4c',
    ])
    act(hand, 0, { type: 'raise', to: 150 }, 1)
    act(hand, 1, { type: 'fold' }, 2)
    expect(hand.completed).toBe(true)
    expect(hand.result!.foldedWin).toBe(true)
    expect(hand.result!.deltas.find((d) => d.seat === 0)!.net).toBe(50)
    expect(handView(hand).shownHands).toEqual([])
  })

  it('全下跑马逐街发牌，最后摊牌', () => {
    const hand = makeHeadsUp([
      'As', 'Kd', 'Ah', 'Kc',
      '2c', '7d', '9s', 'Jh', '3d', '4c',
    ])
    act(hand, 0, { type: 'allin' }, 1)
    act(hand, 1, { type: 'call' }, 2)
    expect(hand.runoutDueAt).not.toBeNull()
    expect(hand.toActSeat).toBeNull()

    tick(hand, 2 + 1200)
    expect(hand.street).toBe('flop')
    tick(hand, 2 + 2400)
    expect(hand.street).toBe('turn')
    tick(hand, 2 + 3600)
    expect(hand.street).toBe('river')
    tick(hand, 2 + 4800)
    expect(hand.completed).toBe(true)
    expect(hand.result!.winners).toEqual([0])

    const view = handView(hand)
    expect(view.board).toHaveLength(5)
    expect(view.shownHands.map((shown) => shown.seat).sort()).toEqual([0, 1])
  })

  it('边池：短筹码只能赢主池，多余部分归第二名', () => {
    const hand = createHand({
      handNo: 1,
      button: 0,
      seats: [
        { seat: 0, playerId: pid('p0'), displayName: 'A' },
        { seat: 1, playerId: pid('p1'), displayName: 'B' },
        { seat: 2, playerId: pid('p2'), displayName: 'C' },
      ],
      sb: 25,
      bb: 50,
      buyIn: 5000,
      turnTimeoutMs: 30_000,
      now: 0,
      deck: deckFrom(['Kd', 'Qd', 'As', 'Kc', 'Qc', 'Ah', '2c', '7d', '9s', 'Jh', '3d', '4c']),
    })
    // 短筹码玩家 0 只带入 300。
    const shortStack = hand.players.find((player) => player.seat === 0)!
    shortStack.stack = 300
    shortStack.buyIn = 300

    act(hand, 0, { type: 'allin' }, 1)
    act(hand, 1, { type: 'call' }, 2)
    act(hand, 2, { type: 'call' }, 3)

    expect(hand.street).toBe('flop')
    act(hand, 1, { type: 'raise', to: 200 }, 4)
    act(hand, 2, { type: 'call' }, 5)
    act(hand, 1, { type: 'check' }, 6)
    act(hand, 2, { type: 'check' }, 7)
    act(hand, 1, { type: 'check' }, 8)
    act(hand, 2, { type: 'check' }, 9)

    expect(hand.completed).toBe(true)
    const deltas = new Map(hand.result!.deltas.map((delta) => [delta.seat, delta.net]))
    expect(deltas.get(0)).toBe(600)
    expect(deltas.get(1)).toBe(-100)
    expect(deltas.get(2)).toBe(-500)
    expect([...deltas.values()].reduce((sum, net) => sum + net, 0)).toBe(0)
  })

  it('超时能过牌则过牌，否则弃牌', () => {
    const hand = makeHeadsUp([
      'As', 'Kd', 'Ah', 'Kc',
      '2c', '7d', '9s', 'Jh', '3d', '4c',
    ])
    expect(legalForSeat(hand, 0)?.canCall).toBe(true)
    const outcome = forceTimeout(hand, 10)
    expect(outcome?.label).toBe('弃牌')
    expect(hand.completed).toBe(true)
    expect(livePlayers(hand)).toHaveLength(1)
  })
})
