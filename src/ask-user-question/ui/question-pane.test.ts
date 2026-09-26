import {
  type Terminal,
  TuiMainScreen,
  visibleWidth,
} from '@earendil-works/pi-tui'
import { describe, expect, it } from 'vitest'

import type { QuestionParamsSchema } from '../schema.js'
import { type QuestionnaireState, createQuestionnaireState } from '../state.js'
import { QuestionPaneComponent } from './question-pane.js'
import { createStubTheme, stripAnsi } from './test-theme.js'

const stubTerminal = (): Terminal => ({
  start: () => {},
  stop: () => {},
  drainInput: async () => {},
  write: () => {},
  get columns() {
    return 80
  },
  get rows() {
    return 24
  },
  get kittyProtocolActive() {
    return false
  },
  moveBy: () => {},
  hideCursor: () => {},
  showCursor: () => {},
  clearLine: () => {},
  clearFromCursor: () => {},
  clearScreen: () => {},
  setTitle: () => {},
  setProgress: () => {},
})

// Two questions -> pinned title is the 2-line tab block + rule; state
// auto-appends an "Other:" option to each question.
const makeParams = (): QuestionParamsSchema => ({
  questions: [
    {
      question: 'Pick one',
      header: 'Tab A',
      options: Array.from({ length: 5 }, (_, i) => ({
        label: `Option ${i + 1}`,
      })),
    },
    {
      question: 'Pick another',
      header: 'Tab B',
      options: [{ label: 'A' }, { label: 'B' }],
    },
  ],
})

const makePane = (): {
  pane: QuestionPaneComponent
  state: QuestionnaireState
} => {
  const params = makeParams()
  const theme = createStubTheme()
  const state = createQuestionnaireState({
    params,
    theme,
    tui: new TuiMainScreen(stubTerminal()),
    done: () => {},
  })
  return {
    pane: new QuestionPaneComponent({ state, params, theme, subagent: false }),
    state,
  }
}

// render(120, 12): title is 1 tab line + 1 Pane-drawn rule, footer 3 -> scroll
// viewport = 12 - 1 - 1 - 3 = 7 while the body has 9 lines, so the body
// scrolls (maxOffset = 2).
const TITLE_LINES = 1
const RULE_LINES = 1
const FOOTER_LINES = 3
const PINNED_LINES = TITLE_LINES + RULE_LINES

describe('QuestionPaneComponent', () => {
  it('pins the tabs and rule while the body scrolls to the focused option', () => {
    const { pane, state } = makePane()
    const first = pane.render(120, 12)

    state.cursor.optionIndex = 4
    const scrolled = pane.render(120, 12)
    expect(scrolled).toHaveLength(first.length)
    expect(scrolled.slice(0, PINNED_LINES)).toEqual(
      first.slice(0, PINNED_LINES),
    )
    expect(scrolled.slice(-FOOTER_LINES)).toEqual(first.slice(-FOOTER_LINES))
    expect(scrolled.slice(PINNED_LINES)).not.toEqual(first.slice(PINNED_LINES))
    const focused = scrolled.findIndex(
      (line) => stripAnsi(line).includes('❯') && line.includes('Option 5'),
    )
    expect(focused).toBeGreaterThanOrEqual(PINNED_LINES)
  })

  it('prefixes every option row with the fixed 4-column pointer/glyph prefix', () => {
    const { pane } = makePane()
    const rendered = pane.render(120, 12)

    const optionRows = rendered.filter((line) =>
      /Option [12]/.test(stripAnsi(line)),
    )
    expect(optionRows.length).toBeGreaterThan(0)
    for (const line of optionRows) {
      // pointer (2 cols: "❯ " focused, "  " otherwise) + glyph (1 col) + space
      expect(stripAnsi(line)).toMatch(/^(?:❯ | {2})[■□●○] /)
    }
    // Exactly one focused row carries the pointer.
    expect(
      optionRows.filter((line) => stripAnsi(line).startsWith('❯')),
    ).toHaveLength(1)
  })

  it('renders the scrolled body within the pane width with a bar column', () => {
    const { pane, state } = makePane()
    pane.render(120, 12)

    state.cursor.optionIndex = 4
    const scrolled = pane.render(120, 12)
    const body = scrolled.slice(PINNED_LINES, -FOOTER_LINES)
    // Scrollable body: height is constant (= viewport budget) and every
    // visible line is padded to full width with the bar at the last column.
    expect(body).toHaveLength(12 - PINNED_LINES - FOOTER_LINES)
    for (const line of body) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(120)
      const plain = stripAnsi(line)
      expect(plain.endsWith('▐') || plain.endsWith('░')).toBe(true)
    }
    // The focused option is inside the visible window.
    expect(
      body.some(
        (line) => stripAnsi(line).includes('❯') && line.includes('Option 5'),
      ),
    ).toBe(true)
  })
})
