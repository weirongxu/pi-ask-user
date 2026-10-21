import { describe, expect, it } from 'vitest'

import { buildAnswer, parseParams } from './schema.js'

describe('parseParams', () => {
  it('normalizes multi-line option labels into single-line text', () => {
    const result = parseParams({
      questions: [
        {
          question: 'q',
          header: 't',
          options: [{ label: 'line1\nline2' }, { label: 'a\r\nb\rc  ' }],
        },
      ],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const [a, b] = result.value.questions[0]?.options ?? []
    expect(a?.label).toBe('line1 line2')
    expect(b?.label).toBe('a b c')
  })

  it('collapses stray carriage returns into spaces across text fields', () => {
    const result = parseParams({
      questions: [
        {
          question: '实现\r？',
          header: '方案\r确认',
          options: [
            {
              label: '按这个做\r',
              description: '两份\r README',
              preview: 'a\r\nb\rc 两份\rREADME',
            },
            { label: 'other' },
          ],
        },
      ],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const q = result.value.questions[0]
    expect(q?.question).toBe('实现 ？')
    expect(q?.header).toBe('方案 确认')
    const [a] = q?.options ?? []
    expect(a?.label).toBe('按这个做')
    expect(a?.description).toBe('两份 README')
    expect(a?.preview).toBe('a\nb c 两份 README')
  })

  it('rejects invalid params', () => {
    expect(parseParams({ questions: 'nope' }).ok).toBe(false)
  })
})

describe('buildAnswer', () => {
  it('stores user text in otherCustomText and marks Other checked', () => {
    const answer = buildAnswer(
      [
        { check: false, isOther: false },
        { check: true, isOther: true, note: 'hi' },
      ],
      'my own words',
    )
    expect(answer.otherCustomText).toBe('my own words')
    expect(answer.selected).toEqual([{ checked: false }, { checked: true }])
  })

  it('keeps Other label when otherCustomText is undefined', () => {
    const answer = buildAnswer([{ check: true, isOther: true }], undefined)
    expect(answer.selected).toEqual([{ checked: true }])
  })
})
