import type { CSSProperties } from 'react'

export function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter((value): value is string => typeof value === 'string' && value.length > 0).join(' ')
}

const chipsFormat = new Intl.NumberFormat('en-US')

export function formatChips(value: number): string {
  return chipsFormat.format(Math.round(value))
}

export function signedChips(value: number): string {
  if (value === 0) return '0'
  return `${value > 0 ? '+' : '−'}${formatChips(Math.abs(value))}`
}

export function formatBb(bb: number, netChips: number, handsPlayed: number): string {
  if (handsPlayed <= 0 || bb <= 0) return '—'
  const value = (netChips / bb / handsPlayed) * 100
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`
}

export function formatDuration(ms: number): number {
  return Math.max(0, Math.round(ms / 60_000))
}

export function avatarStyle(playerId: string): CSSProperties {
  const hue = hashHue(playerId)
  return {
    background: `linear-gradient(150deg, hsl(${hue} 46% 44%), hsl(${(hue + 38) % 360} 42% 28%))`,
  }
}

export function initialOf(name: string | null | undefined): string {
  const text = (name ?? '?').trim()
  if (!text) return '?'
  const chars = [...text]
  return (chars[0] ?? '?').toUpperCase()
}

function hashHue(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  return hash % 360
}

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
