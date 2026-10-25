import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'

/** 在 PATH 里找一个可执行文件（Node 与打包后的插件通用）。 */
export function whichSync(name: string): string | undefined {
  const exts = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE').split(';') : ['']
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue
    for (const ext of exts) {
      const candidate = join(dir, name + ext)
      if (existsSync(candidate)) return candidate
    }
  }
  return undefined
}
