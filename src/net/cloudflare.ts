import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { whichSync } from './which.ts'

/**
 * Cloudflare 授权 + 部署：直接驱动 wrangler（官方 CLI）。
 *
 * - 授权：spawn `wrangler login`，它会在本机起回调服务并打开浏览器；
 *   把 OAuth 链接截出来交给界面，浏览器没自动打开时可以复制。
 * - 部署：spawn `wrangler deploy`，从输出里抓 workers.dev 地址并记住。
 */

export interface CloudflareStatus {
  authorized: boolean
  account: string
  workerUrl: string
  pending: boolean
  deploying: boolean
  authorizeUrl: string
  error: string
  log: string
}

interface StoredState {
  workerUrl: string
  account: string
}

const OAUTH_PATTERN = /https:\/\/dash\.cloudflare\.com\/oauth2\/auth\?[^\s"'`]+/
const WORKER_URL_PATTERN = /https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/i

function stateFile(): string {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'holdem', 'cloudflare.json')
}

function readStored(): StoredState {
  try {
    const parsed = JSON.parse(readFileSync(stateFile(), 'utf8')) as Partial<StoredState>
    return { workerUrl: parsed.workerUrl ?? '', account: parsed.account ?? '' }
  } catch {
    return { workerUrl: '', account: '' }
  }
}

function writeStored(next: StoredState): void {
  const file = stateFile()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(next, null, 2))
}

/**
 * 插件根目录：从当前模块位置往上找 package.json（打包后是 lib/index.js，
 * 源码里是 src/net/cloudflare.ts，层级不一样，不能写死 .. 的层数）。
 */
