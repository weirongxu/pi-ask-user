import type { AgentToolResult } from '@earendil-works/pi-coding-agent'
import { describe, expect, it } from 'vitest'

import { AskCallComponent, AskResultComponent } from './chat-renderer.js'
import type { QuestionParamsSchema, Result } from './schema.js'
import { createAskUserTool, type AskDetails } from './tool.js'
import { createStubTheme, stripAnsi } from './ui/test-theme.js'

const theme = createStubTheme()

const question1 = {
  question: 'Pick one',
  header: 'Tab',
  options: [{ label: 'alpha', description: 'first option' }, { label: 'beta' }],
}

const question2 = {
  question: 'Pick many',
  header: 'Multi',
  options: [{ label: 'one' }, { label: 'two' }],
  multiSelect: true,
}

const params: QuestionParamsSchema = {
  questions: [question1, question2],
}

const answer: Result = {
  results: [
    {
      question: question1,
      answer: {
        customText: undefined,
        selected: [{ index: 0, label: 'alpha', note: 'my note' }],
      },
    },
    {
      question: question2,
      answer: {
        customText: 'freeform',
        selected: [{ index: 1, label: 'two' }],
      },
    },
  ],
  cancelled: false,
}

const okResult: AgentToolResult<AskDetails> = {
  content: [{ type: 'text', text: JSON.stringify(answer) }],
  details: { kind: 'ok', results: answer.results },
}

const cancelledResult: AgentToolResult<AskDetails> = {
  content: [{ type: 'text', text: 'User cancelled the questionnaire' }],
  details: { kind: 'cancelled' },
}

const errorResult: AgentToolResult<AskDetails> = {
  content: [{ type: 'text', text: 'Error: boom' }],
  details: { kind: 'error', message: 'Error: boom' },
}

// Simulates a result whose details were produced by a different tool version
// (a details object without a recognized `kind`); JSON.parse sidesteps the
// typed `details` field on purpose.
const foreignResult: AgentToolResult<AskDetails> = JSON.parse(
  JSON.stringify({
    content: [
      { type: 'text', text: 'legacy\nmulti line' },
      { type: 'text', text: 'second block' },
    ],
    details: {},
  }),
)

function render(comp: AskCallComponent | AskResultComponent): string {
  // The Text child pads lines to the full width; trim the padding.
  return comp
    .render(80)
    .map((line) => stripAnsi(line).trimEnd())
    .join('\n')
}

describe('AskCallComponent', () => {
  it('renders a collapsed count line', () => {
    const comp = new AskCallComponent({ args: params, expanded: false, theme })
    expect(render(comp)).toBe('ask_user_question 2 questions')
  })

  it('renders expanded question text and all option labels', () => {
    const comp = new AskCallComponent({ args: params, expanded: false, theme })
    comp.setExpanded(true)
    const out = render(comp)
    expect(out).toContain('Pick one')
    expect(out).toContain('Pick many')
    expect(out).toContain('alpha')
    expect(out).toContain('first option')
    expect(out).toContain('beta')
    expect(out).toContain('one')
    expect(out).toContain('two')
  })

  it('is idempotent when setExpanded(true) is called twice', () => {
    const comp = new AskCallComponent({ args: params, expanded: false, theme })
    comp.setExpanded(true)
    const first = render(comp)
    comp.setExpanded(true)
    expect(render(comp)).toBe(first)
  })

  it('collapses again after setExpanded(false)', () => {
    const comp = new AskCallComponent({ args: params, expanded: true, theme })
    comp.setExpanded(false)
    expect(render(comp)).toBe('ask_user_question 2 questions')
  })

  it('renders expanded when constructed with expanded: true', () => {
    const comp = new AskCallComponent({ args: params, expanded: true, theme })
    expect(render(comp)).toContain('alpha')
  })

  it('does not produce lines wider than the given width', () => {
    const comp = new AskCallComponent({ args: params, expanded: true, theme })
    for (const width of [20, 40, 120]) {
      for (const line of comp.render(width)) {
        expect(stripAnsi(line).length).toBeLessThanOrEqual(width)
      }
    }
  })
})

