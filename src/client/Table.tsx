import { useEffect, useState } from 'react'
import type { LegalActions, PlayerView, SeatView, TableAction } from '../types.ts'
import { ActionBar } from './ActionBar.tsx'
import { InviteSheet } from './InviteSheet.tsx'
import { CardBack, CardSlot, CardView } from './CardView.tsx'
import { SeatPod } from './SeatPod.tsx'
import { SideRail } from './SideRail.tsx'
import { t } from './i18n.ts'
import { consumeAutoInvite, leaveRoom, runCommand, useClientState } from './store.ts'
import { cx, formatChips, signedChips } from './ui.ts'
import css from './styles.module.css'

export function Table({ view }: { view: PlayerView }) {
  const state = useClientState()
  const [railOpen, setRailOpen] = useState(() => readRailPref())
  const narrow = useNarrow()
  const hand = view.hand
  const room = view.room
  const youSeat = view.you.seat
  const acting = view.you.canAct && view.you.legal !== null
  const actor = acting ? t('table.yourTurn') : actorLabel(view)

  const secondsLeft = useCountdown(hand?.deadlineAt ?? null)
  const nextHandSeconds = useCountdown(room.nextHandAt)
  const isHost = room.hostPlayerId === view.you.playerId
  const base = youSeat ?? 0
  const [inviteOpen, setInviteOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return undefined
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  // 刚开完房：自动打开一次邀请面板，房主不用找入口
  useEffect(() => {
    if (!state.autoInvite) return
    setInviteOpen(true)
    consumeAutoInvite()
  }, [state.autoInvite])

  const act = (action: TableAction): void => {
    void runCommand({ type: 'action', action })
  }

  const seatedView = youSeat === null ? null : room.seats.find((seat) => seat.seat === youSeat) ?? null
  const emptySeats = room.seats.filter((seat) => seat.playerId === null).length

  return (
    <div className={css.table}>
      <header className={css.header}>
        <div className={css.headerMain}>
          <div className={css.titleRow}>
            <h1 className={css.roomTitle}>{room.title}</h1>
            <button type="button" className={cx(css.btn, css.inviteBtn)} onClick={() => setInviteOpen(true)}>
              {t('table.invite')}
            </button>
            <span className={cx(css.phasePill, room.phase === 'hand' ? css.phasePillHand : css.phasePillLobby)}>
              {room.phase === 'hand' ? t('lobby.phase.hand') : t('lobby.phase.lobby')}
            </span>
          </div>
          <div className={css.metaRow}>
            <span>{t('table.blinds', { sb: room.settings.sb, bb: room.settings.bb, buyIn: formatChips(room.settings.buyIn) })}</span>
            <span>{t('table.hand', { n: room.handNo })}</span>
            <span className={cx(css.conn, state.connection === 'live' ? css.connLive : state.connection === 'polling' ? css.connPolling : css.connOffline)}>
              {state.connection === 'live' ? '●' : state.connection === 'polling' ? '◐' : '○'}
            </span>
            <span className={css.spectatorCount}>{t('common.spectators', { n: view.spectators.length })}</span>
          </div>
        </div>
        <div className={css.headerActions}>
          <button
            type="button"
            className={cx(css.btn, css.btnChip)}
            onClick={() => {
              setRailOpen((open) => {
                writeRailPref(!open)
                return !open
              })
            }}
          >
            {railOpen ? t('table.hideRail') : t('table.showRail')}
          </button>
          {isHost && room.phase !== 'hand' ? (
            <button type="button" className={cx(css.btn, css.btnChip)} onClick={() => void runCommand({ type: 'hostPause' })}>
              {t('table.pause')}
            </button>
          ) : null}
          {isHost ? (
            <button
              type="button"
              className={cx(css.btn, css.btnDanger)}
              onClick={() => {
                if (window.confirm(t('table.dissolveConfirm'))) void runCommand({ type: 'hostDissolve' })
              }}
            >
              {t('table.dissolve')}
            </button>
          ) : null}
          <button type="button" className={cx(css.btn, css.btnGhost)} onClick={() => void leaveRoom()}>
            {t('common.leave')}
          </button>
        </div>
      </header>

      <div className={css.tableBody}>
        <div className={css.feltArea}>
          <div className={css.felt}>
            {narrow ? (
              <div className={css.narrowList}>
                {room.seats
                  .filter((seat) => seat.playerId !== null)
                  .map((seat) => (
                    <SeatRow key={seat.seat} seat={seat} view={view} />
                  ))}
                {emptySeats > 0 ? <div className={css.narrowEmpty}>{t('table.emptySeats', { n: emptySeats })}</div> : null}
              </div>
            ) : (
              <div className={css.seatsLayer}>
                {room.seats.map((seat) => {
                  const rel = (seat.seat - base + 6) % 6
                  const shown = hand?.shownHands.find((entry) => entry.seat === seat.seat) ?? null
                  const emptySeat = !seat.playerId
                  return (
                    <SeatPod
                      key={seat.seat}
                      seat={seat}
                      isYou={seat.seat === youSeat}
                      isActor={hand?.toActSeat === seat.seat && room.phase === 'hand'}
                      secondsLeft={hand?.toActSeat === seat.seat ? secondsLeft : null}
                      isDealer={hand?.button === seat.seat}
                      blind={hand?.sbSeat === seat.seat ? 'sb' : hand?.bbSeat === seat.seat ? 'bb' : null}
                      shown={shown}
                      className={css[`pos${rel}`]}
                      canSit={emptySeat && room.phase === 'lobby' && view.you.spectator}
                      onSit={() => void runCommand({ type: 'sit' })}
                      onKick={
                        isHost && room.phase === 'lobby' && seat.playerId !== null && seat.playerId !== view.you.playerId
                          ? () => {
                            if (window.confirm(t('table.kickConfirm', { name: seat.displayName ?? '' }))) {
                              void runCommand({ type: 'hostKick', playerId: seat.playerId as never })
                            }
                          }
                          : undefined
                      }
                    />
                  )
                })}
              </div>
            )}

            <div className={css.center}>
              <div className={css.streetLabel}>{t(`table.street.${hand?.street ?? 'preflop'}`)}</div>
              <div className={css.boardRow}>
                {Array.from({ length: 5 }, (_, index) => {
                  const card = hand?.board[index]
                  return <CardSlot key={card ?? `slot-${index}`} filled={Boolean(card)} card={card} size="md" />
                })}
              </div>
              {hand && hand.potTotal > 0 ? (
                <div className={css.potRow}>
                  <span className={css.potChips} aria-hidden="true" />
                  <span className={css.potAmount}>{t('table.pot', { amount: formatChips(hand.potTotal) })}</span>
                  {hand.pots.length > 1 ? (
                    <span className={css.sidePots}>
                      {hand.pots.map((pot, index) => (
                        <span key={index} className={css.sidePot}>
                          {index === 0 ? t('table.potMain') : t('table.potSide', { n: index })} {formatChips(pot.amount)}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {room.phase === 'lobby' ? (
                <div className={css.lobbyCenter}>
                  <div className={css.centerTitle}>{t('table.waiting')}</div>
                  <div className={css.centerHint}>
                    {seatedView?.ready ? t('table.waitingReady') : null}
                  </div>
                  <div className={css.centerActions}>
                    {isHost ? (
                      <button type="button" className={cx(css.btn, css.btnPrimary)} disabled={state.busy} onClick={() => void runCommand({ type: 'start' })}>
                        {t('table.start')}
                      </button>
                    ) : null}
                    {youSeat !== null ? (
                      <button
                        type="button"
                        className={cx(css.btn, css.btnOutline)}
                        disabled={state.busy}
                        onClick={() => void runCommand({ type: 'ready', ready: !view.you.ready })}
                      >
                        {view.you.ready ? t('table.unready') : t('table.ready')}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {room.phase === 'handOver' && view.lastHand ? (
                <div className={css.handOverBanner}>
                  <div className={css.bannerTitle}>
                    {bannerTitle(view)}
                  </div>
                  <div className={css.bannerDeltas}>
                    {view.lastHand.deltas
                      .filter((delta) => delta.net !== 0)
                      .map((delta) => (
                        <span key={delta.seat} className={delta.net > 0 ? css.netUp : css.netDown}>
                          {delta.displayName} {signedChips(delta.net)}
                        </span>
                      ))}
                  </div>
                  {nextHandSeconds !== null ? (
                    <div className={css.bannerNext}>{t('table.nextHand', { s: nextHandSeconds })}</div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className={css.ownArea}>
            {view.you.spectator ? (
              <div className={css.ownHint}>
                <span>{t('table.spectatorHint')}</span>
                {room.phase === 'lobby' ? (
                  <button type="button" className={cx(css.btn, css.btnPrimary)} disabled={state.busy} onClick={() => void runCommand({ type: 'sit' })}>
                    {t('table.sitDown')}
                  </button>
                ) : null}
              </div>
            ) : (
              <>
                <div className={css.ownCards}>
                  {view.you.holeCards.length > 0
                    ? view.you.holeCards.map((card) => <CardView key={card} card={card} size="lg" />)
                    : room.phase === 'hand'
                      ? [0, 1].map((index) => <CardBack key={index} size="lg" />)
                      : null}
                  <div className={css.ownMeta}>
                    <span className={css.ownName}>{seatedView?.displayName ?? view.you.displayName}</span>
                    <span className={css.ownStack}>{formatChips(seatedView?.stack ?? 0)}</span>
                    <span className={view.you.netChips >= 0 ? css.netUp : css.netDown}>{signedChips(view.you.netChips)}</span>
                  </div>
                </div>
                {/*
                  两条内容叠在同一格里：行动条无论轮不轮到你都在，下注区高度因此恒定。
                  以前只有轮到自己才挂行动条，它比「等待/准备」那条高一大截，牌桌会被顶上去。
                */}
                <div className={css.ownActions}>
                  <div className={cx(css.ownSlot, !acting && css.ownSlotHidden)} aria-hidden={!acting}>
                    <ActionBar
                      legal={view.you.legal ?? IDLE_LEGAL}
                      potTotal={hand?.potTotal ?? 0}
                      bigBlind={room.settings.bb}
                      busy={state.busy}
                      active={acting}
                      secondsLeft={acting ? secondsLeft : null}
                      onAction={act}
                    />
                  </div>
                  <div className={cx(css.ownSlot, acting && css.ownSlotHidden)} aria-hidden={acting}>
                    <div className={css.ownHint}>
                      <span>
                        {room.phase === 'hand' && hand
                          ? actor
                          : room.phase === 'handOver'
                            ? t('table.paused')
                            : t('table.waiting')}
                      </span>
                      {room.phase === 'lobby' ? (
                        <div className={css.ownButtons}>
                          <button
                            type="button"
                            className={cx(css.btn, css.btnOutline)}
                            disabled={state.busy}
                            onClick={() => void runCommand({ type: 'ready', ready: !view.you.ready })}
                          >
                            {view.you.ready ? t('table.unready') : t('table.ready')}
                          </button>
                          <button type="button" className={cx(css.btn, css.btnGhost)} disabled={state.busy} onClick={() => void runCommand({ type: 'stand' })}>
                            {t('table.stand')}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {inviteOpen ? <InviteSheet view={view} onClose={() => setInviteOpen(false)} /> : null}

        {railOpen ? (
          <div className={css.railWrap}>
            <SideRail view={view} busy={state.busy} onChat={(text) => void runCommand({ type: 'chat', text })} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

const RAIL_KEY = 'holdem:rail'

/**
 * 轮不到你的时候行动条只是「占位」（`active: false`），这组数值只为撑住高度，
 * 真实操作一律以服务端下发的 `LegalActions` 为准。
 */
const IDLE_LEGAL: LegalActions = {
  canFold: false,
  canCheck: false,
  canCall: false,
  callAmount: 0,
  canRaise: true,
  minRaiseTo: 0,
  maxRaiseTo: 0,
  canAllIn: false,
  allInTo: 0,
}

function readRailPref(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) !== 'closed'
  } catch {
    return true
  }
}

function writeRailPref(open: boolean): void {
  try {
    localStorage.setItem(RAIL_KEY, open ? 'open' : 'closed')
  } catch {
    // 忽略
  }
}

function actorLabel(view: PlayerView): string {
  const seat = view.hand?.toActSeat
  if (seat === undefined || seat === null) return t('table.waiting')
  const name = view.room.seats.find((entry) => entry.seat === seat)?.displayName ?? '—'
  return t('table.waitTurn', { name })
}

function bannerTitle(view: PlayerView): string {
  const last = view.lastHand
  if (!last) return ''
  if (last.foldedWin) return t('table.foldWin')
  const names = last.winners
    .map((seat) => view.room.seats.find((entry) => entry.seat === seat)?.displayName ?? '—')
    .join(' · ')
  const amount = last.pots.reduce((sum, pot) => sum + pot.amount, 0)
  return t('table.winner', { name: names, amount: formatChips(amount) })
}

function SeatRow({ seat, view }: { seat: SeatView; view: PlayerView }) {
  const shown = view.hand?.shownHands.find((entry) => entry.seat === seat.seat) ?? null
  return (
    <div className={cx(css.narrowRow, seat.seat === view.you.seat && css.narrowRowYou, seat.folded && css.seatOut)}>
      <span className={css.narrowName}>{seat.displayName ?? '—'}</span>
      <span className={css.narrowStack}>{formatChips(seat.stack)}</span>
      <span className={css.narrowCards}>
        {shown
          ? shown.cards.map((card) => <CardView key={card} card={card} size="sm" />)
          : Array.from({ length: seat.holeCount }, (_, index) => <CardBack key={index} size="sm" />)}
      </span>
      <span className={css.narrowStatus}>
        {seat.folded ? t('table.folded') : seat.allIn ? t('table.allin') : seat.lastAction ?? ''}
      </span>
    </div>
  )
}

function useCountdown(target: string | null): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!target) return undefined
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [target])
  if (!target) return null
  const remaining = Date.parse(target) - now
  if (!Number.isFinite(remaining)) return null
  return Math.max(0, Math.ceil(remaining / 1000))
}

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 900)
  useEffect(() => {
    const media = window.matchMedia('(max-width: 899px)')
    const update = (): void => setNarrow(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return narrow
}
