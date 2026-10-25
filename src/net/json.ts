import type { IncomingMessage } from 'node:http'
import { MAX_BODY_BYTES } from '../invariant.ts'

export function encodeJson(body: unknown): string {
  return JSON.stringify(body)
}

export async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  let size = 0
  await new Promise<void>((resolve, reject) => {
    req.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.length
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('payload too large'), { status: 413, code: 'illegal' }))
        return
      }
      chunks.push(buffer)
    })
    req.on('end', () => resolve())
    req.on('error', (error: Error) => reject(error))
  })
  if (chunks.length === 0) return {} as T
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
  } catch {
    throw Object.assign(new Error('invalid json'), { status: 400, code: 'illegal' })
  }
}
