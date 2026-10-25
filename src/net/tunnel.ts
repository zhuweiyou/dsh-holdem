import { appendFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { Tunnel, bin as packageBin, install, use } from 'cloudflared'

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

/**
 * 用一个空的 --config，别去读 ~/.cloudflared/config.yml。
 * 那份配置里通常写着别人的 named tunnel（tunnel:/ingress:），会干扰 quick tunnel 的注册与路由。
 */
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

function isolatedConfigPath(): string {
  try {
    const dir = mkdtempSync(join(tmpdir(), 'holdem-tunnel-'))
    const file = join(dir, 'config.yml')
    // 有效的最小配置：既有内容（避免 empty 警告），又不带任何 named tunnel
    writeFileSync(file, 'no-autoupdate: true\n')
    return file
  } catch {
    return ''
  }
}

function whichSync(name: string): string | undefined {
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

/**
 * 找一个可用的 cloudflared：
 * 1. HOLDEM_CLOUDFLARED_BIN 显式指定；
 * 2. PATH 里已经装好的（brew / apt / 手装）；
 * 3. npm 包自带的下载位置，没有就下载一次。
 */
export async function resolveCloudflared(log?: (message: string) => void): Promise<string> {
  const custom = process.env.HOLDEM_CLOUDFLARED_BIN
  if (custom && existsSync(custom)) return custom
  const onPath = whichSync('cloudflared')
  if (onPath) return onPath
  if (existsSync(packageBin)) return packageBin
  log?.('正在下载 cloudflared 二进制…')
  const installed = await install(packageBin)
  return installed
}

/** 内置的临时隧道：不用登录 Cloudflare，拿一个随机 trycloudflare.com 地址。 */
export class QuickTunnel {
  private tunnel: Tunnel | null = null
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

  getStatus(): TunnelStatus {
    return { ...this.status }
  }

  /** 后台启动；重复调用复用同一次启动过程。返回的是「起步后」的状态。 */
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
      binary = await resolveCloudflared(this.log)
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : String(error))
    }

    try {
      use(binary)
      // 这个包的 options 会把 key 原样拼进命令行，所以键名要自带 `--`
      // http2 + 强制 IPv4：走代理/隧道时比 QUIC 稳得多
      const configPath = isolatedConfigPath()
      const options: Record<string, string | boolean> = {
        '--no-autoupdate': true,
        '--protocol': 'http2',
        '--edge-ip-version': '4',
      }
      if (configPath) options['--config'] = configPath
      const tunnel = Tunnel.quick(this.target, options)
      this.tunnel = tunnel

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

        const onOutput = (chunk: string): void => {
          tunnelLog(chunk.trimEnd())
          recent = (recent + chunk).slice(-4000)
          if (/429|1015/.test(chunk) && this.status.state === 'starting') {
            finish(this.fail('Cloudflare 正在限流（429），过几分钟再开一次'))
            return
          }
          const match = URL_PATTERN.exec(chunk)
          if (match) {
            finish({ state: 'on', url: match[0], target: this.target, error: '' })
          }
        }
        tunnel.on('url', (url: string) => {
          finish({ state: 'on', url: url.replace(/\/$/, ''), target: this.target, error: '' })
        })
        tunnel.on('stdout', onOutput)
        tunnel.on('stderr', onOutput)
        tunnel.on('error', (error: Error) => {
          finish(this.fail(error.message))
        })
        tunnel.on('exit', (code: number | null) => {
          this.tunnel = null
          if (this.status.state === 'on') {
            this.status = { state: 'off', url: '', target: this.target, error: `cloudflared 退出（code ${code ?? '?'}）` }
          } else if (/429|1015/.test(recent)) {
            finish(this.fail('Cloudflare 正在限流（429），过几分钟再开一次'))
          } else {
            finish(this.fail(`cloudflared 启动失败（code ${code ?? '?'}）`))
          }
        })
      })
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : String(error))
    }
  }

  private fail(message: string): TunnelStatus {
    this.status = { state: 'error', url: '', target: this.target, error: message }
    return { ...this.status }
  }

  stop(): void {
    const tunnel = this.tunnel
    this.tunnel = null
    try {
      tunnel?.stop()
    } catch {
      // 退出失败就算了
    }
    this.status = { state: 'off', url: '', target: this.target, error: '' }
  }
}
