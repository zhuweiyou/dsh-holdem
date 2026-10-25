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
  secondsLeft: number | null
  onAction: (action: TableAction) => void
}

export function ActionBar({ legal, potTotal, bigBlind, busy, secondsLeft, onAction }: ActionBarProps) {
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
  const raiseDisabled = !legal.canRaise || busy
  const presets: { label: string; value: number }[] = legal.canRaise
    ? [
      { label: t('table.halfPot'), value: presetTo(legal, potTotal, 0.5) },
      { label: t('table.twoThirds'), value: presetTo(legal, potTotal, 0.66) },
      { label: t('table.potBet'), value: presetTo(legal, potTotal, 1) },
    ]
    : []

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const key = event.key.toLowerCase()
      if (key === 'f' && legal.canFold) onAction({ type: 'fold' })
      else if (key === 'c' && (legal.canCheck || legal.canCall)) onAction(legal.canCheck ? { type: 'check' } : { type: 'call' })
      else if (key === 'r' && legal.canRaise) onAction({ type: 'raise', to: clamp(raiseTo, legal.minRaiseTo, legal.maxRaiseTo) })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [legal, onAction, raiseTo])

  const isAllIn = legal.canRaise && raiseTo >= legal.maxRaiseTo

  return (
    <div className={css.actionBar}>
      <div className={css.actionTimer}>
        <span className={css.actionTimerLabel}>{t('table.yourTurn')}</span>
        {secondsLeft !== null ? <span className={css.actionTimerValue}>{t('table.timer', { s: secondsLeft })}</span> : null}
      </div>
      <div className={css.actionRow}>
        <button type="button" className={cx(css.btn, css.btnGhost)} disabled={!legal.canFold || busy} onClick={() => onAction({ type: 'fold' })}>
          {t('table.fold')}
        </button>
        <button
          type="button"
          className={cx(css.btn, css.btnCall)}
          disabled={busy || (!legal.canCheck && !legal.canCall)}
          onClick={() => onAction(legal.canCheck ? { type: 'check' } : { type: 'call' })}
        >
          {legal.canCheck ? t('table.check') : t('table.call', { amount: formatChips(legal.callAmount) })}
        </button>
        {legal.canRaise ? (
          <div className={css.raiseGroup}>
            <div className={css.raiseHead}>
              <span className={css.raiseValue}>{isAllIn ? t('table.allinAction') : formatChips(raiseTo)}</span>
              <div className={css.presetRow}>
                {presets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className={cx(css.btn, css.btnChip)}
                    disabled={raiseDisabled}
                    onClick={() => setRaiseTo(clamp(preset.value, legal.minRaiseTo, legal.maxRaiseTo))}
                  >
                    {preset.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={cx(css.btn, css.btnChip)}
                  disabled={raiseDisabled}
                  onClick={() => setRaiseTo(legal.maxRaiseTo)}
                >
                  {t('table.max')}
                </button>
              </div>
            </div>
            <input
              className={css.slider}
              type="range"
              min={legal.minRaiseTo}
              max={legal.maxRaiseTo}
              step={step}
              value={clamp(raiseTo, legal.minRaiseTo, legal.maxRaiseTo)}
              disabled={raiseDisabled}
              onChange={(event) => setRaiseTo(Number(event.target.value))}
            />
            <button
              type="button"
              className={cx(css.btn, css.btnRaise)}
              disabled={raiseDisabled}
              onClick={() => onAction({ type: 'raise', to: clamp(raiseTo, legal.minRaiseTo, legal.maxRaiseTo) })}
            >
              {isAllIn
                ? t('table.allinAction')
                : t('table.raiseTo', { amount: formatChips(clamp(raiseTo, legal.minRaiseTo, legal.maxRaiseTo)) })}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function presetTo(legal: LegalActions, pot: number, fraction: number): number {
  const target = legal.minRaiseTo + Math.round(Math.max(pot, legal.minRaiseTo) * fraction)
  return clamp(target, legal.minRaiseTo, legal.maxRaiseTo)
}
