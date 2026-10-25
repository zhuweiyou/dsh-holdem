import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { noopStore, type HandRecord, type HoldemStore } from './noop.ts'

export { noopStore }
export type { HandRecord, HoldemStore }

export function storeRoot(): string {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'holdem')
}

/** 只追加的 JSONL 审计日志；任何失败都不影响牌局。 */
export function createFileStore(root = storeRoot()): HoldemStore {
  let ready: Promise<void> | null = null
  const ensure = (): Promise<void> => {
    ready ??= mkdir(root, { recursive: true }).then(() => undefined)
    return ready
  }
  const append = (file: string, line: string): void => {
    void ensure()
      .then(() => appendFile(join(root, file), `${line}\n`, 'utf8'))
      .catch(() => undefined)
  }
  return {
    appendHand(record) {
      append('hands.jsonl', JSON.stringify(record))
    },
    appendSession(summary) {
      append('sessions.jsonl', JSON.stringify(summary))
      void ensure()
        .then(() => writeFile(join(root, 'last-session.json'), JSON.stringify(summary, null, 2), 'utf8'))
        .catch(() => undefined)
    },
  }
}
