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

  it('rejects invalid params', () => {
    expect(parseParams({ questions: 'nope' }).ok).toBe(false)
  })
})

describe('buildAnswer', () => {
  it('uses customText as label when the last option is selected', () => {
    const answer = buildAnswer(
      [
        { check: false, label: 'a', isOther: false },
        { check: true, label: 'Other:', isOther: true, note: 'hi' },
      ],
      'my own words',
    )
    expect(answer.customText).toBe('my own words')
    expect(answer.selected).toEqual([
      { index: 1, label: 'my own words', note: 'hi' },
    ])
  })

  it('keeps Other label when customText is undefined', () => {
    const answer = buildAnswer(
      [{ check: true, label: 'Other:', isOther: true }],
      undefined,
    )
    expect(answer.selected).toEqual([{ index: 0, label: 'Other:' }])
  })
})
