import { useEffect } from 'react'
import { Lobby } from './Lobby.tsx'
import { Settlement } from './Settlement.tsx'
import { Table } from './Table.tsx'
import { t } from './i18n.ts'
import { bootstrap, clearToast, useClientState } from './store.ts'
import { cx } from './ui.ts'
import css from './styles.module.css'

export function HoldemPanel() {
  const state = useClientState()

  useEffect(() => {
    void bootstrap()
  }, [])

  const closed = state.view?.room.phase === 'closed' && state.view.settlement !== null

  return (
    <div className={css.panel}>
      {!state.booted ? (
        <div className={css.loading}>
          <div className={css.loadingMark} aria-hidden="true" />
          <p>{t('common.loading')}</p>
        </div>
      ) : state.view ? (
        closed ? <Settlement view={state.view} /> : <Table view={state.view} />
      ) : (
        <Lobby />
      )}
      {state.toast ? (
        <button
          type="button"
          className={cx(css.toast, state.toast.kind === 'error' && css.toastError)}
          onClick={clearToast}
        >
          {state.toast.text}
        </button>
      ) : null}
    </div>
  )
}
