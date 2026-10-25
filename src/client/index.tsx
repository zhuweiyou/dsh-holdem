import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { PANEL_KEY } from '../invariant.ts'
import { DICTS, setTranslator } from './i18n.ts'
import { registerClientSlots } from './slots.tsx'
import { dispose } from './store.ts'

export const name = 'dsh-holdem-p2p-client'
export const inject = ['slots', 'layout', 'locale']

const NS = 'holdem-p2p'

export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    const offZh = ctx.locale.register(NS, 'zh', DICTS.zh)
    const offEn = ctx.locale.register(NS, 'en', DICTS.en)
    const sync = (): void => setTranslator(ctx.locale.getLocale().id ?? 'zh')
    sync()
    const offLocale = ctx.locale.subscribe(sync)
    return () => {
      offZh()
      offEn()
      offLocale()
    }
  }, 'holdem-p2p: locale')

  ctx.effect(() => {
    registerClientSlots(ctx)
    // 邀请深链：/ ?dsh-panel=holdem-p2p&code=...&invite=...
    try {
      const params = new URLSearchParams(location.search)
      if (params.get('dsh-panel') === PANEL_KEY) ctx.layout.selectPanel(PANEL_KEY)
    } catch {
      // ignore
    }
  }, 'holdem-p2p: slots')

  ctx.effect(() => () => dispose(), 'holdem-p2p: dispose')
}
