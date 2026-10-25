import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { PanelIconProps } from '@deepseek-ai/dsh-client-ui-slots'
import { PANEL_KEY } from '../invariant.ts'
import { HoldemPanel } from './HoldemPanel.tsx'
import { PanelIcon } from './PanelIcon.tsx'
import { t } from './i18n.ts'

export { PANEL_KEY }

export function registerClientSlots(ctx: ClientContext): void {
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_KEY,
    order: 30,
    label: () => t('panel.title'),
  }, function HoldemIcon(props: PanelIconProps) {
    return (
      <span
        onClick={() => ctx.layout.selectPanel(PANEL_KEY)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') ctx.layout.selectPanel(PANEL_KEY)
        }}
        role="presentation"
      >
        <PanelIcon {...props} />
      </span>
    )
  }))

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_KEY,
  }, HoldemPanel))
}
