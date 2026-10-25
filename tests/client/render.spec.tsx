import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type {
  HandResultView,
  HandView,
  LeaderboardEntry,
  PlayerView,
  RoomView,
  SeatView,
  SessionSummary,
} from '../../src/types.ts'
import { ActionBar } from '../../src/client/ActionBar.tsx'
import { HoldemPanel } from '../../src/client/HoldemPanel.tsx'
import { Lobby } from '../../src/client/Lobby.tsx'
import { Settlement } from '../../src/client/Settlement.tsx'
import { Table } from '../../src/client/Table.tsx'

function seat(overrides: Partial<SeatView> & { seat: number }): SeatView {
  return {
    seat: overrides.seat,
    playerId: overrides.playerId ?? null,
    displayName: overrides.displayName ?? null,
    ready: overrides.ready ?? false,
    connected: overrides.connected ?? true,
    sittingOut: overrides.sittingOut ?? false,
    autoFold: overrides.autoFold ?? false,
    host: overrides.host ?? false,
    stack: overrides.stack ?? 0,
    committed: overrides.committed ?? 0,
    handNet: overrides.handNet ?? 0,
    folded: overrides.folded ?? false,
    allIn: overrides.allIn ?? false,
    lastAction: overrides.lastAction ?? null,
    holeCount: overrides.holeCount ?? 0,
  }
}

function room(phase: RoomView['phase'], overrides: Partial<RoomView> = {}): RoomView {
  return {
    roomId: 'room_test' as RoomView['roomId'],
    roomCode: '123456',
    title: '周五晚场',
    hostPlayerId: 'p_host' as RoomView['hostPlayerId'],
    hostDisplayName: '房主',
    phase,
    settings: {
      blindLevel: '25/50',
      sb: 25,
      bb: 50,
      buyIn: 5000,
      turnTimeoutMs: 30_000,
      autoAdvanceMs: 6000,
      allowSpectators: true,
      chatEnabled: true,
    },
    seats: [
      seat({ seat: 0, playerId: 'p_host' as SeatView['playerId'], displayName: '房主', ready: true, host: true, stack: 5000, committed: 50, holeCount: 2 }),
      seat({ seat: 1, playerId: 'p_guest' as SeatView['playerId'], displayName: '客人', ready: true, stack: 4950, committed: 25, holeCount: 2, lastAction: '跟注 50' }),
      seat({ seat: 2 }),
      seat({ seat: 3 }),
      seat({ seat: 4 }),
      seat({ seat: 5, playerId: 'p_watch' as SeatView['playerId'], displayName: '观众', connected: false }),
    ],
    handNo: 3,
    createdAt: new Date('2026-10-25T10:00:00Z').toISOString(),
    nextHandAt: phase === 'handOver' ? new Date(Date.now() + 4000).toISOString() : null,
    seq: 42,
    joinUrl: 'http://127.0.0.1:49923/holdem/play?code=123456&invite=t&role=auto',
    lanUrl: '',
    ...overrides,
  }
}

function hand(street: HandView['street']): HandView {
  return {
    handNo: 3,
    street,
    board: ['As', 'Kd', '7h', '2c', '9s'],
    button: 0,
    sbSeat: 1,
    bbSeat: 0,
    toActSeat: 0,
    currentBet: 100,
    minRaiseTo: 200,
    potTotal: 300,
    pots: [{ amount: 200, eligible: [0, 1] }, { amount: 100, eligible: [0, 1] }],
    deadlineAt: new Date(Date.now() + 12_000).toISOString(),
    shownHands: [],
    winners: [],
  }
}

function lastHand(): HandResultView {
  return {
    handNo: 2,
    board: ['Ah', 'Qd', '7c', '4s', '2h'],
    pots: [{ amount: 200, eligible: [0, 1] }],
    winners: [0],
    shownHands: [{ seat: 0, cards: ['Ac', 'Ad'], name: '三条 A', score: 300 }],
    deltas: [
      { seat: 0, playerId: 'p_host' as HandResultView['deltas'][number]['playerId'], displayName: '房主', net: 100 },
      { seat: 1, playerId: 'p_guest' as HandResultView['deltas'][number]['playerId'], displayName: '客人', net: -100 },
    ],
    foldedWin: false,
    endedAt: new Date().toISOString(),
  }
}

function leaderboard(): LeaderboardEntry[] {
  return [
    { playerId: 'p_host' as LeaderboardEntry['playerId'], displayName: '房主', seat: 0, handsPlayed: 3, handsWon: 2, netChips: 250, biggestWin: 300, showdownsWon: 2, showdownsPlayed: 3 },
    { playerId: 'p_guest' as LeaderboardEntry['playerId'], displayName: '客人', seat: 1, handsPlayed: 3, handsWon: 1, netChips: -250, biggestWin: 200, showdownsWon: 1, showdownsPlayed: 3 },
  ]
}

