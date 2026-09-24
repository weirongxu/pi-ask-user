import { describe, expect, it } from 'vitest'

import { type TabStripItem, Tabs } from './tabs.js'
import { createStubTheme } from './test-theme.js'

const stripAnsi = (text: string): string =>
  text.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '')

const ESC = String.fromCharCode(27)
const ANSI_ESCAPE = new RegExp(`${ESC}\\[[0-9;]*m`, 'g')

const item = (name: string, answered = false): TabStripItem => ({
  name,
  answered,
})

const render = (
  items: readonly TabStripItem[],
  currentIndex: number,
  width: number,
): string[] =>
  new Tabs({
    items,
    currentIndex,
    width,
    theme: createStubTheme(),
  }).render()

const renderPlain = (
  items: readonly TabStripItem[],
  currentIndex: number,
  width: number,
): string => stripAnsi(render(items, currentIndex, width)[0] ?? '')

describe('Tabs', () => {
  const SELECTED_BG = '48;2;' // truecolor background of the dark theme's selectedBg

  it('renders nothing for a single question', () => {
    expect(render([item('Only')], 0, 80)).toEqual([])
  })

  it('highlights only the current tab with selectedBg', () => {
    const line = render([item('A'), item('B'), item('C')], 0, 80)[0] ?? ''
    // The current tab prefix '[□ A] [1/3]' is wrapped in a bg span; the rest is plain.
    const open = line.indexOf(`${ESC}[${SELECTED_BG}`)
    expect(open).toBe(0)
    const close = line.indexOf(`${ESC}[49m`, open)
    expect(close).toBeGreaterThan(0)
    expect(stripAnsi(line.slice(open, close))).toBe('[□ A] [1/3]')
    expect(stripAnsi(line)).toBe('[□ A] [1/3] [□ B] [□ C]→')
    // Only one styled span on the line.
    expect(line.split(`${ESC}[${SELECTED_BG}`).length - 1).toBe(1)
  })

  it('highlights only the current tab when left neighbors precede it', () => {
    const line = render([item('A'), item('B'), item('C')], 1, 80)[0] ?? ''
    expect(stripAnsi(line)).toBe('←[□ A] [□ B] [2/3] [□ C]→')
    // The bg span wraps exactly '[□ B] [2/3]', after the plain left neighbor.
    const open = line.indexOf(`${ESC}[${SELECTED_BG}`)
    const close = line.indexOf(`${ESC}[49m`, open)
    expect(open).toBeGreaterThan(0)
    expect(stripAnsi(line.slice(0, open))).toBe('←[□ A] ')
    expect(stripAnsi(line.slice(open, close))).toBe('[□ B] [2/3]')
    expect(stripAnsi(line.slice(close))).toBe(' [□ C]→')
    expect(line.split(`${ESC}[${SELECTED_BG}`).length - 1).toBe(1)
  })

  it('keeps the current tab fully visible and highlighted when cut from the left', () => {
    // Width 30: the left neighbor overflows the budget, so the line is cut
    // from the left; the current tab '[□ Cur] [3/3]' survives at the line
    // end and the bg span wraps exactly it (head and tail are plain).
    const items = [item('VeryLongLeftNeighbor'), item('Mid'), item('Cur')]
    const line = render(items, 2, 30)[0] ?? ''
    expect(stripAnsi(line)).toBe('←ighbor] [□ Mid] [□ Cur] [3/3]')
    const open = line.indexOf(`${ESC}[${SELECTED_BG}`)
    const close = line.indexOf(`${ESC}[49m`, open)
    expect(open).toBeGreaterThan(0)
    expect(close).toBeGreaterThan(open)
    expect(stripAnsi(line.slice(0, open))).toBe('←ighbor] [□ Mid] ')
    expect(stripAnsi(line.slice(open, close))).toBe('[□ Cur] [3/3]')
    expect(stripAnsi(line.slice(close))).toBe('')
    expect(line.split(`${ESC}[${SELECTED_BG}`).length - 1).toBe(1)
  })

  it('keeps the current tab intact when a wide left neighbor overflows', () => {
    // Width 24: the left neighbor overflows, so the line is cut from the
    // left and the current tab '[□ B] [2/3]' remains fully visible; the
    // bg span wraps it exactly.
    const line =
      render([item('AAAAAAAAAA'), item('B'), item('C')], 1, 24)[0] ?? ''
    const plain = stripAnsi(line)
    const open = line.indexOf(`${ESC}[${SELECTED_BG}`)
    const close = line.indexOf(`${ESC}[49m`, open)
    expect(open).toBeGreaterThan(0)
    expect(close).toBeGreaterThan(open)
    expect(plain).toBe('←AAA] [□ B] [2/3] [□ C]→')
    expect(stripAnsi(line.slice(open, close))).toBe('[□ B] [2/3]')
    expect(stripAnsi(line.slice(0, open))).toBe('←AAA] ')
    expect(stripAnsi(line.slice(close))).toBe(' [□ C]→')
    expect(line.split(`${ESC}[${SELECTED_BG}`).length - 1).toBe(1)
  })

  it('keeps ANSI spans well-formed with wide (CJK) tab names', () => {
    const line =
      render([item('中文标签'), item('当前标签页'), item('其他')], 1, 18)[0] ??
      ''
    const stripped = line.replace(ANSI_ESCAPE, '')
    expect(stripped).not.toContain(ESC)
    // Truncation lands inside the wide-char prefix without splitting a character.
    expect(stripAnsi(line).startsWith('←[□ 当前标')).toBe(true)
    // Prefix ends inside the styled span and closes cleanly.
    expect(line).toContain(`${ESC}[${SELECTED_BG}`)
    expect(line).toContain(`${ESC}[49m`)
  })

  it('does not crash at very narrow widths', () => {
    expect(() => render([item('A'), item('B'), item('C')], 1, 1)).not.toThrow()
    expect(() => render([item('A'), item('B'), item('C')], 1, 0)).not.toThrow()
  })

  it('renders all neighbors with arrows on both sides when everything fits', () => {
    expect(renderPlain([item('A'), item('B'), item('C')], 1, 80)).toBe(
      '←[□ A] [□ B] [2/3] [□ C]→',
    )
  })

  it('always prepends a left arrow when not on the first tab', () => {
    const items = [item('A'), item('B'), item('C'), item('D')]
    expect(renderPlain(items, 3, 60)).toBe('←[□ A] [□ B] [□ C] [□ D] [4/4]')
  })

  it('appends a right arrow when tabs are hidden on the right', () => {
    const items = [item('Long-A'), item('Long-B'), item('Long-C')]
    expect(renderPlain(items, 0, 80)).toBe(
      '[□ Long-A] [1/3] [□ Long-B] [□ Long-C]→',
    )
  })

  it('stops adding neighbors once the budget is exhausted', () => {
    // Width 20 (19 after the right arrow is reserved): the current tab
    // '[□ AAA] [1/3]' plus the right neighbor exactly fills the budget,
    // so 'add()' reports failure and the loop breaks before offset 2.
    const items = [item('AAA'), item('B'), item('CCC')]
    expect(renderPlain(items, 0, 20)).toBe('[□ AAA] [1/3] [□ B]→')
  })

  it('truncates the line on the left when a wide neighbor overflows', () => {
    // New semantics: overflow on the left cuts from the left (instead of
    // clipping the right), so the current tab stays fully visible at the
    // end of the line and only a fragment of the left neighbor remains.
    const items = [item('VeryLongLeftNeighbor'), item('Mid'), item('Cur')]
    expect(renderPlain(items, 2, 30)).toBe('←ighbor] [□ Mid] [□ Cur] [3/3]')
  })

  it('never emits a partial ANSI escape or bleeds bg into arrows', () => {
    const lines: string[] = []
    for (let width = 10; width <= 60; width++) {
      const rendered = render(
        [item('left-long'), item('current-tab'), item('right-long')],
        1,
        width,
      )
      if (rendered[0] !== undefined) lines.push(rendered[0])
    }
    for (const line of lines) {
      // Strip only well-formed escapes; anything left containing ESC means a
      // sequence was cut in half.
      const stripped = line.replace(ANSI_ESCAPE, '')
      expect(stripped).not.toContain(ESC)
      // Arrows never sit inside the styled span: walk the line segment by
      // segment, tracking whether a bg span is open, and require every '→'
      // to appear in a plain (unstyled) segment.
      expect(line.endsWith('→') || line.startsWith('←')).toBe(true)
      let inStyled = false
      for (const part of line.split(new RegExp(`(${ESC}\\[[0-9;]*m)`))) {
        if (part.startsWith(ESC)) {
          const code = part.slice(2, -1)
          if (code === '0' || code === '49') inStyled = false
          else if (code.includes('48;2')) inStyled = true
        } else if (part.includes('→') || part.includes('←')) {
          expect(inStyled).toBe(false)
        }
      }
    }
  })

  it('never emits a partial ANSI escape on the left-cut path', () => {
    const lines: string[] = []
    for (let width = 10; width <= 60; width++) {
      const rendered = render(
        [item('A'), item('B'), item('C'), item('D'), item('E')],
        4,
        width,
      )
      if (rendered[0] !== undefined) lines.push(rendered[0])
    }
    for (const line of lines) {
      const stripped = line.replace(ANSI_ESCAPE, '')
      expect(stripped).not.toContain(ESC)
      expect(line.split(`${ESC}[${SELECTED_BG}`).length - 1).toBeLessThan(2)
      expect(line).toContain(`${ESC}[49m`)
    }
  })

  it('inserts the overflowing left neighbor after the right neighbor', () => {
    // Width 25: the right neighbor fits but the left one overflows; the
    // line is cut from the left, leaving only a fragment of LLL while RRR
    // stays fully visible — pinning right-then-left insertion order.
    const line = renderPlain([item('LLL'), item('Cur'), item('RRR')], 1, 25)
    expect(line).toBe('←] [□ Cur] [2/3] [□ RRR]→')
  })

  it('highlights exactly the current tab when many left tabs are cut away', () => {
    // Regression for left-cut highlighting: 6 tabs, current last, width 30.
    // The line is cut from the left and the bg span wraps exactly
    // '[□ F] [6/6]' at the line end.
    const items = [
      item('A'),
      item('B'),
      item('C'),
      item('D'),
      item('E'),
      item('F'),
    ]
    const line = render(items, 5, 30)[0] ?? ''
    const plain = stripAnsi(line)
    expect(plain).toBe('←[□ C] [□ D] [□ E] [□ F] [6/6]')
    expect(plain.startsWith('←')).toBe(true)
    const open = line.indexOf(`${ESC}[${SELECTED_BG}`)
    const close = line.indexOf(`${ESC}[49m`, open)
    expect(open).toBeGreaterThan(0)
    expect(close).toBeGreaterThan(open)
    expect(stripAnsi(line.slice(open, close))).toBe('[□ F] [6/6]')
    expect(line.split(`${ESC}[${SELECTED_BG}`).length - 1).toBe(1)
  })

  it('keeps a well-formed span when the current tab itself is cut', () => {
    // Pathological: the current tab exhausts the budget, so even the
    // current label is truncated; only the visible remainder is wrapped
    // and the end>start guard plus clamping keep the ANSI well-formed.
    const line =
      render([item('VeryLongLeftNeighbor'), item('Cur')], 1, 12)[0] ?? ''
    const plain = stripAnsi(line)
    expect(plain).toBe('←[□ Cur] [2/')
    const open = line.indexOf(`${ESC}[${SELECTED_BG}`)
    const close = line.indexOf(`${ESC}[49m`, open)
    expect(open).toBe(1)
    expect(close).toBeGreaterThan(open)
    expect(stripAnsi(line.slice(open, close))).toBe('[□ Cur] [2/')
    expect(line.replace(ANSI_ESCAPE, '')).not.toContain(ESC)
    expect(line.split(`${ESC}[${SELECTED_BG}`).length - 1).toBe(1)
  })

  it('never splits a wide char when cutting from the left', () => {
    // CJK left cut: the line keeps whole wide characters only, the current
    // tab stays fully visible, and no raw ESC survives stripping.
    const line =
      render(
        [item('中文标签甲'), item('中文标签乙'), item('当前标签页')],
        2,
        24,
      )[0] ?? ''
    const stripped = line.replace(ANSI_ESCAPE, '')
    expect(stripped).not.toContain(ESC)
    // truncateText({ direction: 'start' }) drops whole characters from the
    // head and keeps the tail intact, so the closing `]` of the cut label is
    // preserved rather than replaced by a space (it never splits a wide char,
    // which may overflow the target width by up to one narrow char).
    expect(stripAnsi(line)).toBe('←乙] [□ 当前标签页] [3/3]')
    const open = line.indexOf(`${ESC}[${SELECTED_BG}`)
    const close = line.indexOf(`${ESC}[49m`, open)
    expect(open).toBeGreaterThan(0)
    expect(stripAnsi(line.slice(open, close))).toBe('[□ 当前标签页] [3/3]')
    expect(line.split(`${ESC}[${SELECTED_BG}`).length - 1).toBe(1)
  })

  it('marks answered tabs with ■ and unanswered with □', () => {
    expect(
      renderPlain([item('A', true), item('B'), item('C', true)], 1, 80),
    ).toBe('←[■ A] [□ B] [2/3] [■ C]→')
  })
})
