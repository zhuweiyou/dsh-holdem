import { afterEach, describe, expect, it, vi } from 'vitest'
import { getApiBase, setApiBase } from '../../src/client/api.ts'
import { bootstrap, dispose, getState } from '../../src/client/store.ts'

function stubSession(inRoom: boolean): string[] {
  const calls: string[] = []
  vi.stubGlobal('fetch', async (input: unknown) => {
    calls.push(String(input))
    return new Response(JSON.stringify(inRoom ? { inRoom: false } : { inRoom: false }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  return calls
}

afterEach(() => {
  dispose()
  setApiBase('')
  vi.unstubAllGlobals()
})

describe('客户端 store 生命周期', () => {
  it('dispose 之后重新挂载会重新拉会话（插件热重载不会卡在旧状态）', async () => {
    const calls = stubSession(false)
    await bootstrap()
    expect(getState().booted).toBe(true)
    expect(calls.length).toBe(1)

    dispose()
    expect(getState().booted).toBe(false)
    expect(getState().view).toBe(null)

    await bootstrap()
    expect(getState().booted).toBe(true)
    expect(calls.length).toBe(2)
  })

  it('没在房间里时把后端指回本机（创建过 Cloudflare 房间再回来）', async () => {
    stubSession(false)
    setApiBase('https://dsh-holdem.example.workers.dev')

    await bootstrap()

    expect(getState().view).toBe(null)
    expect(getApiBase()).toBe('')
  })
})
