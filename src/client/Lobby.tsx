import { useState } from 'react'
import { BLIND_LEVELS } from '../invariant.ts'
import { t } from './i18n.ts'
import { createRoom, joinRoom, useClientState } from './store.ts'
import { HOSTING_OPTIONS, hostingOption } from './backends.ts'
import { CloudflarePanel } from './CloudflarePanel.tsx'
import { clearDeepLink, parseDeepLink, rememberName, rememberedName } from './presence.ts'
import { cx, formatChips } from './ui.ts'
import css from './styles.module.css'

const NPM_URL = 'https://www.npmjs.com/package/@zhuweiyou/dsh-holdem'

interface JoinLink {
  /** 请求要打到哪个 origin（'' = 当前 DSH 进程） */
  base: string
  code: string
  invite: string
}

/** 加入只认邀请链接：里面带着房号、邀请 token，以及这桌跑在哪台机器/Worker 上。 */
function parseJoinLink(text: string): JoinLink | null {
  const trimmed = text.trim()
  if (!/^https?:\/\//i.test(trimmed)) return null
  try {
    const url = new URL(trimmed)
    const code = (url.searchParams.get('code') ?? '').replace(/\D/g, '').slice(0, 6)
    if (code.length !== 6) return null
    const sameOrigin = typeof location !== 'undefined' && url.origin === location.origin
    return { base: sameOrigin ? '' : url.origin, code, invite: url.searchParams.get('invite') ?? '' }
  } catch {
    return null
  }
}

function readPref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(`holdem:${key}`) ?? fallback
  } catch {
    return fallback
  }
}

function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(`holdem:${key}`, value)
  } catch {
    // 忽略
  }
}

function buildLabel(): string {
  const raw = typeof __HOLDEM_BUILD__ === 'string' ? __HOLDEM_BUILD__ : ''
  const date = raw ? new Date(raw) : null
  const stamp = date && !Number.isNaN(date.getTime())
    ? date.toLocaleTimeString(undefined, { hour12: false }).slice(0, 5)
    : ''
  return stamp ? `@zhuweiyou/dsh-holdem · build ${stamp}` : '@zhuweiyou/dsh-holdem · dev'
}

