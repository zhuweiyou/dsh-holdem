import { useEffect, useState } from 'react'
import type { PlayerView } from '../types.ts'
import { api, type TunnelStatus } from './api.ts'
import { t } from './i18n.ts'
import { copyText, cx } from './ui.ts'
import css from './styles.module.css'

/**
 * 分享面板：邀请链接 + 一键开/关内置 cloudflared 隧道。
 * 隧道地址拿到后，服务端会把 publicBaseUrl 换成它，这里显示的链接随之变成公网地址。
 */
export function InviteSheet({ view, onClose }: { view: PlayerView; onClose: () => void }) {
  const room = view.room
  const [copied, setCopied] = useState<'sit' | 'lan' | null>(null)
  const [tunnel, setTunnel] = useState<TunnelStatus | null>(null)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState('')

  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      try {
        const status = await api.tunnel()
        if (alive) setTunnel(status)
      } catch {
        if (alive) setTunnel(null)
      }
    }
    void load()
    const timer = setInterval(() => {
      void load()
    }, 1500)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  const running = tunnel?.state === 'on'
  const starting = tunnel?.state === 'starting' || pending

  const toggle = async (): Promise<void> => {
    setFailure('')
    setPending(true)
    try {
      if (running) {
        setTunnel(await api.tunnelStop())
        return
      }
      const status = await api.tunnelStart()
      setTunnel(status)
      // 启动在后台跑，轮询到出地址为止
      for (let i = 0; i < 40; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500))
        const next = await api.tunnel()
        setTunnel(next)
        if (next.state === 'on' || next.state === 'error') {
          if (next.state === 'error') setFailure(next.error)
          return
        }
      }
      setFailure(t('invite.timeout'))
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  const copy = async (kind: 'sit' | 'lan', text: string): Promise<void> => {
    if (!(await copyText(text))) return
    setCopied(kind)
    setTimeout(() => setCopied((current) => (current === kind ? null : current)), 1600)
  }

  const links: { kind: 'sit'; label: string; url: string }[] = [
    { kind: 'sit', label: t('invite.link'), url: room.joinUrl },
  ]

  return (
    <div className={css.sheetBackdrop} onClick={onClose} role="presentation">
      <div className={css.sheet} role="dialog" aria-label={t('invite.title')} onClick={(event) => event.stopPropagation()}>
        <header className={css.sheetHead}>
          <h2 className={css.sheetTitle}>{t('invite.title')}</h2>
          <button type="button" className={cx(css.btn, css.btnGhost)} onClick={onClose}>
            {t('common.close')}
          </button>
        </header>

        {room.shareable ? (
          <div className={css.inviteOk}>
            <span>{t('invite.publicOn')}</span>
            <code className={css.urlText} title={room.joinUrl}>
              {tunnel?.url ?? hostOf(room.joinUrl)}
            </code>
            <button
              type="button"
              className={cx(css.btn, css.btnChip)}
              disabled={pending}
              onClick={() => {
                void (async () => {
                  setPending(true)
                  try {
                    await api.tunnelStop()
                    setTunnel(await api.tunnelStart())
                  } finally {
                    setPending(false)
                  }
                })()
              }}
            >
              {pending ? t('invite.starting') : t('invite.refresh')}
            </button>
            <button type="button" className={cx(css.btn, css.btnChip)} disabled={pending} onClick={() => void toggle()}>
              {t('invite.disable')}
            </button>
          </div>
        ) : (
          <div className={css.inviteWarn}>
            <p className={css.inviteWarnTitle}>{starting ? t('invite.starting') : t('invite.localOnly')}</p>
            <p className={css.inviteWarnText}>{tunnel?.state === 'error' && tunnel.error ? tunnel.error : t('invite.autoHint')}</p>
            {tunnel?.state === 'error' || failure ? (
              <div className={css.row}>
                <button type="button" className={cx(css.btn, css.btnChip)} disabled={starting} onClick={() => void toggle()}>
                  {t('invite.enable')}
                </button>
                {failure ? <span className={css.inviteError}>{t('invite.failed', { message: failure })}</span> : null}
              </div>
            ) : null}
          </div>
        )}

        {links.map((link) => (
          <div key={link.kind} className={css.urlRow}>
            <span className={css.urlLabel}>{link.label}</span>
            <code className={css.urlText} title={link.url}>
              {link.url}
            </code>
            <button type="button" className={cx(css.btn, css.btnChip)} onClick={() => void copy(link.kind, link.url)}>
              {copied === link.kind ? t('invite.copied') : t('invite.copy')}
            </button>
          </div>
        ))}

        <p className={css.sheetNote}>{t('invite.linkHint')} {t('invite.ephemeral')}</p>

        {room.lanUrl && hostOf(room.lanUrl) !== hostOf(room.joinUrl) ? (
          <div className={css.urlRow}>
            <span className={css.urlLabel}>{t('invite.lan')}</span>
            <code className={css.urlText} title={room.lanUrl}>
              {room.lanUrl}
            </code>
            <button type="button" className={cx(css.btn, css.btnChip)} onClick={() => void copy('lan', room.lanUrl)}>
              {copied === 'lan' ? t('invite.copied') : t('invite.copy')}
            </button>
          </div>
        ) : null}

      </div>
    </div>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return url
  }
}
