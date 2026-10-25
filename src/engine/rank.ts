import type { Card } from '../types.ts'
import { RANK_CHARS, rankOf, suitOf } from './cards.ts'

export const CAT_HIGH_CARD = 0
export const CAT_PAIR = 1
export const CAT_TWO_PAIR = 2
export const CAT_TRIPS = 3
export const CAT_STRAIGHT = 4
export const CAT_FLUSH = 5
export const CAT_FULL_HOUSE = 6
export const CAT_QUADS = 7
export const CAT_STRAIGHT_FLUSH = 8

export const CATEGORY_NAMES = [
  '高牌',
  '一对',
  '两对',
  '三条',
  '顺子',
  '同花',
  '葫芦',
  '四条',
  '同花顺',
] as const

export interface HandValue {
  /** 0..8；-1 表示不足 5 张。 */
  cat: number
  kickers: number[]
  score: number
  name: string
}

export function rankText(rank: number): string {
  return RANK_CHARS[rank - 2] ?? '?'
}

function makeValue(cat: number, kickers: number[]): HandValue {
  const padded = [...kickers]
  while (padded.length < 5) padded.push(0)
  let score = cat
  for (let i = 0; i < 5; i += 1) score = score * 16 + (padded[i] ?? 0)
  return { cat, kickers, score, name: handName(cat, kickers[0] ?? 0) }
}

export function handName(cat: number, high: number): string {
  if (cat === CAT_STRAIGHT_FLUSH && high === 14) return '皇家同花顺'
  return CATEGORY_NAMES[cat] ?? '未知'
}

/** 一手 5 张牌的牌力。 */
export function evaluate5(cards: readonly Card[]): HandValue {
  if (cards.length !== 5) throw new Error(`evaluate5 expects 5 cards, got ${cards.length}`)
  const ranks = cards.map(rankOf).sort((a, b) => b - a)
  const suits = cards.map(suitOf)
  const flush = suits.every((suit) => suit === suits[0])

  const counts = new Map<number, number>()
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1)

  const groups = [...counts.entries()].sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]))
  const unique = [...counts.keys()].sort((a, b) => b - a)
  const straightHigh = straightHighOf(unique)

  if (straightHigh > 0 && flush) return makeValue(CAT_STRAIGHT_FLUSH, [straightHigh])
  if ((groups[0]?.[1] ?? 0) === 4) {
    const quad = groups[0]![0]
    const kicker = groups[1]![0]
    return makeValue(CAT_QUADS, [quad, kicker])
  }
  if ((groups[0]?.[1] ?? 0) === 3 && (groups[1]?.[1] ?? 0) >= 2) {
    return makeValue(CAT_FULL_HOUSE, [groups[0]![0], groups[1]![0]])
  }
  if (flush) return makeValue(CAT_FLUSH, ranks)
  if (straightHigh > 0) return makeValue(CAT_STRAIGHT, [straightHigh])
  if ((groups[0]?.[1] ?? 0) === 3) {
    const rest = unique.filter((rank) => rank !== groups[0]![0]).slice(0, 2)
    return makeValue(CAT_TRIPS, [groups[0]![0], ...rest])
  }
  if ((groups[0]?.[1] ?? 0) === 2 && (groups[1]?.[1] ?? 0) === 2) {
    const highPair = Math.max(groups[0]![0], groups[1]![0])
    const lowPair = Math.min(groups[0]![0], groups[1]![0])
    const kicker = groups[2]![0]
    return makeValue(CAT_TWO_PAIR, [highPair, lowPair, kicker])
  }
  if ((groups[0]?.[1] ?? 0) === 2) {
    const rest = unique.filter((rank) => rank !== groups[0]![0]).slice(0, 3)
    return makeValue(CAT_PAIR, [groups[0]![0], ...rest])
  }
  return makeValue(CAT_HIGH_CARD, ranks)
}

/** 5..7 张里最好的 5 张；不足 5 张返回无效值。 */
export function evaluateBest(cards: readonly Card[]): HandValue {
  if (cards.length < 5) return { cat: -1, kickers: [], score: -1, name: '未成牌' }
  if (cards.length === 5) return evaluate5(cards)
  let best: HandValue | null = null
  const n = cards.length
  for (let a = 0; a < n - 4; a += 1) {
    for (let b = a + 1; b < n - 3; b += 1) {
      for (let c = b + 1; c < n - 2; c += 1) {
        for (let d = c + 1; d < n - 1; d += 1) {
          for (let e = d + 1; e < n; e += 1) {
            const value = evaluate5([cards[a]!, cards[b]!, cards[c]!, cards[d]!, cards[e]!])
            if (!best || value.score > best.score) best = value
          }
        }
      }
    }
  }
  return best ?? { cat: -1, kickers: [], score: -1, name: '未成牌' }
}

export function compareHandValues(a: HandValue, b: HandValue): number {
  if (a.score !== b.score) return a.score - b.score
  if (a.cat !== b.cat) return a.cat - b.cat
  for (let i = 0; i < Math.max(a.kickers.length, b.kickers.length); i += 1) {
    const diff = (a.kickers[i] ?? 0) - (b.kickers[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** 返回顺子的最大牌点；A2345 记为 5；不成顺返回 0。 */
function straightHighOf(descUnique: number[]): number {
  if (descUnique.length < 5) return 0
  const isWheel =
    descUnique.includes(14) &&
    descUnique.includes(5) &&
    descUnique.includes(4) &&
    descUnique.includes(3) &&
    descUnique.includes(2)
  if (isWheel) return 5
  for (let i = 0; i + 4 < descUnique.length; i += 1) {
    const high = descUnique[i]!
    const low = descUnique[i + 4]!
    if (high - low === 4) return high
  }
  return 0
}

/** 牌型名 + 关键牌点，如「一对 K」「同花 A」。 */
export function describeHand(value: HandValue): string {
  if (value.cat < 0) return '未成牌'
  if (value.cat === CAT_STRAIGHT_FLUSH && value.kickers[0] === 14) return '皇家同花顺'
  const high = value.kickers[0]
  if (high === undefined) return value.name
  return `${value.name} ${rankText(high)}`
}