export function Lobby() {
  const state = useClientState()
  const deepLink = parseDeepLink()
  const [tab, setTab] = useState<'create' | 'join'>(deepLink ? 'join' : 'create')
  const [name, setName] = useState(() => rememberedName())
  const [title, setTitle] = useState('')
  const [blindLevel, setBlindLevel] = useState<string>('25/50')
  const [hosting, setHosting] = useState<string>(() => readPref('hosting', 'cloudflare'))
  const [workerUrl, setWorkerUrl] = useState<string>(() => readPref('worker-url', ''))
  const [joinText, setJoinText] = useState(() => {
    if (!deepLink) return ''
    const query = new URLSearchParams({ code: deepLink.code, role: 'auto' })
    if (deepLink.invite) query.set('invite', deepLink.invite)
    const origin = typeof location === 'undefined' ? '' : location.origin
    return `${origin}/holdem/play?${query.toString()}`
  })
  const [error, setError] = useState<string | null>(null)

  const submitCreate = async (): Promise<void> => {
    setError(null)
    if (!name.trim()) {
      setError(t('lobby.needName'))
      return
    }
    rememberName(name.trim())
    const option = hostingOption(hosting)
    if (hosting === 'cloudflare' && workerUrl.trim() === '') {
      setError(t('host.needCloudflare'))
      return
    }
    writePref('hosting', hosting)
    try {
      await createRoom(
        { title: title.trim() || undefined, blindLevel, displayName: name.trim() },
        option.resolveBase({ url: workerUrl }),
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('error.generic'))
    }
  }

  /** 加入只用邀请链接：链接里带着房号、邀请 token 和「在哪儿」（本机 / 局域网 / Cloudflare）。 */
  const submitJoin = async (role: 'sit' | 'watch'): Promise<void> => {
    setError(null)
    if (!name.trim()) {
      setError(t('lobby.needName'))
      return
    }
    const parsed = parseJoinLink(joinText)
    if (!parsed) {
      setError(t('lobby.needLink'))
      return
    }
    rememberName(name.trim())
    try {
      await joinRoom(
        { roomCode: parsed.code, invite: parsed.invite, displayName: name.trim(), role },
        parsed.base,
      )
      clearDeepLink()
    } catch (reason) {
      const where = parsed.base === '' ? (typeof location === 'undefined' ? '本机' : location.host) : new URL(parsed.base).host
      const message = reason instanceof Error ? reason.message : t('error.generic')
      setError(t('lobby.joinFailed', { where, message }))
    }
  }

  return (
    <div className={css.lobby}>
      <div className={css.lobbyHead}>
        <h1 className={css.lobbyTitle}>{t('panel.title')}</h1>
        <p className={css.lobbySubtitle}>{t('panel.subtitle')}</p>
      </div>

      {state.notice ? <div className={css.notice}>{state.notice}</div> : null}
      {error ? <div className={css.noticeError}>{error}</div> : null}

      <div className={css.tabs}>
        <button
          type="button"
          className={cx(css.tab, tab === 'create' && css.tabActive)}
          onClick={() => setTab('create')}
        >
          {t('lobby.create')}
        </button>
        <button
          type="button"
          className={cx(css.tab, tab === 'join' && css.tabActive)}
          onClick={() => setTab('join')}
        >
          {t('lobby.join')}
        </button>
      </div>

      <div className={css.lobbyBody}>
        <label className={css.field}>
          <span className={css.fieldLabel}>{t('common.name')}</span>
          <input
            className={css.input}
            value={name}
            maxLength={16}
            placeholder={t('lobby.namePlaceholder')}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        {tab === 'create' ? (
          <>
            <label className={css.field}>
              <span className={css.fieldLabel}>{t('lobby.title')}</span>
              <input
                className={css.input}
                value={title}
                maxLength={24}
                placeholder={t('lobby.titlePlaceholder')}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className={css.field}>
              <span className={css.fieldLabel}>{t('lobby.blinds')}</span>
              <select className={css.input} value={blindLevel} onChange={(event) => setBlindLevel(event.target.value)}>
                {BLIND_LEVELS.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.id} · {t('table.blinds', { sb: level.sb, bb: level.bb, buyIn: formatChips(level.bb * 100) })}
                  </option>
                ))}
              </select>
            </label>
            <div className={css.field}>
              <span className={css.fieldLabel}>{t('host.label')}</span>
              <div className={css.hostRow}>
                {HOSTING_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={cx(css.btn, css.btnChip, hosting === option.id && css.hostActive)}
                    onClick={() => setHosting(option.id)}
                  >
                    {option.label()}
                  </button>
                ))}
              </div>
              <p className={css.hint}>{hostingOption(hosting).hint()}</p>
              {hosting === 'cloudflare' ? <CloudflarePanel onWorkerUrl={setWorkerUrl} /> : null}
            </div>
            <button type="button" className={cx(css.btn, css.btnPrimary, css.btnWide)} disabled={state.busy} onClick={() => void submitCreate()}>
              {t('lobby.createAction')}
            </button>
            <p className={css.hint}>6 人桌 · 每手 100BB · 超出座位自动观战</p>
          </>
        ) : (
          <>
            {deepLink ? <div className={css.inviteBanner}>{t('lobby.invited', { code: deepLink.code })}</div> : null}
            <label className={css.field}>
              <span className={css.fieldLabel}>{t('lobby.linkOnly')}</span>
              <input
                className={css.input}
                value={joinText}
                placeholder={t('lobby.linkOnlyPlaceholder')}
                onChange={(event) => setJoinText(event.target.value)}
              />
            </label>
            <button
              type="button"
              className={cx(css.btn, css.btnPrimary, css.btnWide)}
              disabled={state.busy}
              onClick={() => void submitJoin('sit')}
            >
              {t('lobby.enter')}
            </button>
            <p className={css.hint}>{t('lobby.linkHint')}</p>
          </>
        )}
      </div>

      <p className={css.hint}>
        {t('lobby.hintPrefix')}
        <a className={css.hintLink} href={NPM_URL} target="_blank" rel="noreferrer">
          @zhuweiyou/dsh-holdem
        </a>
        {t('lobby.hintSuffix')}
      </p>
      <p className={css.buildTag}>{buildLabel()}</p>
    </div>
  )
}
