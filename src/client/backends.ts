import { t } from './i18n.ts'

/**
 * 开桌位置的抽象：每个方案只描述「在哪儿开、需要填什么、请求打到哪个基址」。
 * 以后加 ngrok / Tailscale / 自建 VPS，只要再加一个条目。
 */
export interface HostingOption {
  id: string
  label: () => string
  hint: () => string
  /** 需要额外填一个地址（例如 Worker 的 URL） */
  needsUrl: boolean
  /** 地址输入框的占位符 */
  urlPlaceholder?: () => string
  /** 请求应该打到哪儿（'' = 当前 DSH 进程） */
  resolveBase: (context: { url: string }) => string
}

export const HOSTING_OPTIONS: HostingOption[] = [
  {
    id: 'local',
    label: () => t('host.local'),
    hint: () => t('host.localHint'),
    needsUrl: false,
    resolveBase: () => '',
  },
  {
    id: 'worker',
    label: () => t('host.worker'),
    hint: () => t('host.workerHint'),
    needsUrl: true,
    urlPlaceholder: () => t('host.workerPlaceholder'),
    resolveBase: (context) => context.url.trim().replace(/\/+$/, ''),
  },
]

export function hostingOption(id: string): HostingOption {
  return HOSTING_OPTIONS.find((option) => option.id === id) ?? HOSTING_OPTIONS[0]!
}
