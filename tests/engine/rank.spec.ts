import { describe, expect, it } from 'vitest'
import {
  CAT_FLUSH,
  CAT_FULL_HOUSE,
  CAT_HIGH_CARD,
  CAT_PAIR,
  CAT_QUADS,
  CAT_STRAIGHT,
  CAT_STRAIGHT_FLUSH,
  CAT_TRIPS,
  CAT_TWO_PAIR,
  compareHandValues,
  describeHand,
  evaluate5,
  evaluateBest,
} from '../../src/engine/rank.ts'
import { asCard } from '../../src/engine/cards.ts'

const cards = (...values: string[]) => values.map(asCard)

describe('evaluate5', () => {
  it('识别高牌并按踢脚排序', () => {
    const value = evaluate5(cards('As', 'Kd', '9h', '5c', '3s'))
    expect(value.cat).toBe(CAT_HIGH_CARD)
    expect(value.kickers.slice(0, 3)).toEqual([14, 13, 9])
  })

  it('识别一对', () => {
    const value = evaluate5(cards('As', 'Ad', '9h', '5c', '3s'))
    expect(value.cat).toBe(CAT_PAIR)
    expect(value.kickers[0]).toBe(14)
  })

  it('识别两对', () => {
    const value = evaluate5(cards('As', 'Ad', 'Kh', 'Kc', '3s'))
    expect(value.cat).toBe(CAT_TWO_PAIR)
    expect(value.kickers.slice(0, 2)).toEqual([14, 13])
  })

  it('识别三条', () => {
    const value = evaluate5(cards('As', 'Ad', 'Ah', 'Kc', '3s'))
    expect(value.cat).toBe(CAT_TRIPS)
  })

  it('识别顺子与轮子', () => {
    expect(evaluate5(cards('9s', 'Td', 'Jh', 'Qc', 'Ks')).cat).toBe(CAT_STRAIGHT)
    const wheel = evaluate5(cards('As', '2d', '3h', '4c', '5s'))
    expect(wheel.cat).toBe(CAT_STRAIGHT)
    expect(wheel.kickers[0]).toBe(5)
  })

  it('识别同花', () => {
    const value = evaluate5(cards('As', 'Ks', '9s', '5s', '3s'))
    expect(value.cat).toBe(CAT_FLUSH)
  })

  it('识别葫芦、四条、同花顺与皇家同花顺', () => {
    expect(evaluate5(cards('As', 'Ad', 'Ah', 'Kc', 'Ks')).cat).toBe(CAT_FULL_HOUSE)
    expect(evaluate5(cards('As', 'Ad', 'Ah', 'Ac', 'Ks')).cat).toBe(CAT_QUADS)
    expect(evaluate5(cards('9s', 'Ts', 'Js', 'Qs', 'Ks')).cat).toBe(CAT_STRAIGHT_FLUSH)
    const royal = evaluate5(cards('As', 'Ts', 'Js', 'Qs', 'Ks'))
    expect(describeHand(royal)).toBe('皇家同花顺')
  })
})

describe('evaluateBest', () => {
  it('七张里选出最好的五张', () => {
    const value = evaluateBest(cards('As', 'Ad', 'Ah', 'Kc', 'Ks', '2d', '3h'))
    expect(value.cat).toBe(CAT_FULL_HOUSE)
  })

  it('不足五张返回无效值', () => {
    expect(evaluateBest(cards('As', 'Kd')).cat).toBe(-1)
  })
})

describe('compareHandValues', () => {
  it('同分平手', () => {
    const a = evaluate5(cards('As', 'Kd', '9h', '5c', '3s'))
    const b = evaluate5(cards('Ah', 'Kc', '9d', '5s', '3c'))
    expect(compareHandValues(a, b)).toBe(0)
  })

  it('踢脚决定胜负', () => {
    const a = evaluate5(cards('As', 'Ad', '9h', '5c', '3s'))
    const b = evaluate5(cards('Ah', 'Ac', '9d', '5s', '2c'))
    expect(compareHandValues(a, b)).toBeGreaterThan(0)
  })
})
