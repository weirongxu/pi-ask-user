import { describe, expect, it } from 'vitest'

import type { FocusRange } from './scroll.js'
import { ScrollView } from './scroll.js'
import { createStubTheme, stripAnsi } from './test-theme.js'

const THUMB = '▐'
const TRACK = '░'

const at = (lines: string[], index: number): string => lines[index] ?? ''

const makeLines = (total: number): string[] =>
  Array.from({ length: total }, (_, i) => `line-${i}`)

const makeView = (): ScrollView => new ScrollView({ theme: createStubTheme() })

const makeBuild = (total: number) => (): { lines: string[] } => ({
  lines: makeLines(total),
})

describe('ScrollView', () => {
  it('returns all lines without bar when content fits the viewport', () => {
    const view = makeView()
    const lines = view.render(20, 10, makeBuild(3))
    expect(lines).toEqual(['line-0', 'line-1', 'line-2'])
    expect(view.metrics).toEqual({ total: 3, offset: 0, maxOffset: 0 })
  })

  it('decorates the window slice by offset across the full line array', () => {
    const lines = makeLines(10)
    const view = makeView()
    view.render(10, 6, () => ({ lines }))
    view.scrollBy(100)
    const rendered = view.render(10, 6, () => ({ lines }))
    expect(rendered).toHaveLength(6)
    expect(stripAnsi(at(rendered, 0))).toBe(`line-4   ${TRACK}`)
    expect(stripAnsi(at(rendered, 5))).toBe(`line-9   ${THUMB}`)
    expect(view.metrics.maxOffset).toBe(4)
    expect(view.metrics.offset).toBe(4)
  })

  it('keeps the thumb within bounds at both scroll extremes', () => {
    const view = makeView()
    const first = view.render(10, 5, makeBuild(12))
    expect(stripAnsi(at(first, 0)).endsWith(THUMB)).toBe(true)
    expect(stripAnsi(at(first, 2)).endsWith(TRACK)).toBe(true)

    view.scrollBy(100)
    const last = view.render(10, 5, makeBuild(12))
    expect(last).toHaveLength(5)
    expect(stripAnsi(at(last, 0)).endsWith(TRACK)).toBe(true)
    expect(stripAnsi(at(last, 4)).endsWith(THUMB)).toBe(true)
  })

  it('scrolls down to reveal a focused range below the viewport', () => {
    const ranges: FocusRange[] = [
      { start: 0, end: 2 },
      { start: 5, end: 9 },
    ]
    const view = makeView()
    view.setFocusIndex(1)
    const lines = view.render(10, 5, () => ({
      lines: makeLines(12),
      focusRanges: ranges,
    }))
    expect(view.metrics.offset).toBe(4)
    expect(lines).toHaveLength(5)
    expect(stripAnsi(at(lines, 0))).toBe(`line-4   ${TRACK}`)
  })

  it('scrolls up to reveal a focused range above the viewport', () => {
    const ranges: FocusRange[] = [
      { start: 0, end: 3 },
      { start: 8, end: 10 },
    ]
    const view = makeView()
    view.render(10, 5, () => ({ lines: makeLines(12), focusRanges: ranges }))
    view.scrollBy(8)
    view.render(10, 5, () => ({ lines: makeLines(12), focusRanges: ranges }))
    expect(view.metrics.offset).toBe(7)
    view.setFocusIndex(0)
    view.render(10, 5, () => ({ lines: makeLines(12), focusRanges: ranges }))
    expect(view.metrics.offset).toBe(0)
  })

  it('leaves the offset unchanged when the focused range is visible', () => {
    const ranges: FocusRange[] = [{ start: 2, end: 4 }]
    const view = makeView()
    view.render(10, 5, () => ({ lines: makeLines(12), focusRanges: ranges }))
    view.scrollBy(1)
    view.render(10, 5, () => ({ lines: makeLines(12), focusRanges: ranges }))
    expect(view.metrics.offset).toBe(1)
    view.setFocusIndex(0)
    view.render(10, 5, () => ({ lines: makeLines(12), focusRanges: ranges }))
    expect(view.metrics.offset).toBe(1)
  })

  it('ignores focus when the index has no matching range', () => {
    const view = makeView()
    view.setFocusIndex(5)
    const lines = view.render(10, 5, () => ({
      lines: makeLines(12),
      focusRanges: [{ start: 0, end: 1 }],
    }))
    expect(view.metrics.offset).toBe(0)
    expect(lines).toHaveLength(5)
  })

  it('clamps scrollBy and resets the offset', () => {
    const view = makeView()
    view.render(10, 5, makeBuild(12))
    view.scrollBy(100)
    view.render(10, 5, makeBuild(12))
    expect(view.metrics.offset).toBe(7)
    view.scrollBy(-100)
    view.render(10, 5, makeBuild(12))
    expect(view.metrics.offset).toBe(0)
    view.scrollBy(2)
    view.reset()
    view.render(10, 5, makeBuild(12))
    expect(view.metrics.offset).toBe(0)
    view.render(10, 5, makeBuild(12))
    expect(view.metrics.offset).toBe(0)
  })

  it('pads every visible line to the full content width including the bar column', () => {
    const view = makeView()
    const lines = view.render(10, 5, makeBuild(12))
    expect(lines).toHaveLength(5)
    for (const line of lines) {
      expect(stripAnsi(line)).toHaveLength(10)
      expect(
        stripAnsi(line).endsWith(THUMB) || stripAnsi(line).endsWith(TRACK),
      ).toBe(true)
    }
    expect(stripAnsi(lines[0] ?? '').startsWith('line-0')).toBe(true)
  })

  it('returns exactly the visible window lines when scrollable', () => {
    const view = makeView()
    const lines = view.render(10, 5, makeBuild(12))
    expect(lines).toHaveLength(5)
    for (const [i, line] of lines.entries()) {
      const plain = stripAnsi(line)
      expect(plain).toHaveLength(10)
      expect(plain.startsWith(`line-${i}`)).toBe(true)
      expect(plain.endsWith(THUMB) || plain.endsWith(TRACK)).toBe(true)
    }
  })

  it('pages by half the viewport with pageDown and pageUp', () => {
    const view = makeView()
    view.render(10, 6, makeBuild(12))
    view.pageDown()
    view.render(10, 6, makeBuild(12))
    expect(view.metrics.offset).toBe(3)
    view.pageUp()
    view.render(10, 6, makeBuild(12))
    expect(view.metrics.offset).toBe(0)
  })

  it('accepts the { lines, focusRanges } form and keeps focus scrolling', () => {
    const view = makeView()
    view.setFocusIndex(1)
    const lines = view.render(10, 5, () => ({
      lines: makeLines(12),
      focusRanges: [
        { start: 0, end: 2 },
        { start: 5, end: 9 },
      ],
    }))
    expect(view.metrics.offset).toBe(4)
    expect(stripAnsi(at(lines, 0))).toBe(`line-4   ${TRACK}`)
  })

  it('passes the reduced content width to the build callback', () => {
    const view = makeView()
    let seen: number | null = null
    view.render(10, 5, (cw) => {
      seen = cw
      return { lines: makeLines(3) }
    })
    expect(seen).toBe(9)
    view.render(1, 5, (cw) => {
      seen = cw
      return { lines: makeLines(3) }
    })
    expect(seen).toBe(1)
  })

  it('reports zero metrics before the first render', () => {
    const view = makeView()
    expect(view.metrics).toEqual({ total: 0, offset: 0, maxOffset: 0 })
  })
})

describe('ScrollView tall focus ranges', () => {
  it('clamps to the range start when the range is taller than the viewport', () => {
    const ranges: FocusRange[] = [{ start: 3, end: 12 }]
    const view = makeView()
    view.setFocusIndex(0)
    view.render(10, 5, () => ({ lines: makeLines(14), focusRanges: ranges }))
    // end - visible = 7 > start = 3; offset must stay at start, not oscillate.
    expect(view.metrics.offset).toBe(3)
    view.render(10, 5, () => ({ lines: makeLines(14), focusRanges: ranges }))
    expect(view.metrics.offset).toBe(3)
  })
})

describe('ScrollView edge cases', () => {
  it('ignores scrollBy before the first render', () => {
    const view = makeView()
    view.scrollBy(5)
    view.render(10, 5, makeBuild(12))
    expect(view.metrics.offset).toBe(0)
  })
})
