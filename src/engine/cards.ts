import type { Card } from '../types.ts'

export const RANK_CHARS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const
export const SUIT_CHARS = ['s', 'h', 'd', 'c'] as const
export type Suit = (typeof SUIT_CHARS)[number]

export const SUIT_SYMBOL: Record<Suit, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }
export const SUIT_NAME_ZH: Record<Suit, string> = { s: '黑桃', h: '红心', d: '方块', c: '梅花' }
export const SUIT_IS_RED: Record<Suit, boolean> = { s: false, h: true, d: true, c: false }

const CARD_RE = /^[2-9TJQKA][shdc]$/

export function isCard(value: unknown): value is Card {
  return typeof value === 'string' && CARD_RE.test(value)
}

export function asCard(value: string): Card {
  if (!isCard(value)) throw new Error(`invalid card: ${value}`)
  return value
}

export function rankOf(card: Card): number {
  const index = RANK_CHARS.indexOf(card[0] as (typeof RANK_CHARS)[number])
  return index + 2
}

export function suitOf(card: Card): Suit {
  return card[1] as Suit
}

export function makeCard(rank: number, suit: Suit): Card {
  const char = RANK_CHARS[rank - 2]
  if (!char) throw new Error(`invalid rank: ${rank}`)
  return `${char}${suit}` as Card
}

export function cardLabel(card: Card): string {
  return `${card[0]}${SUIT_SYMBOL[suitOf(card)]}`
}

export function sameCard(a: Card, b: Card): boolean {
  return a === b
}

/** 稳定的 0..51 牌序号，用于排序与去重断言。 */
export function cardIndex(card: Card): number {
  const rank = rankOf(card) - 2
  const suit = SUIT_CHARS.indexOf(suitOf(card))
  return rank * 4 + suit
}

export function sortCards(cards: readonly Card[]): Card[] {
  return [...cards].sort((a, b) => cardIndex(a) - cardIndex(b))
}
