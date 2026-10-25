import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString('base64url')}`
}

/** 6 位房号，CSPRNG 且无取模偏置。 */
export function newRoomCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function newToken(): string {
  return randomBytes(24).toString('base64url')
}

export function newSecret(): string {
  return randomBytes(16).toString('base64url')
}

export function hashInvite(secret: string, kind: 'sit' | 'watch', token: string): string {
  return createHash('sha256').update(`${secret}|${kind}|${token}`).digest('hex')
}

export function hashEquals(expectedHex: string, actualHex: string): boolean {
  if (expectedHex.length !== actualHex.length) return false
  try {
    return timingSafeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(actualHex, 'hex'))
  } catch {
    return false
  }
}

export function sanitizeDisplayName(value: unknown): string {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return text.slice(0, 16) || '玩家'
}

export function sanitizeTitle(value: unknown): string {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return text.slice(0, 24) || '好友牌桌'
}

export function sanitizeChat(value: unknown): string | null {
  const text = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length === 0) return null
  return text.slice(0, 80)
}
