import { useState } from 'react'
import type { PlayerView } from '../types.ts'
import { t } from './i18n.ts'
import { runCommand } from './store.ts'
import { cx, formatBb, formatChips, signedChips } from './ui.ts'
import css from './styles.module.css'

export interface SideRailProps {
  view: PlayerView
  onChat: (text: string) => void
  busy: boolean
}

export function SideRail({ view, onChat, busy }: SideRailProps) {
  const isHost = view.room.hostPlayerId === view.you.playerId
  const [draft, setDraft] = useState('')
  const send = (): void => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    onChat(text.slice(0, 80))
  }

  return (
    <aside className={css.rail}>
      <section className={css.railSection}>
        <h3 className={css.railTitle}>{t('rail.leaderboard')}</h3>
        <div className={css.leaderList}>
          {view.leaderboard.length === 0 ? <p className={css.railEmpty}>{t('rail.empty')}</p> : null}
          {view.leaderboard.map((entry, index) => (
            <div key={entry.playerId} className={cx(css.leaderRow, entry.playerId === view.you.playerId && css.leaderRowYou)}>
              <span className={css.leaderRank}>{index + 1}</span>
              <span className={css.leaderName}>{entry.displayName}</span>
              <span className={css.leaderHands}>{t('rail.hands', { n: entry.handsPlayed })}</span>
              <span className={entry.netChips > 0 ? css.netUp : entry.netChips < 0 ? css.netDown : css.netFlat}>
                {signedChips(entry.netChips)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className={css.railSection}>
        <h3 className={css.railTitle}>{t('rail.history')}</h3>
        <div className={css.historyList}>
          {!view.lastHand ? <p className={css.railEmpty}>{t('rail.empty')}</p> : null}
          {view.lastHand ? (
            <div className={css.historyRow}>
              <span className={css.historyNo}>#{view.lastHand.handNo}</span>
              <span className={css.historyBoard}>
                {view.lastHand.board.map((card) => (
                  <span key={card} className={css.historyCard}>{card}</span>
                ))}
              </span>
              <span className={css.historyPot}>{formatChips(view.lastHand.pots.reduce((sum, pot) => sum + pot.amount, 0))}</span>
            </div>
          ) : null}
        </div>
      </section>

      <section className={css.railSection}>
        <h3 className={css.railTitle}>{t('rail.spectators')}</h3>
        {view.spectators.length === 0 ? <p className={css.railEmpty}>{t('rail.noSpectators')}</p> : null}
        <div className={css.spectatorList}>
          {view.spectators.map((entry) => (
            <span key={entry.playerId} className={css.spectatorChip}>
              {entry.displayName}
              {isHost ? (
                <button
                  type="button"
                  className={css.spectatorKick}
                  title={t('table.kick')}
                  onClick={() => {
                    if (window.confirm(t('table.kickConfirm', { name: entry.displayName }))) {
                      void runCommand({ type: 'hostKick', playerId: entry.playerId })
                    }
                  }}
                >
                  ✕
                </button>
              ) : null}
            </span>
          ))}
        </div>
      </section>

      <section className={cx(css.railSection, css.railChat)}>
        <h3 className={css.railTitle}>{t('rail.chat')}</h3>
        <div className={css.chatList}>
          {view.chat.length === 0 ? <p className={css.railEmpty}>{t('rail.empty')}</p> : null}
          {view.chat.map((line, index) => (
            <div key={`${line.ts}-${index}`} className={css.chatLine}>
              <span className={css.chatName}>{line.displayName}</span>
              <span className={css.chatText}>{line.text}</span>
            </div>
          ))}
        </div>
        {view.room.settings.chatEnabled ? (
          <div className={css.chatComposer}>
            <input
              className={css.chatInput}
              value={draft}
              maxLength={80}
              placeholder={t('rail.chatPlaceholder')}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') send()
              }}
            />
            <button type="button" className={cx(css.btn, css.btnChip)} disabled={busy || draft.trim().length === 0} onClick={send}>
              {t('rail.send')}
            </button>
          </div>
        ) : (
          <p className={css.railEmpty}>{t('rail.chatOff')}</p>
        )}
      </section>

      <div className={css.railFooter}>
        {t('rail.net')}: <strong>{signedChips(view.you.netChips)}</strong> · BB/100{' '}
        {formatBb(view.room.settings.bb, view.you.netChips, view.you.handsPlayed)}
      </div>
    </aside>
  )
}
