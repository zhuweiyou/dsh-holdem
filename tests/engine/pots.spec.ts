import { describe, expect, it } from 'vitest'
import { buildPots, clockwiseDistance, distributePots, potTotal } from '../../src/engine/pots.ts'

describe('buildPots', () => {
  it('按投入分层构造主池与边池', () => {
    const built = buildPots([
      { seat: 0, committed: 100, folded: false },
      { seat: 1, committed: 300, folded: false },
      { seat: 2, committed: 300, folded: true },
    ])
    expect(built.pots).toEqual([
      { amount: 300, eligible: [0, 1] },
      { amount: 400, eligible: [1] },
    ])
    expect(potTotal(built.pots)).toBe(700)
    expect(built.returned).toEqual([])
  })

  it('未被跟注的部分退回', () => {
    const built = buildPots([
      { seat: 0, committed: 500, folded: false },
      { seat: 1, committed: 200, folded: false },
    ])
    expect(potTotal(built.pots)).toBe(400)
    expect(built.returned).toEqual([{ seat: 0, amount: 300 }])
  })

  it('弃牌者出钱但无资格', () => {
    const built = buildPots([
      { seat: 0, committed: 50, folded: false },
      { seat: 1, committed: 50, folded: false },
      { seat: 2, committed: 50, folded: true },
    ])
    expect(built.pots).toEqual([{ amount: 150, eligible: [0, 1] }])
  })

  it('金额守恒：池 + 退回 = 总投入', () => {
    const built = buildPots([
      { seat: 0, committed: 40, folded: false },
      { seat: 1, committed: 160, folded: true },
      { seat: 2, committed: 400, folded: false },
    ])
    const returned = built.returned.reduce((sum, entry) => sum + entry.amount, 0)
    expect(potTotal(built.pots) + returned).toBe(600)
  })
})

describe('distributePots', () => {
  it('胜者拿走全部；平手均分', () => {
    const distribution = distributePots(
      [{ amount: 300, eligible: [0, 1] }],
      new Map([[0, 100], [1, 50]]),
      0,
    )
    expect(distribution.awards.get(0)).toBe(300)
    expect(distribution.awards.get(1)).toBeUndefined()
  })

  it('平手时奇数筹码给按钮左手第一个赢家', () => {
    const distribution = distributePots(
      [{ amount: 101, eligible: [0, 1, 2] }],
      new Map([[0, 100], [1, 100], [2, 100]]),
      2,
    )
    expect(distribution.awards.get(0)).toBe(34)
    expect(distribution.awards.get(1)).toBe(34)
    expect(distribution.awards.get(2)).toBe(33)
  })

  it('边池按各池资格分别判定', () => {
    const distribution = distributePots(
      [
        { amount: 300, eligible: [0, 1] },
        { amount: 400, eligible: [1] },
      ],
      new Map([[0, 900], [1, 500]]),
      0,
    )
    expect(distribution.awards.get(0)).toBe(300)
    expect(distribution.awards.get(1)).toBe(400)
  })
})

it('顺时针距离以按钮左手为 0', () => {
  expect(clockwiseDistance(0, 1, 6)).toBe(0)
  expect(clockwiseDistance(0, 0, 6)).toBe(5)
  expect(clockwiseDistance(3, 4, 6)).toBe(0)
})
