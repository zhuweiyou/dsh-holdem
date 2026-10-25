import { useEffect, useRef, useState } from 'react'
import { api, type CloudflareStatus } from './api.ts'
import { t } from './i18n.ts'
import { copyText, cx } from './ui.ts'
import css from './styles.module.css'

export interface CloudflarePanelProps {
  /** Worker 地址变化时通知外层（建房要用它当后端基址） */
  onWorkerUrl: (url: string) => void
}

/**
 * Cloudflare 授权 + 部署面板：点一下开浏览器授权，授权完直接部署，
 * 部署成功自动拿到 workers.dev 地址，用户不用自己填域名。
 */
export function CloudflarePanel({ onWorkerUrl }: CloudflarePanelProps) {
  const [status, setStatus] = useState<CloudflareStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [failure, setFailure] = useState('')
  const reported = useRef('')

  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      try {
        const next = await api.cloudflare()
        if (!alive) return
        setStatus(next)
        if (next.workerUrl && reported.current !== next.workerUrl) {
          reported.current = next.workerUrl
          onWorkerUrl(next.workerUrl)
        }
      } catch {
        if (alive) setFailure(t('cf.unreachable'))
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
  }, [onWorkerUrl])

  const act = async (action: 'login' | 'deploy' | 'cancel' | 'logout'): Promise<void> => {
    setFailure('')
    setBusy(true)
    try {
      const next = await api.cloudflareAction(action)
      setStatus(next)
      if (action === 'logout') {
        reported.current = ''
        onWorkerUrl('')
      }
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const copyUrl = async (): Promise<void> => {
    if (!status?.authorizeUrl) return
    if (await copyText(status.authorizeUrl)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    }
  }

  const authorized = status?.authorized === true
  const workerUrl = status?.workerUrl ?? ''

  return (
    <div className={css.cfPanel}>
      <div className={css.cfRow}>
        {authorized ? (
          <span className={cx(css.cfBadge, css.cfBadgeOn)}>{t('cf.authorized', { account: status?.account || 'Cloudflare' })}</span>
        ) : (
          <span className={cx(css.cfBadge, status?.pending && css.cfBadgeWait)}>
            {status?.pending ? t('cf.waiting') : t('cf.needAuth')}
          </span>
        )}
        <span className={css.grow} />
        {authorized ? (
          <>
            <button type="button" className={cx(css.btn, css.btnChip)} disabled={busy || status?.deploying} onClick={() => void act('deploy')}>
              {status?.deploying ? t('cf.deploying') : workerUrl ? t('cf.redeploy') : t('cf.deploy')}
            </button>
            <button type="button" className={cx(css.btn, css.btnChip)} disabled={busy} onClick={() => void act('logout')}>
              {t('cf.switchAccount')}
            </button>
          </>
        ) : status?.pending ? (
          <>
            <span className={css.cfWaiting}>{t('cf.waiting')}</span>
            <button type="button" className={cx(css.btn, css.btnChip)} disabled={busy} onClick={() => void act('cancel')}>
              {t('cf.cancel')}
            </button>
          </>
        ) : (
          <button type="button" className={cx(css.btn, css.btnPrimary)} disabled={busy} onClick={() => void act('login')}>
            {t('cf.authorize')}
          </button>
        )}
      </div>

      {workerUrl ? (
        <div className={css.cfRow}>
          <span className={css.cfLabel}>{t('cf.address')}</span>
          <code className={css.urlText}>{workerUrl}</code>
        </div>
      ) : null}

      {status?.authorizeUrl && !authorized ? (
        <div className={css.cfAuthBox}>
          <p className={css.cfAuthHint}>{t('cf.authHint')}</p>
          <div className={css.cfRow}>
            <code className={css.urlText} title={status.authorizeUrl}>
              {status.authorizeUrl}
            </code>
            <button type="button" className={cx(css.btn, css.btnChip)} onClick={() => void copyUrl()}>
              {copied ? t('invite.copied') : t('invite.copy')}
            </button>
          </div>
        </div>
      ) : null}

      {failure || status?.error ? <p className={css.cfError}>{failure || status?.error}</p> : null}
      {status?.log ? <pre className={css.cfLog}>{status.log.slice(-600)}</pre> : null}
    </div>
  )
}
