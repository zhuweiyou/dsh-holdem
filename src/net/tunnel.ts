import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { whichSync } from './which.ts'

export type TunnelState = 'off' | 'starting' | 'on' | 'error'

export interface TunnelStatus {
  state: TunnelState
  /** 有公网地址时非空，例如 https://xxx.trycloudflare.com */
  url: string
  /** 目标本地地址，例如 http://127.0.0.1:64666 */
  target: string
  /** 失败时的原因 */
  error: string
}

const URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i

/** cloudflared 的输出写到 ~/.dsh/holdem-p2p/tunnel.log，排查隧道问题用。 */
function tunnelLog(line: string): void {
  try {
    const dir = join(homedir(), '.dsh', 'holdem-p2p')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'tunnel.log'), `${new Date().toISOString()} ${line}\n`)
  } catch {
    // 忽略
  }
}

/**
 * 用一个空的最小 --config，别去读 ~/.cloudflared/config.yml。
 * 那份配置里通常写着别人的 named tunnel（tunnel:/ingress:），会干扰 quick tunnel 的注册与路由。
 */
function isolatedConfigPath(): string {
  try {
    const dir = mkdtempSync(join(tmpdir(), 'holdem-tunnel-'))
    const file = join(dir, 'config.yml')
    writeFileSync(file, 'no-autoupdate: true\n')
    return file
  } catch {
    return ''
  }
}

/**
 * 找系统里的 cloudflared：HOLDEM_CLOUDFLARED_BIN 显式指定，或 PATH 里已装好的。
 * 不再是 npm 依赖（省掉 39MB 二进制），没装就只有局域网链接可用。
 */
export function resolveCloudflared(): string {
  const custom = process.env.HOLDEM_CLOUDFLARED_BIN
  if (custom && existsSync(custom)) return custom
  const onPath = whichSync('cloudflared')
  if (onPath) return onPath
  throw new Error('没找到 cloudflared（`brew install cloudflared` 装上后公网链接才可用；局域网链接不受影响）')
}

/** 临时隧道：不用登录 Cloudflare，拿一个随机 trycloudflare.com 地址。 */
export class QuickTunnel {
  private child: ChildProcessWithoutNullStreams | null = null
  private status: TunnelStatus
  private readonly log: ((message: string) => void) | undefined
  private starting: Promise<TunnelStatus> | null = null

  constructor(
    private readonly target: string,
    private readonly healthPath: string,
    log?: (message: string) => void,
    private readonly timeoutMs = 75_000,
  ) {
    this.log = log
    this.status = { state: 'off', url: '', target, error: '' }
  }

  getStatus(): TunnelStatus {
    return { ...this.status }
  }

  /** 起来后用本机再访问一次公网地址，只写日志（界面上不提示）。 */
  private async selfCheck(url: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(`${url}${this.healthPath}`, { signal: AbortSignal.timeout(8000) })
        if (response.ok) return
      } catch {
        // 继续重试
      }
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
    this.log?.(`隧道自检未通过：${url} 从本机访问不到（不影响其它机器是否可达）`)
  }

  /** 后台启动；重复调用复用同一次启动过程。 */
  async start(): Promise<TunnelStatus> {
    if (this.status.state === 'on') return this.getStatus()
    if (this.starting) return this.starting
    this.status = { state: 'starting', url: '', target: this.target, error: '' }
    this.starting = this.launch()
    try {
      return await this.starting
    } finally {
      this.starting = null
    }
  }

  private async launch(): Promise<TunnelStatus> {
    let binary: string
    try {
      binary = resolveCloudflared()
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : String(error))
    }

    const args = [
      'tunnel',
      '--url',
      this.target,
      '--no-autoupdate',
      // http2 + 强制 IPv4：走代理/隧道时比 QUIC 稳得多
      '--protocol',
      'http2',
      '--edge-ip-version',
      '4',
    ]
    const configPath = isolatedConfigPath()
    if (configPath) args.push('--config', configPath)

    return await new Promise<TunnelStatus>((resolve) => {
      let settled = false
      let recent = ''
      const finish = (status: TunnelStatus): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.status = status
        if (status.state === 'on') {
          this.log?.(`公网地址已就绪：${status.url}`)
          void this.selfCheck(status.url)
        }
        resolve(status)
      }
      const timer = setTimeout(() => {
        this.stop()
        finish(this.fail(`启动 cloudflared 超时（${Math.round(this.timeoutMs / 1000)} 秒）`))
      }, this.timeoutMs)
      if (typeof timer === 'object' && 'unref' in timer) timer.unref()

      let child: ChildProcessWithoutNullStreams
      try {
        child = spawn(binary, args, { env: process.env })
      } catch (error) {
        finish(this.fail(error instanceof Error ? error.message : String(error)))
        return
      }
      this.child = child

      const onOutput = (chunk: Buffer): void => {
        const text = chunk.toString()
        tunnelLog(text.trimEnd())
        recent = (recent + text).slice(-4000)
        if (/429|1015/.test(text) && this.status.state === 'starting') {
          finish(this.fail('Cloudflare 正在限流（429），过几分钟再开一次'))
          return
        }
        const match = URL_PATTERN.exec(text)
        if (match) finish({ state: 'on', url: match[0], target: this.target, error: '' })
      }
      child.stdout.on('data', onOutput)
      child.stderr.on('data', onOutput)
      child.on('error', (error) => {
        finish(this.fail(error.message))
      })
      child.on('exit', (code) => {
        this.child = null
        if (this.status.state === 'on') {
          this.status = { state: 'off', url: '', target: this.target, error: `cloudflared 退出（code ${code ?? '?'}）` }
        } else if (/429|1015/.test(recent)) {
          finish(this.fail('Cloudflare 正在限流（429），过几分钟再开一次'))
        } else {
          finish(this.fail(`cloudflared 启动失败（code ${code ?? '?'}）`))
        }
      })
    })
  }

  private fail(message: string): TunnelStatus {
    this.status = { state: 'error', url: '', target: this.target, error: message }
    return { ...this.status }
  }

  stop(): void {
    const child = this.child
    this.child = null
    try {
      child?.kill('SIGTERM')
    } catch {
      // 退出失败就算了
    }
    this.status = { state: 'off', url: '', target: this.target, error: '' }
  }
}
