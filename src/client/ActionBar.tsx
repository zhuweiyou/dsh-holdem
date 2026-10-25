import { useEffect, useRef, useState } from 'react'
import type { LegalActions, TableAction } from '../types.ts'
import { t } from './i18n.ts'
import { clamp, cx, formatChips } from './ui.ts'
import css from './styles.module.css'

export interface ActionBarProps {
  legal: LegalActions
  potTotal: number
  bigBlind: number
  busy: boolean
  /**
   * 轮不到你的时候，牌桌上仍然挂着一条「占位」的行动条（`active: false`）：
   * 只是为了让下注区高度恒定，轮到自己时牌桌不会往上跳。占位时不响应键盘。
   */
  active?: boolean | undefined
  secondsLeft: number | null
  onAction: (action: TableAction) => void
}

export function ActionBar({ legal, potTotal, bigBlind, busy, active = true, secondsLeft, onAction }: ActionBarProps) {
  const [raiseTo, setRaiseTo] = useState(legal.minRaiseTo)
  const lastLegal = useRef(`${legal.minRaiseTo}:${legal.maxRaiseTo}:${legal.canRaise}`)

  useEffect(() => {
    const key = `${legal.minRaiseTo}:${legal.maxRaiseTo}:${legal.canRaise}`
    if (lastLegal.current !== key) {
      lastLegal.current = key
      setRaiseTo(legal.minRaiseTo)
    }
  }, [legal.minRaiseTo, legal.maxRaiseTo, legal.canRaise])

  const step = Math.max(1, Math.round(bigBlind / 2))
  const locked = busy || !active
  const raiseDisabled = !legal.canRaise || locked
  const minTo = legal.canRaise ? legal.minRaiseTo : 0
  const maxTo = legal.canRaise ? legal.maxRaiseTo : 0
  // 加注区一直画出来（不能加注时置灰），否则行动条时高时低，下注区还是会跳
  const presets = [
    { label: t('table.halfPot'), value: presetTo(legal, potTotal, 0.5) },
    { label: t('table.twoThirds'), value: presetTo(legal, potTotal, 0.66) },
    { label: t('table.potBet'), value: presetTo(legal, potTotal, 1) },
  ]

  useEffect(() => {
    if (!active) return undefined
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const key = event.key.toLowerCase()
      if (key === 'f' && legal.canFold) onAction({ type: 'fold' })
      else if (key === 'c' && (legal.canCheck || legal.canCall)) onAction(legal.canCheck ? { type: 'check' } : { type: 'call' })
      else if (key === 'r' && legal.canRaise) onAction({ type: 'raise', to: clamp(raiseTo, minTo, maxTo) })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, legal, onAction, raiseTo, minTo, maxTo])

  const isAllIn = legal.canRaise && raiseTo >= maxTo

  return (
    <div className={css.actionBar}>
      <div className={css.actionTimer}>
        <span className={css.actionTimerLabel}>{t('table.yourTurn')}</span>
        {secondsLeft !== null ? <span className={css.actionTimerValue}>{t('table.timer', { s: secondsLeft })}</span> : null}
      </div>
      <div className={css.actionRow}>
        <button type="button" className={cx(css.btn, css.btnGhost)} disabled={!legal.canFold || locked} onClick={() => onAction({ type: 'fold' })}>
          {t('table.fold')}
        </button>
        <button
          type="button"
          className={cx(css.btn, css.btnCall)}
          disabled={locked || (!legal.canCheck && !legal.canCall)}
          onClick={() => onAction(legal.canCheck ? { type: 'check' } : { type: 'call' })}
        >
          {legal.canCheck ? t('table.check') : t('table.call', { amount: formatChips(legal.callAmount) })}
        </button>
        <div className={css.raiseGroup}>
          {/* 预设注额单独占一行：换行只跟宽度有关，不会因为金额文字长短把行动条撑高 */}
          <div className={css.presetRow}>
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={cx(css.btn, css.btnChip)}
                disabled={raiseDisabled}
                onClick={() => setRaiseTo(clamp(preset.value, minTo, maxTo))}
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              className={cx(css.btn, css.btnChip)}
              disabled={raiseDisabled}
              onClick={() => setRaiseTo(maxTo)}
            >
              {t('table.max')}
            </button>
          </div>
          <div className={css.raiseSliderRow}>
            <span className={css.raiseValue}>
              {legal.canRaise ? (isAllIn ? t('table.allinAction') : formatChips(raiseTo)) : '—'}
            </span>
            <input
              className={css.slider}
              type="range"
              min={minTo}
              max={maxTo}
              step={step}
              value={clamp(raiseTo, minTo, maxTo)}
              disabled={raiseDisabled}
              onChange={(event) => setRaiseTo(Number(event.target.value))}
            />
            <button
              type="button"
              className={cx(css.btn, css.btnRaise)}
              disabled={raiseDisabled}
              onClick={() => onAction({ type: 'raise', to: clamp(raiseTo, minTo, maxTo) })}
            >
              {!legal.canRaise
                ? t('table.noRaise')
                : isAllIn
                  ? t('table.allinAction')
                  : t('table.raiseTo', { amount: formatChips(clamp(raiseTo, minTo, maxTo)) })}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function presetTo(legal: LegalActions, pot: number, fraction: number): number {
  if (!legal.canRaise) return 0
  const target = legal.minRaiseTo + Math.round(Math.max(pot, legal.minRaiseTo) * fraction)
  return clamp(target, legal.minRaiseTo, legal.maxRaiseTo)
}
