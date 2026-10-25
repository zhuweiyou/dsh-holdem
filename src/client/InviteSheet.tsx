import { useState } from 'react'
import type { PlayerView } from '../types.ts'
import { getApiBase } from './api.ts'
import { t } from './i18n.ts'
import { copyText, cx } from './ui.ts'
import css from './styles.module.css'

/** 邀请面板：一条链接 + 复制。远端（Cloudflare / 别人机器）用 joinUrl，本机优先局域网地址。 */
export function InviteSheet({ view, onClose }: { view: PlayerView; onClose: () => void }) {
  const room = view.room
  const [copied, setCopied] = useState(false)
  const remote = getApiBase() !== ''
  const link = remote ? room.joinUrl : room.lanUrl || room.joinUrl

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
