import { describe, expect, it } from 'vitest'

import { Pane } from './pane.js'
import { createStubTheme } from './test-theme.js'

const stripAnsi = (text: string): string =>
  text.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '')

const makeBody = (total: number) =>
  Array.from({ length: total }, (_, i) => `line-${i}`)

const makePane = (opts: {
  title?: (width: number) => string[]
  footer?: (width: number) => string[]
  body: (width: number, usedHeight: number) => string[]
}) =>
  new Pane({
    theme: createStubTheme(),
    title: opts.title ?? (() => ['title']),
    footer: opts.footer ?? (() => ['F1', 'F2']),
    body: opts.body,
  })

describe('Pane', () => {
  it('renders [title..., rule, body..., footer...]', () => {
    const pane = makePane({ body: () => [] })
    // budget = 12 - 1 title - 1 rule - 2 footer = 8
    const lines = pane.render(20, 12)
    expect(lines).toHaveLength(1 + 1 + 0 + 2)
    expect(stripAnsi(lines[0] ?? '')).toBe('title')
    expect(stripAnsi(lines[1] ?? '')).toBe('─'.repeat(20))
    expect(lines.slice(-2)).toEqual(['F1', 'F2'])
  })

  it('includes the body lines between the rule and the footer', () => {
    const pane = makePane({ body: () => makeBody(3) })
    const lines = pane.render(20, 12)
    expect(lines.slice(2, 5)).toEqual(makeBody(3))
    expect(lines).toHaveLength(1 + 1 + 3 + 2)
  })

  it('passes width and the measured body height to the body callback', () => {
    const pane = makePane({
      body: (width, usedHeight) => {
        expect(width).toBe(20)
        expect(usedHeight).toBe(8)
        return makeBody(usedHeight)
      },
    })
    // budget = 12 - 1 title - 1 rule - 2 footer = 8
    const lines = pane.render(20, 12)
    expect(lines.slice(2, 10)).toEqual(makeBody(8))
    expect(lines.slice(-2)).toEqual(['F1', 'F2'])
  })

  it('renders no rule when the title callback returns an empty array', () => {
    const pane = makePane({
      title: () => [],
      footer: () => ['F1'],
      body: (_width, usedHeight) => makeBody(usedHeight),
    })
    const lines = pane.render(20, 12)
    expect(lines).toEqual([...makeBody(11), 'F1'])
    expect(lines.some((line) => stripAnsi(line) === '─'.repeat(20))).toBe(false)
  })

  it('clamps bodyHeight to a minimum of 1 with a rule', () => {
    const pane = makePane({
      body: (_width, usedHeight) => [`body-${usedHeight}`],
    })
    const lines = pane.render(20, 2)
    expect(lines).toHaveLength(5)
    expect(stripAnsi(lines[0] ?? '')).toBe('title')
    expect(stripAnsi(lines[1] ?? '')).toBe('─'.repeat(20))
    expect(lines[2]).toBe('body-1')
    expect(lines.slice(-2)).toEqual(['F1', 'F2'])
  })

  it('clamps bodyHeight to a minimum of 1 without a rule', () => {
    const pane = makePane({
      title: () => [],
      footer: () => ['F1'],
      body: (_width, usedHeight) => [`body-${usedHeight}`],
    })
    expect(pane.render(20, 1)).toEqual(['body-1', 'F1'])
  })

  it('invokes each callback once per render with the expected usedHeight', () => {
    let titleCount = 0
    let footerCount = 0
    let bodyCount = 0
    const pane = makePane({
      title: () => {
        titleCount += 1
        return ['title']
      },
      footer: () => {
        footerCount += 1
        return ['F1']
      },
      body: (_width, usedHeight) => {
        bodyCount += 1
        expect(usedHeight).toBe(7)
        return makeBody(usedHeight)
      },
    })
    // budget = 10 - 1 title - 1 rule - 1 footer = 7
    const lines = pane.render(20, 10)
    expect(lines).toHaveLength(1 + 1 + 7 + 1)
    expect(titleCount).toBe(1)
    expect(footerCount).toBe(1)
    expect(bodyCount).toBe(1)
  })
})
