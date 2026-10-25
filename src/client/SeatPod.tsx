import type { SeatView, ShownHandView } from '../types.ts'
import { CardBack, CardView } from './CardView.tsx'
import { t } from './i18n.ts'
import { avatarStyle, cx, formatChips, initialOf, signedChips } from './ui.ts'
import css from './styles.module.css'

export interface SeatPodProps {
  seat: SeatView
  isYou: boolean
  isActor: boolean
  secondsLeft: number | null
  isDealer: boolean
  blind: 'sb' | 'bb' | null
  shown: ShownHandView | null
  className?: string | undefined
  canSit?: boolean | undefined
  onSit?: (() => void) | undefined
  onKick?: (() => void) | undefined
}

export function SeatPod({
  seat,
  isYou,
  isActor,
  secondsLeft,
  isDealer,
  blind,
  shown,
  className,
  canSit,
  onSit,
  onKick,
}: SeatPodProps) {
  if (!seat.playerId) {
    return (
      <div className={cx(css.seat, css.seatEmpty, className)}>
        <div className={css.seatEmptyText}>{t('table.sitDown')}</div>
        {canSit ? (
          <button type="button" className={cx(css.btn, css.btnChip)} onClick={onSit}>
            {t('table.sitDown')}
          </button>
        ) : null}
      </div>
    )
  }

  const out = seat.folded || seat.sittingOut
  return (
    <div
      className={cx(
        css.seat,
        isYou && css.seatYou,
        isActor && css.seatActor,
        out && css.seatOut,
        !seat.connected && css.seatOffline,
        className,
      )}
    >
      <div className={css.seatTop}>
        <div className={css.avatar} style={avatarStyle(seat.playerId)}>
          {initialOf(seat.displayName)}
          {isActor && secondsLeft !== null ? (
            <span
              className={css.timerRing}
              style={{ '--progress': `${Math.max(0, Math.min(1, secondsLeft / 30)) * 360}deg` } as React.CSSProperties}
              aria-hidden="true"
            />
          ) : null}
        </div>
        <div className={css.seatMeta}>
          <div className={css.seatName}>
            <span className={css.nameText}>{seat.displayName}</span>
            {isDealer ? <span className={cx(css.badge, css.badgeDealer)}>{t('table.dealer')}</span> : null}
            {blind === 'sb' ? <span className={cx(css.badge, css.badgeBlind)}>{t('table.sb')}</span> : null}
            {blind === 'bb' ? <span className={cx(css.badge, css.badgeBlind)}>{t('table.bb')}</span> : null}
            {isYou ? <span className={cx(css.badge, css.badgeYou)}>{t('table.you')}</span> : null}
            {seat.host ? <span className={cx(css.badge, css.badgeHost)}>{t('table.host')}</span> : null}
          </div>
          <div className={css.seatStack}>
            {formatChips(seat.stack)}
            {seat.handNet !== 0 ? (
              <span className={seat.handNet > 0 ? css.netUp : css.netDown}> {signedChips(seat.handNet)}</span>
            ) : null}
          </div>
          <div className={css.seatStatus}>
            {seat.allIn ? <span className={css.statusAllIn}>{t('table.allin')}</span> : null}
            {seat.folded ? <span className={css.statusFolded}>{t('table.folded')}</span> : null}
            {seat.sittingOut && !seat.autoFold ? <span className={css.statusMuted}>{t('table.sittingOut')}</span> : null}
            {seat.autoFold ? <span className={css.statusMuted}>{t('table.autofold')}</span> : null}
            {!seat.connected ? <span className={css.statusMuted}>{t('table.offline')}</span> : null}
            {seat.lastAction && !seat.folded ? <span className={css.statusAction}>{seat.lastAction}</span> : null}
          </div>
        </div>
      </div>

      {shown || seat.holeCount > 0 ? (
        <div className={css.seatCards}>
          {shown
            ? shown.cards.map((card) => <CardView key={card} card={card} size="sm" dim={out} />)
            : Array.from({ length: seat.holeCount }, (_, index) => (
              <CardBack key={index} size="sm" />
            ))}
        </div>
      ) : null}

      {onKick ? (
        <button type="button" className={css.kickBtn} title={t('table.kick')} onClick={onKick}>
          ✕
        </button>
      ) : null}
      {seat.committed > 0 ? <div className={css.betChip}>{formatChips(seat.committed)}</div> : null}
      {shown ? <div className={css.handName}>{shown.name}</div> : null}
    </div>
  )
}
