import { useEffect, useState } from 'react'
import type { RoomPreview } from '../types.ts'
import { BLIND_LEVELS } from '../invariant.ts'
import { ApiError, api } from './api.ts'
import { t } from './i18n.ts'
import { createRoom, joinRoom, useClientState } from './store.ts'
import { browserId, clearDeepLink, parseDeepLink, rememberName, rememberedName } from './presence.ts'
import { cx, formatChips } from './ui.ts'
import css from './styles.module.css'

const NPM_URL = 'https://www.npmjs.com/package/dsh-holdem-p2p'

interface JoinInput {
  code: string
  invite: string
  link: string | null
  sameHost: boolean
}

/** 加入输入框同时吃「邀请链接」和「6 位房号」。 */
function parseJoinInput(text: string, fallbackInvite: string): JoinInput {
  const trimmed = text.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed)
      const code = (url.searchParams.get('code') ?? '').replace(/\D/g, '').slice(0, 6)
      const sameHost = typeof location !== 'undefined' && url.host === location.host
      return { code, invite: url.searchParams.get('invite') ?? fallbackInvite, link: trimmed, sameHost }
    } catch {
      // 不是合法 URL 就按房号处理
    }
  }
  return { code: trimmed.replace(/\D/g, '').slice(0, 6), invite: fallbackInvite, link: null, sameHost: true }
}

function buildLabel(): string {
  const raw = typeof __HOLDEM_BUILD__ === 'string' ? __HOLDEM_BUILD__ : ''
  const date = raw ? new Date(raw) : null
  const stamp = date && !Number.isNaN(date.getTime())
    ? date.toLocaleTimeString(undefined, { hour12: false }).slice(0, 5)
    : ''
  return stamp ? `dsh-holdem-p2p · build ${stamp}` : 'dsh-holdem-p2p · dev'
}

