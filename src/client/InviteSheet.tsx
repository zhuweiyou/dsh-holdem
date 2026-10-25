import { useState } from 'react'
import type { PlayerView } from '../types.ts'
import { getApiBase } from './api.ts'
import { t } from './i18n.ts'
import { copyText, cx } from './ui.ts'
import css from './styles.module.css'

/**
 * 邀请面板：一条链接 + 复制。
 * 选哪条链接由后端决定——Cloudflare 房间就是 Worker 地址，本机房间优先公网隧道，
 * 没有隧道就退回局域网地址。
 */
export function InviteSheet({ view, onClose }: { view: PlayerView; onClose: () => void }) {
  const room = view.room
  const [copied, setCopied] = useState(false)
  const remote = getApiBase() !== ''

  const link = pickLink({ joinUrl: room.joinUrl, lanUrl: room.lanUrl, shareable: room.shareable, remote })

  const copy = async (): Promise<void> => {
    if (!(await copyText(link))) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className={css.sheetBackdrop} onClick={onClose} role="presentation">
      <div className={css.sheet} role="dialog" aria-label={t('invite.title')} onClick={(event) => event.stopPropagation()}>
        <header className={css.sheetHead}>
          <h2 className={css.sheetTitle}>{t('invite.title')}</h2>
          <button type="button" className={cx(css.btn, css.btnGhost)} onClick={onClose}>
            {t('common.close')}
          </button>
        </header>

        <div className={css.inviteLinkRow}>
          <input
            className={css.inviteLinkInput}
            value={link}
            readOnly
            spellCheck={false}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button type="button" className={cx(css.btn, css.btnPrimary)} onClick={() => void copy()}>
            {copied ? t('invite.copied') : t('invite.copy')}
          </button>
        </div>
      </div>
    </div>
  )
}

function pickLink(input: { joinUrl: string; lanUrl: string; shareable: boolean; remote: boolean }): string {
  if (input.remote) return input.joinUrl
  if (input.shareable) return input.joinUrl
  return input.lanUrl || input.joinUrl
}
