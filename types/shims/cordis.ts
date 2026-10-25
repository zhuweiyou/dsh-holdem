import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'

export interface Context {
  effect(fn: () => (() => void) | void, label?: string): () => void
  on(event: string, listener: (...args: unknown[]) => void): () => void
  inject(deps: readonly string[], callback: (ctx: Context) => void): () => void
  get<T = unknown>(name: string): T | undefined
  logger: {
    info(message: unknown, ...rest: unknown[]): void
    warn(message: unknown, ...rest: unknown[]): void
    error(message: unknown, ...rest: unknown[]): void
  }
  webServer: WebServer
  settings?: unknown
  systemPrompt?: {
    section(section: { name: string; order: number; text: string }): () => void
  }
}

export interface WebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

export interface WebUpgradeRoute {
  path: string
  handler: (req: IncomingMessage, socket: Duplex, head: Buffer) => void | Promise<void>
}

export interface WebServer {
  host: string
  port: number
  getOrigin(): string
  register(route: WebRoute): () => void
  registerUpgrade(route: WebUpgradeRoute): () => void
  registerFallback(handler: WebRoute['handler']): () => void
}

export type { IncomingMessage, ServerResponse, Duplex }

export class Service {
  constructor(_ctx: Context, _name: string) {}
}
