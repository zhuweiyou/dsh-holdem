import type { Card } from '../types.ts'
import { cx } from './ui.ts'
import css from './styles.module.css'

const SUIT_SYMBOL: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }
const RED_SUITS = new Set(['h', 'd'])

export function suitOfCard(card: string): string {
  return card[1] ?? 's'
}

export function rankOfCard(card: string): string {
  const char = card[0] ?? '?'
  return char === 'T' ? '10' : char
}

export function isRedCard(card: string): boolean {
  return RED_SUITS.has(suitOfCard(card))
}

export function CardView({ card, size = 'md', dim = false }: { card: Card; size?: 'sm' | 'md' | 'lg'; dim?: boolean }) {
  return (
    <div className={cx(css.card, css[`card_${size}`], isRedCard(card) ? css.cardRed : css.cardBlack, dim && css.cardDim)}>
      <span className={css.cardRank}>{rankOfCard(card)}</span>
      <span className={css.cardSuit}>{SUIT_SYMBOL[suitOfCard(card)] ?? '♠'}</span>
    </div>
  )
}

export function CardBack({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) {
  return <div className={cx(css.card, css.cardBack, css[`card_${size}`])} aria-hidden="true" />
}

export function CardSlot({ filled, size = 'md', card }: { filled: boolean; size?: 'sm' | 'md' | 'lg'; card?: Card | undefined }) {
  if (filled && card) return <CardView card={card} size={size} />
  return <div className={cx(css.card, css.cardSlot, css[`card_${size}`])} aria-hidden="true" />
}