describe('AskResultComponent', () => {
  it('renders a collapsed single-line summary using the first question', () => {
    const comp = new AskResultComponent({
      result: okResult,
      expanded: false,
      theme,
    })
    const out = render(comp)
    expect(out).toContain('✓ Pick one: alpha')
    expect(out).toContain('(+1)')
    // Must not leak unselected option labels into the collapsed view.
    expect(out).not.toContain('beta')
    expect(out).not.toContain(' two')
    expect(out.split('\n')).toHaveLength(1)
  })

  it('renders expanded selections, note, and custom text', () => {
    const comp = new AskResultComponent({
      result: okResult,
      expanded: false,
      theme,
    })
    comp.setExpanded(true)
    const out = render(comp)
    expect(out).toContain('✓ alpha')
    expect(out).toContain('· beta')
    expect(out).toContain('— my note')
    expect(out).toContain('✎ freeform')
    expect(out).toContain('(wrote)')
  })

  it('does not duplicate custom text equal to a selected label', () => {
    const withOtherLabel: AgentToolResult<AskDetails> = {
      content: okResult.content,
      details: {
        kind: 'ok',
        results: [
          {
            question: question1,
            answer: {
              customText: 'alpha',
              selected: [{ index: 0, label: 'alpha' }],
            },
          },
        ],
      },
    }
    const comp = new AskResultComponent({
      result: withOtherLabel,
      expanded: true,
      theme,
    })
    const out = render(comp)
    expect(out).not.toContain('✎')
    expect(out.match(/alpha/g)).toHaveLength(1)
  })

  it('renders cancelled results as a single warning line', () => {
    const comp = new AskResultComponent({
      result: cancelledResult,
      expanded: true,
      theme,
    })
    expect(render(comp)).toBe('Cancelled')
  })

  it('renders error results as a warning message', () => {
    const comp = new AskResultComponent({
      result: errorResult,
      expanded: true,
      theme,
    })
    expect(render(comp)).toBe('Error: boom')
  })

  it('flattens each foreign details text block to its own warning line', () => {
    const comp = new AskResultComponent({
      result: foreignResult,
      expanded: false,
      theme,
    })
    expect(render(comp)).toBe('legacy multi line\nsecond block')
  })
})

describe('AskCallComponent width and args handling', () => {
  it('fully restores content after a width shrink then grow', () => {
    const comp = new AskCallComponent({ args: params, expanded: true, theme })
    const before = comp
      .render(80)
      .map((line) => stripAnsi(line).trimEnd())
      .join('\n')
    comp.render(10)
    const after = comp
      .render(80)
      .map((line) => stripAnsi(line).trimEnd())
      .join('\n')
    expect(after).toBe(before)
    expect(after).toContain('Pick one')
  })

  it('setArgs is idempotent for equal args and updates changed args', () => {
    const comp = new AskCallComponent({ args: params, expanded: false, theme })
    comp.setArgs(params)
    expect(render(comp)).toBe('ask_user_question 2 questions')
    const single: QuestionParamsSchema = { questions: [question1] }
    comp.setArgs(single)
    expect(render(comp)).toBe('ask_user_question 1 question')
  })

  it('renders expanded questions with empty option arrays without throwing', () => {
    const empty: QuestionParamsSchema = {
      questions: [
        { question: 'Nothing to pick', header: 'Empty', options: [] },
      ],
    }
    const comp = new AskCallComponent({ args: empty, expanded: true, theme })
    const out = render(comp)
    expect(out).toContain('Nothing to pick')
  })
})

describe('renderCall lastComponent reuse', () => {
  // JSON.parse keeps the test cast-free while standing in for the host-built
  // ToolRenderContext (only lastComponent/expanded matter here).
  const makeCtx = (
    lastComponent: Ctx['lastComponent'],
    expanded: boolean,
  ): Ctx => {
    // JSON.parse yields `any`, so this assignment needs no cast; the
    // component reference is kept as-is (not serialized).
    const ctx: Ctx = JSON.parse('{"args":{},"toolCallId":"call-1"}')
    ctx.lastComponent = lastComponent
    ctx.expanded = expanded
    return ctx
  }

  const tool = createAskUserTool(() => undefined)
  const { renderCall } = tool
  if (!renderCall) throw new Error('renderCall is not defined')
  type Ctx = Parameters<NonNullable<typeof tool.renderCall>>[2]

  it('returns the same component instance on the second render', () => {
    const first = renderCall(params, theme, makeCtx(undefined, false))
    const second = renderCall(params, theme, makeCtx(first, false))
    expect(second).toBe(first)
  })

  it('propagates expand state and changed args through the reused component', () => {
    const first = renderCall(params, theme, makeCtx(undefined, false))
    const second = renderCall(params, theme, makeCtx(first, true))
    expect(second).toBe(first)
    const out = second.render(80).map(stripAnsi).join('\n')
    expect(out).toContain('Pick one')
    const single: QuestionParamsSchema = { questions: [question1] }
    const third = renderCall(single, theme, makeCtx(first, true))
    expect(third).toBe(first)
    expect(third.render(80).map(stripAnsi).join('\n')).not.toContain(
      'Pick many',
    )
  })
})