function summary(): SessionSummary {
  return {
    sessionId: 'sess_123456_1' as SessionSummary['sessionId'],
    roomCode: '123456',
    title: '周五晚场',
    startedAt: new Date(Date.now() - 600_000).toISOString(),
    endedAt: new Date().toISOString(),
    durationMs: 600_000,
    handsPlayed: 3,
    players: [
      { rank: 1, playerId: 'p_host' as LeaderboardEntry['playerId'], displayName: '房主', handsPlayed: 3, handsWon: 2, netChips: 250, biggestWin: 300, showdownsWon: 2, showdownsPlayed: 3 },
      { rank: 2, playerId: 'p_guest' as LeaderboardEntry['playerId'], displayName: '客人', handsPlayed: 3, handsWon: 1, netChips: -250, biggestWin: 200, showdownsWon: 1, showdownsPlayed: 3 },
    ],
    history: [lastHand()],
    reason: 'host-dissolved',
  }
}

function view(phase: RoomView['phase']): PlayerView {
  const closed = phase === 'closed'
  return {
    room: room(phase),
    you: {
      playerId: 'p_host' as PlayerView['you']['playerId'],
      displayName: '房主',
      seat: 0,
      spectator: false,
      ready: true,
      sittingOut: false,
      holeCards: ['Ts', 'Th'],
      legal: phase === 'hand'
        ? {
          canFold: true,
          canCheck: false,
          canCall: true,
          callAmount: 50,
          canRaise: true,
          minRaiseTo: 150,
          maxRaiseTo: 4950,
          canAllIn: true,
          allInTo: 4950,
        }
        : null,
      canAct: phase === 'hand',
      netChips: 250,
      handsPlayed: 3,
    },
    hand: phase === 'hand' || phase === 'handOver' ? hand(phase === 'hand' ? 'flop' : 'showdown') : null,
    lastHand: phase === 'lobby' ? null : lastHand(),
    leaderboard: leaderboard(),
    settlement: closed ? summary() : null,
    chat: [
      { playerId: 'p_guest' as PlayerView['you']['playerId'], displayName: '客人', text: ' nice hand', ts: new Date().toISOString() },
    ],
    spectators: [{ playerId: 'p_watch' as PlayerView['you']['playerId'], displayName: '观众' }],
    serverNow: new Date().toISOString(),
  }
}

describe('客户端渲染', () => {
  it('大厅渲染创建与加入表单', () => {
    const html = renderToString(<Lobby />)
    expect(html).toContain('创建房间')
    expect(html).toContain('加入房间')
    expect(html).toContain('25/50')
  })

  it('等待阶段牌桌渲染座位与开始按钮', () => {
    const html = renderToString(<Table view={view('lobby')} />)
    expect(html).toContain('周五晚场')
    expect(html).toContain('房主')
    expect(html).toContain('客人')
    expect(html).toContain('开始')
  })

  it('进行中渲染公共牌、底池、行动条与聊天', () => {
    const html = renderToString(<Table view={view('hand')} />)
    expect(html).toContain('翻牌')
    expect(html).toContain('底池')
    expect(html).toContain('跟注')
    expect(html).toContain('加注到')
    expect(html).toContain('排行榜')
    expect(html).toContain('nice hand')
  })

  it('单手结束渲染赢家横幅', () => {
    const html = renderToString(<Table view={view('handOver')} />)
    expect(html).toContain('下一手')
  })

  it('结算页渲染排名与导出', () => {
    const html = renderToString(<Settlement view={view('closed')} />)
    expect(html).toContain('本场结算')
    expect(html).toContain('房主')
    expect(html).toContain('复制战绩')
    expect(html).toContain('下载 JSON')
  })

  it('面板初始渲染加载态', () => {
    const html = renderToString(<HoldemPanel />)
    expect(html).toContain('正在准备牌桌')
  })

  it('下注区永远挂着一条行动条：轮到自己时高度不会变', () => {
    const lobby = renderToString(<Table view={view('lobby')} />)
    const hand = renderToString(<Table view={view('hand')} />)
    // 大厅阶段没人能操作，行动条也必须已经渲染出来（否则一进入自己的回合，
    // 下注区突然长高，牌桌画面会被顶上去）
    for (const html of [lobby, hand]) {
      expect(html).toContain('弃牌')
      expect(html).toContain('ownActions')
      expect(html).toContain('ownSlot')
    }
    expect(lobby).toContain('取消准备')
  })

  it('行动条按合法动作渲染', () => {
    const html = renderToString(
      <ActionBar
        legal={{
          canFold: true,
          canCheck: true,
          canCall: false,
          callAmount: 0,
          canRaise: false,
          minRaiseTo: 0,
          maxRaiseTo: 0,
          canAllIn: true,
          allInTo: 5000,
        }}
        potTotal={150}
        bigBlind={50}
        busy={false}
        secondsLeft={18}
        onAction={() => undefined}
      />,
    )
    expect(html).toContain('过牌')
    expect(html).toContain('18')
  })
})
