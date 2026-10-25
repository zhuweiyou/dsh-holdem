import type { Context } from '@deepseek-ai/cordis'
import { Config, resolveConfig, type PluginConfig } from './config.ts'
import { PACKAGE_NAME } from './invariant.ts'
import { registerHoldemHttp } from './net/routes.ts'
import { registerHoldemSocket } from './net/ws.ts'
import { startLanProxy, type LanProxy } from './net/lan-proxy.ts'
import { QuickTunnel } from './net/tunnel.ts'
import { createFileStore } from './persist/store.ts'
import { RoomManager } from './room/RoomManager.ts'

export const name = PACKAGE_NAME
export const inject = ['webServer']
export { Config }

export function apply(ctx: Context, config: PluginConfig): void {
  const resolved = resolveConfig(config)
  if (!resolved.enabled) return

  const manager = new RoomManager({
    config: resolved,
    origin: () => {
      try {
        return ctx.webServer.getOrigin()
      } catch {
        return `http://127.0.0.1:${ctx.webServer.port}`
      }
    },
    store: createFileStore(),
  })

  const tunnel = new QuickTunnel(`http://127.0.0.1:${ctx.webServer.port}`, `${resolved.routePrefix}/api/ready`, (message) => {
    ctx.logger?.info?.(message)
  })

  ctx.effect(() => {
    let lanProxy: LanProxy | null = null
    void startLanProxy({
      targetPort: ctx.webServer.port,
      prefix: resolved.routePrefix,
      log: (message) => ctx.logger?.info?.(message),
    }).then((started) => {
      lanProxy = started
      if (started) manager.setLanPort(started.port)
    })

    const stopTick = manager.start()
    const disposeHttp = registerHoldemHttp(ctx.webServer, manager, tunnel)
    const disposeWs = registerHoldemSocket(ctx.webServer, manager)
    return () => {
      stopTick()
      disposeHttp()
      disposeWs()
      lanProxy?.dispose()
      tunnel.stop()
      void manager.dispose()
    }
  }, 'holdem-p2p: room routes')

  ctx.inject(['systemPrompt'], (promptCtx) => {
    promptCtx.systemPrompt?.section({
      name: 'plugin:dsh-holdem-p2p',
      order: 200,
      text: [
        '本机已安装 dsh-holdem-p2p（点对点德州扑克）。',
        '开房与打牌都在侧栏的「德州扑克」面板里，房主进程即服务端，结算是本地娱乐筹码，不是 DeepSeek 余额。',
        '加入需要对方也安装本插件；跨机分享要先把 publicBaseUrl 配成外面能访问到这台机器的地址。',
      ].join(''),
    })
  })
}
