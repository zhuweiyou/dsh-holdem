import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const clientDir = fileURLToPath(new URL('../../src/client/', import.meta.url))
const stylePath = join(clientDir, 'styles.module.css')

/** CSS 顶层选择器（跳过 @media / @keyframes 内部规则）。 */
function topLevelSelectors(css: string): string[] {
  const out: string[] = []
  let depth = 0
  let buffer = ''
  for (const char of css) {
    if (char === '{') {
      if (depth === 0) {
        out.push(buffer.trim().replace(/\s+/g, ' '))
        buffer = ''
      }
      depth += 1
      continue
    }
    if (char === '}') {
      depth = Math.max(0, depth - 1)
      buffer = ''
      continue
    }
    if (depth === 0) buffer += char
  }
  return out
}

function classNames(selector: string): string[] {
  return [...selector.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((match) => match[1] ?? '')
}

const css = readFileSync(stylePath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const selectors = topLevelSelectors(css)
const defined = new Set(selectors.filter((selector) => selector.startsWith('.')).flatMap(classNames))

describe('client stylesheet', () => {
  it('没有重复定义的类：两份组件不能靠同名 class 互相覆盖', () => {
    const seen = new Set<string>()
    const duplicates: string[] = []
    for (const selector of selectors) {
      if (!selector.startsWith('.')) continue
      if (seen.has(selector)) duplicates.push(selector)
      seen.add(selector)
    }
    expect(duplicates).toEqual([])
  })

  it('tsx 里引用的每个 css.<name> 都在样式表里定义', () => {
    const files = readdirSync(clientDir).filter((name) => name.endsWith('.tsx') || name.endsWith('.ts'))
    const missing: string[] = []
    for (const file of files) {
      const source = readFileSync(join(clientDir, file), 'utf8')
      for (const match of source.matchAll(/css\.([a-zA-Z_][\w]*)/g)) {
        const name = match[1] ?? ''
        if (!defined.has(name)) missing.push(`${file}: css.${name}`)
      }
    }
    expect(missing).toEqual([])
  })
})
