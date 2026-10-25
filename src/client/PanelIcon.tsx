import type { PanelIconProps } from '@deepseek-ai/dsh-client-ui-slots'

/** 侧栏面板图标：一只筹码叠着两张牌。 */
export function PanelIcon({ size = 20, active = false }: PanelIconProps) {
  const accent = active ? 'var(--dsw-alias-brand-primary)' : 'currentColor'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4.5" y="3.5" width="9" height="13" rx="2" stroke={accent} strokeWidth="1.4" transform="rotate(-12 9 10)" />
      <rect x="9" y="6" width="9" height="13" rx="2" stroke={accent} strokeWidth="1.4" transform="rotate(9 13.5 12.5)" />
      <circle cx="7.2" cy="17.4" r="4.1" stroke={accent} strokeWidth="1.4" />
      <circle cx="7.2" cy="17.4" r="1.7" stroke={accent} strokeWidth="1.2" strokeDasharray="1.5 1.8" />
    </svg>
  )
}