function packageRoot(): string {
  let dir = dirname(new URL(import.meta.url).pathname)
  for (let depth = 0; depth < 5; depth += 1) {
    if (existsSync(join(dir, 'wrangler.toml'))) return dir
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return resolve(dirname(new URL(import.meta.url).pathname), '..')
}

function wranglerCredentialFiles(): string[] {
  const home = homedir()
  return [
    join(home, 'Library', 'Preferences', '.wrangler', 'config', 'default.toml'),
    join(home, '.config', '.wrangler', 'config', 'default.toml'),
    join(home, '.wrangler', 'config', 'default.toml'),
  ]
}

function hasWranglerCredentials(): boolean {
  return wranglerCredentialFiles().some((file) => existsSync(file))
}

interface WranglerCommand {
  command: string
  baseArgs: string[]
  env?: Record<string, string>
  label: string
}

/**
 * 找一套能跑起来的 wrangler 调用方式，并做一次 `--version` 探活：
 * 1. HOLDEM_WRANGLER 显式指定；
 * 2. PATH 里的 node + 依赖里的 wrangler（正常情况，不依赖全局 wrangler）；
 * 3. Electron 自带 Node 模式（用户机器上没装 Node 时）：
 *    ELECTRON_RUN_AS_NODE=1 <Electron 可执行文件> wrangler/bin/wrangler.js；
 * 4. 插件目录的 .bin/wrangler 软链；
 * 5. PATH 里的全局 wrangler。
 */
function wranglerCandidates(): WranglerCommand[] {
  const candidates: WranglerCommand[] = []
  const custom = process.env.HOLDEM_WRANGLER
  if (custom) candidates.push({ command: custom, baseArgs: [], label: `HOLDEM_WRANGLER=${custom}` })

  let cli = ''
  try {
    const require = createRequire(import.meta.url)
    const pkg = require.resolve('wrangler/package.json')
    const candidate = join(dirname(pkg), 'bin', 'wrangler.js')
    if (existsSync(candidate)) cli = candidate
  } catch {
    // 依赖里没有 wrangler
  }

  if (cli) {
    const node = whichSync('node')
    if (node) candidates.push({ command: node, baseArgs: [cli], label: `${node} ${cli}` })
    if (process.versions.electron) {
      candidates.push({
        command: process.execPath,
        baseArgs: [cli],
        env: { ELECTRON_RUN_AS_NODE: '1' },
        label: `ELECTRON_RUN_AS_NODE ${cli}`,
      })
    }
  }

  const shim = join(packageRoot(), 'node_modules', '.bin', 'wrangler')
  if (existsSync(shim)) candidates.push({ command: shim, baseArgs: [], label: shim })
  const onPath = whichSync('wrangler')
  if (onPath) candidates.push({ command: onPath, baseArgs: [], label: onPath })
  return candidates
}

let resolvedCommand: WranglerCommand | null = null

function wranglerCommand(): WranglerCommand {
  if (resolvedCommand) return resolvedCommand
  for (const candidate of wranglerCandidates()) {
    try {
      const probe = spawnSync(candidate.command, [...candidate.baseArgs, '--version'], {
        encoding: 'utf8',
        timeout: 15_000,
        env: candidate.env ? { ...process.env, ...candidate.env } : process.env,
      })
      if (probe.status === 0) {
        resolvedCommand = candidate
        return candidate
      }
    } catch {
      // 下一个候选
    }
  }
  return { command: 'wrangler', baseArgs: [], label: 'wrangler' }
}

function stripAnsi(text: string): string {
  return text.replace(/[\u001b\u009b][[()#;?]*(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
}

export class CloudflareDeployer {
  private stored = readStored()
  private login: ChildProcessWithoutNullStreams | null = null
  private deploy: ChildProcessWithoutNullStreams | null = null
  private authorizeUrl = ''
  private log = ''
  private error = ''
  private checkedAt = 0
  private authorized = false

  getStatus(): CloudflareStatus {
    this.refreshAuth()
    return {
      authorized: this.authorized,
      account: this.stored.account,
      workerUrl: this.stored.workerUrl,
      pending: this.login !== null,
      deploying: this.deploy !== null,
      authorizeUrl: this.authorizeUrl,
      error: this.error,
      log: this.log.slice(-1500),
    }
  }

  /** 已经授权过就不再反复跑 whoami（60 秒缓存）。 */
  private refreshAuth(): void {
    if (this.login || this.deploy) return
    const now = Date.now()
    if (now - this.checkedAt < 60_000) return
    this.checkedAt = now
    try {
      const cli = wranglerCommand()
      const result = spawnSync(cli.command, [...cli.baseArgs, 'whoami'], {
        encoding: 'utf8',
        timeout: 15_000,
        env: cli.env ? { ...process.env, ...cli.env } : process.env,
      })
      const output = stripAnsi(`${result.stdout ?? ''}\n${result.stderr ?? ''}`)
      const notLoggedIn = /not logged in|You are not authenticated/i.test(output)
      if (notLoggedIn) {
        this.authorized = false
        return
      }
      const email = /associated with the email\s+([^\s.]+(?:\.[^\s.]+)*)/i.exec(output)?.[1]
      if (email) {
        this.authorized = true
        this.stored = { ...this.stored, account: email }
        return
      }
      // whoami 超时或输出不认识：凭据文件在就当已授权，别让界面误报
      this.authorized = result.status === 0 || hasWranglerCredentials()
    } catch {
      this.authorized = hasWranglerCredentials()
    }
  }

  startLogin(): CloudflareStatus {
    if (this.login) return this.getStatus()
    this.error = ''
    this.authorizeUrl = ''
    const cli = wranglerCommand()
    this.log = `wrangler: ${cli.label}\n`
    try {
      const child = spawn(cli.command, [...cli.baseArgs, 'login'], {
        cwd: packageRoot(),
        env: cli.env ? { ...process.env, ...cli.env } : process.env,
      })
      this.login = child
      const onData = (chunk: Buffer): void => {
        const text = stripAnsi(chunk.toString())
        this.log = `${this.log}${text}`
        const match = OAUTH_PATTERN.exec(text)
        if (match && this.authorizeUrl === '') {
          // wrangler login 自己会拉起浏览器；这里只把链接暴露给界面，
          // 万一浏览器没弹出来，用户可以复制这条链接手动打开。
          this.authorizeUrl = match[0]
        }
      }
      child.stdout.on('data', onData)
      child.stderr.on('data', onData)
      child.on('exit', (code) => {
        this.login = null
        this.checkedAt = 0
        if (code !== 0) this.error = 'Cloudflare 授权没有完成'
      })
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error)
    }
    return this.getStatus()
  }

  /** 等待浏览器回调时用户点了取消：直接杀掉 wrangler 进程。 */
  cancelLogin(): CloudflareStatus {
    const child = this.login
    this.login = null
    this.authorizeUrl = ''
    this.checkedAt = 0
    try {
      child?.kill()
    } catch {
      // 忽略
    }
    return this.getStatus()
  }

  startDeploy(): CloudflareStatus {
    if (this.deploy) return this.getStatus()
    this.error = ''
    const cli = wranglerCommand()
    this.log = `wrangler: ${cli.label}\n`
    try {
      // 显式指定 config：当前目录往上可能有别人的 wrangler.jsonc，会被误用
      const child = spawn(
        cli.command,
        [...cli.baseArgs, 'deploy', '--config', join(packageRoot(), 'wrangler.toml')],
        { cwd: packageRoot(), env: cli.env ? { ...process.env, ...cli.env } : process.env },
      )
      this.deploy = child
      const onData = (chunk: Buffer): void => {
        const text = stripAnsi(chunk.toString())
        this.log = `${this.log}${text}`
        const match = WORKER_URL_PATTERN.exec(text)
        if (match) {
          this.stored = { ...this.stored, workerUrl: match[0].replace(/\/$/, '') }
          writeStored(this.stored)
        }
      }
      child.stdout.on('data', onData)
      child.stderr.on('data', onData)
      child.on('exit', (code) => {
        this.deploy = null
        if (code !== 0 && this.stored.workerUrl === '') this.error = '部署失败，看看 wrangler 输出的日志'
      })
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error)
    }
    return this.getStatus()
  }

  logout(): CloudflareStatus {
    try {
      const cli = wranglerCommand()
      spawnSync(cli.command, [...cli.baseArgs, 'logout'], {
        encoding: 'utf8',
        timeout: 10_000,
        env: cli.env ? { ...process.env, ...cli.env } : process.env,
      })
    } catch {
      // 忽略
    }
    this.authorized = false
    this.checkedAt = 0
    this.stored = { ...this.stored, account: '' }
    writeStored(this.stored)
    return this.getStatus()
  }

  dispose(): void {
    this.login?.kill()
    this.deploy?.kill()
    this.login = null
    this.deploy = null
  }
}

