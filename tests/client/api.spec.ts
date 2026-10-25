import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, getApiBase, setApiBase } from '../../src/client/api.ts'

afterEach(() => {
  setApiBase('')
  vi.unstubAllGlobals()
})

function stubFetch(): string[] {
  const calls: string[] = []
  vi.stubGlobal('fetch', async (input: unknown) => {
    calls.push(String(input))
    return new Response(JSON.stringify({ authorized: false }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  return calls
}

describe('客户端请求基址', () => {
  it('会话指向 Worker 时，Cloudflare 授权状态仍然打本机', async () => {
    const calls = stubFetch()
    setApiBase('https://dsh-holdem.example.workers.dev')

    await api.cloudflare()
    await api.cloudflareAction('login')

    expect(getApiBase()).toBe('https://dsh-holdem.example.workers.dev')
    expect(calls).toEqual(['/holdem/api/cloudflare', '/holdem/api/cloudflare?action=login'])
  })

  it('普通请求（会话/房间）跟着当前基址走', async () => {
    const calls = stubFetch()
    setApiBase('https://dsh-holdem.example.workers.dev')

    await api.session()

    expect(calls[0]).toBe('https://dsh-holdem.example.workers.dev/holdem/api/session')
  })
})
