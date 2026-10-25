export interface PotPlayer {
  seat: number
  /** 本手累计投入（含本街）。 */
  committed: number
  folded: boolean
}

export interface Pot {
  amount: number
  eligible: number[]
}

export interface PotBuild {
  pots: Pot[]
  /** 未被跟注、应原路退回的筹码。 */
  returned: { seat: number; amount: number }[]
}

/**
 * 按投入额分层构造主池与边池。
 * 弃牌者的投入留在池里，但没有资格；只有一名玩家投入的最高层视为未被跟注，退回。
 */
export function buildPots(players: readonly PotPlayer[]): PotBuild {
  const contributors = players.filter((p) => p.committed > 0)
  if (contributors.length === 0) return { pots: [], returned: [] }

  const levels = [...new Set(contributors.map((p) => p.committed))].sort((a, b) => a - b)
  const pots: Pot[] = []
  let previous = 0
  for (const level of levels) {
    const inLevel = contributors.filter((p) => p.committed >= level)
    const amount = inLevel.reduce((sum, p) => sum + (Math.min(p.committed, level) - previous), 0)
    if (amount > 0) {
      pots.push({ amount, eligible: inLevel.filter((p) => !p.folded).map((p) => p.seat) })
    }
    previous = level
  }

  const returned: { seat: number; amount: number }[] = []
  const top = pots[pots.length - 1]
  if (top && top.eligible.length === 1) {
    const level = levels[levels.length - 1]!
    const contributorsAtTop = contributors.filter((p) => p.committed >= level)
    if (contributorsAtTop.length === 1) {
      // 整层只由一名玩家投入：这就是未被跟注的部分。
      const seat = contributorsAtTop[0]!.seat
      returned.push({ seat, amount: top.amount })
      pots.pop()
    }
  }
  return { pots, returned }
}

export interface PotAward {
  amount: number
  eligible: number[]
  winners: number[]
}

export interface Distribution {
  awards: Map<number, number>
  pots: PotAward[]
}

/**
 * 逐池分配。`scores` 为 seat → 牌力分；奇数筹码按「按钮左手第一个赢家」起逐个 +1。
 */
export function distributePots(
  pots: readonly Pot[],
  scores: ReadonlyMap<number, number>,
  button: number,
  seatCount = 6,
): Distribution {
  const awards = new Map<number, number>()
  const results: PotAward[] = []
  for (const pot of pots) {
    const eligible = pot.eligible.filter((seat) => scores.has(seat))
    if (eligible.length === 0) {
      results.push({ amount: pot.amount, eligible: pot.eligible, winners: [] })
      continue
    }
    let best = -Infinity
    for (const seat of eligible) best = Math.max(best, scores.get(seat) ?? -1)
    const winners = eligible.filter((seat) => (scores.get(seat) ?? -1) === best)
    const share = Math.floor(pot.amount / winners.length)
    let remainder = pot.amount - share * winners.length
    const ordered = [...winners].sort(
      (a, b) => clockwiseDistance(button, a, seatCount) - clockwiseDistance(button, b, seatCount),
    )
    for (const seat of winners) addAward(awards, seat, share)
    for (const seat of ordered) {
      if (remainder <= 0) break
      addAward(awards, seat, 1)
      remainder -= 1
    }
    results.push({ amount: pot.amount, eligible, winners })
  }
  return { awards, pots: results }
}

function addAward(awards: Map<number, number>, seat: number, amount: number): void {
  awards.set(seat, (awards.get(seat) ?? 0) + amount)
}

/** 从 button 顺时针数到 seat 的步数（1 表示紧邻左手）。 */
export function clockwiseDistance(button: number, seat: number, seatCount = 6): number {
  return (seat - button - 1 + seatCount * 2) % seatCount
}

export function potTotal(pots: readonly Pot[]): number {
  return pots.reduce((sum, pot) => sum + pot.amount, 0)
}
