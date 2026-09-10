import { describe, expect, it } from 'vitest'

import { parseParams } from './schema.js'

describe('parseParams', () => {
  it('normalizes multi-line option labels into single-line text', () => {
    const result = parseParams({
      questions: [
        {
          question: 'q',
          tabName: 't',
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
