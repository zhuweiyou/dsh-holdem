export interface LocaleSnapshot {
  id?: string
}

export interface LocaleFace {
  getLocale(): LocaleSnapshot
  getSnapshot(): LocaleSnapshot
  subscribe(fn: () => void): () => void
  register(ns: string, locale: string, dict: Record<string, string>): () => void
  bind(ns: string): Translate
}

export type Translate = (key: string, params?: Record<string, string | number>) => string

export interface ClientContext {
  slots: {
    inject(key: string, callback: () => (() => void) | void): () => void
    register(options: Record<string, unknown> & { name: string }, component: unknown): () => void
  }
  layout: {
    selectPanel(panelId: string | null): void
  }
  locale: LocaleFace
  effect(fn: () => (() => void) | void, label?: string): () => void
}