export function Lobby() {
  const state = useClientState()
  const deepLink = parseDeepLink()
  const [tab, setTab] = useState<'create' | 'join'>(deepLink ? 'join' : 'create')
  const [name, setName] = useState(() => rememberedName())
  const [title, setTitle] = useState('')
  const [blindLevel, setBlindLevel] = useState<string>('25/50')
  const [joinText, setJoinText] = useState(deepLink?.code ?? '')
  const [invite, setInvite] = useState(deepLink?.invite ?? '')
  const [preview, setPreview] = useState<RoomPreview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!deepLink) return
    let cancelled = false
    void api
      .preview({ code: deepLink.code, invite: deepLink.invite, role: deepLink.role, browserId: browserId() })
      .then((result) => {
        if (!cancelled) setPreview(result)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : t('error.generic'))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const submitCreate = async (): Promise<void> => {
    setError(null)
    if (!name.trim()) {
      setError(t('lobby.needName'))
      return
    }
    rememberName(name.trim())
    try {
      await createRoom({ title: title.trim() || undefined, blindLevel, displayName: name.trim() })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('error.generic'))
    }
  }

  const submitPreview = async (): Promise<void> => {
    setError(null)
    const parsed = parseJoinInput(joinText, invite)
    if (parsed.code.length !== 6) {
      setError(t('lobby.needCodeOrLink'))
      return
    }
    setInvite(parsed.invite)
    try {
      // 先按「这张桌就在本机」查：链接和房号都走这条，能在面板里玩就直接玩
      const result = await api.preview({ code: parsed.code, invite: parsed.invite || undefined, browserId: browserId() })
      setPreview(result)
    } catch (reason) {
      setPreview(null)
      if (openElsewhere(reason, parsed.link)) return
      setError(reason instanceof ApiError ? reason.message : t('error.generic'))
    }
  }

  const submitJoin = async (role: 'sit' | 'watch'): Promise<void> => {
    setError(null)
    if (!name.trim()) {
      setError(t('lobby.needName'))
      return
    }
    const parsed = parseJoinInput(joinText, invite)
    if (parsed.code.length !== 6) {
      setError(t('lobby.needCodeOrLink'))
      return
    }
    rememberName(name.trim())
    try {
      await joinRoom({ roomCode: parsed.code, invite: parsed.invite || undefined, displayName: name.trim(), role })
      clearDeepLink()
    } catch (reason) {
      if (openElsewhere(reason, parsed.link)) return
      setError(reason instanceof Error ? reason.message : t('error.generic'))
    }
  }

  /**
   * 本机找不到这张桌（链接是别人机器上的）时，退回网页版：直接开它的 /play。
   * 本机能找到桌的话就在 DSH 面板里玩。
   */
  const openElsewhere = (reason: unknown, link: string | null): boolean => {
    const remote = reason instanceof ApiError && (reason.code === 'room-not-found' || reason.code === 'expired' || reason.status === 404)
    if (!remote || !link) return false
    window.open(link, '_blank', 'noopener')
    setError(t('lobby.linkOpened'))
    return true
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
            <button type="button" className={cx(css.btn, css.btnPrimary, css.btnWide)} disabled={state.busy} onClick={() => void submitCreate()}>
              {t('lobby.createAction')}
            </button>
            <p className={css.hint}>6 人桌 · 每手 100BB · 超出座位自动观战</p>
          </>
        ) : (
          <>
            {deepLink ? <div className={css.inviteBanner}>{t('lobby.invited', { code: deepLink.code })}</div> : null}
            <label className={css.field}>
              <span className={css.fieldLabel}>{t('lobby.codeOrLink')}</span>
              <input
                className={cx(css.input, /^\s*https?:/i.test(joinText) ? undefined : css.inputCode)}
                value={joinText}
                placeholder={t('lobby.codeOrLinkPlaceholder')}
                onChange={(event) => {
                  setJoinText(event.target.value)
                  setPreview(null)
                }}
              />
            </label>
            <button type="button" className={cx(css.btn, css.btnOutline, css.btnWide)} disabled={state.busy} onClick={() => void submitPreview()}>
              {t('lobby.preview')}
            </button>

            {preview ? (
              <div className={css.previewCard}>
                <div className={css.previewHead}>
                  <strong>{preview.title}</strong>
                  <span className={css.previewMeta}>
                    {t('lobby.seated', { n: preview.seated })} · {t(`lobby.phase.${preview.phase === 'hand' ? 'hand' : 'lobby'}`)}
                  </span>
                </div>
                <div className={css.previewMeta}>
                  {preview.settings.blindLevel} · {t('common.spectators', { n: preview.spectators })}
                </div>
                <div className={css.previewSeats}>
                  {preview.seats.map((seat) => (
                    <span key={seat.seat} className={cx(css.previewSeat, seat.displayName ? css.previewSeatFilled : undefined)}>
                      {seat.displayName ?? '—'}
                      {seat.host ? ' ★' : ''}
                    </span>
                  ))}
                </div>
                {preview.alreadyInRoom ? (
                  <button type="button" className={cx(css.btn, css.btnPrimary, css.btnWide)} disabled={state.busy} onClick={() => void submitJoin('sit')}>
                    {t('lobby.backToRoom')}
                  </button>
                ) : (
                  <div className={css.previewActions}>
                    <button
                      type="button"
                      className={cx(css.btn, css.btnPrimary)}
                      disabled={state.busy}
                      onClick={() => void submitJoin('sit')}
                    >
                      {t('lobby.enter')}
                    </button>
                    <button type="button" className={cx(css.btn, css.btnGhost)} disabled={state.busy} onClick={() => void submitJoin('watch')}>
                      {t('lobby.watchOnly')}
                    </button>
                  </div>
                )}
                {!preview.canSit && !preview.alreadyInRoom ? <p className={css.hint}>{t('lobby.full')}</p> : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      <p className={css.hint}>
        {t('lobby.hintPrefix')}
        <a className={css.hintLink} href={NPM_URL} target="_blank" rel="noreferrer">
          dsh-holdem-p2p
        </a>
        {t('lobby.hintSuffix')}
      </p>
      <p className={css.buildTag}>{buildLabel()}</p>
    </div>
  )
}
