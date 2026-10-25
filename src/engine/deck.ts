import { randomBelow } from '../room/ids.ts'
import type { Card } from '../types.ts'
import { RANK_CHARS, SUIT_CHARS, makeCard } from './cards.ts'

export type RandomBelow = (maxExclusive: number) => number

/** 密码学无偏随机：拒绝采样，避免取模偏置。 */
export const cryptoBelow: RandomBelow = (maxExclusive) => randomBelow(maxExclusive)

export function makeDeck(): Card[] {
  const deck: Card[] = []
  for (let rank = 2; rank <= 14; rank += 1) {
    for (const suit of SUIT_CHARS) deck.push(makeCard(rank, suit))
  }
  return deck
}

/** Fisher–Yates；RNG 可注入以便测试复现。 */
export function shuffle<T>(items: readonly T[], random: RandomBelow = cryptoBelow): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = random(i + 1)
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }
  return out
}

export function shuffledDeck(random: RandomBelow = cryptoBelow): Card[] {
  return shuffle(makeDeck(), random)
}

/** mulberry32：仅测试使用，可复现。 */
export function seededRandom(seed: number): RandomBelow {
  let state = seed >>> 0
  return (maxExclusive: number) => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
    return Math.floor(value * maxExclusive)
  }
}

export const RANKS_IN_DECK = RANK_CHARS.length * SUIT_CHARS.length
