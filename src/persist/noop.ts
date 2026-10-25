import type { HandResultView, SessionSummary } from '../types.ts'

export interface HandRecord extends HandResultView {
  roomCode: string
  title: string
  recordedAt: string
}

export interface HoldemStore {
  appendHand(record: HandRecord): void
  appendSession(summary: SessionSummary): void
}

/** 无持久化时的空实现（也用于 Cloudflare Worker，那边没有文件系统）。 */
export const noopStore: HoldemStore = {
  appendHand() {},
  appendSession() {},
}
