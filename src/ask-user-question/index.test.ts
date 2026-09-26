import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { registerAskUserQuestion } from './index.js'
import { setOwner } from './owner.js'
import type { QuestionParamsSchema, Result } from './schema.js'
import type { createAskUserTool } from './tool.js'
import { runQuestionnaire } from './ui/index.js'
import { createStubTheme, stripAnsi } from './ui/test-theme.js'

vi.mock('./ui/index.js', () => ({
  runQuestionnaire: vi.fn(async () => answer),
}))

type CtxMode = ExtensionContext['mode']

const question = {
  question: 'Pick one',
  header: 'Tab',
  options: [{ label: 'a' }, { label: 'b' }],
}

const params: QuestionParamsSchema = { questions: [question] }

const answer: Result = {
  results: [
    {
      question,
      answer: { customText: undefined, selected: [{ index: 0, label: 'a' }] },
    },
  ],
  cancelled: false,
}

function makeCtx(
  mode: CtxMode,
  hasUI: boolean,
  sessionId: string,
): ExtensionContext {
  return {
    mode,
    hasUI,
    ui: { setWorkingVisible: vi.fn(), custom: vi.fn() },
    sessionManager: { getSessionId: vi.fn(() => sessionId) },
  } as unknown as ExtensionContext
}

const rpcCtx = makeCtx('rpc', true, 'rpc-session')
const mainCtx = makeCtx('tui', true, 'main-session')

type Handler = (event: unknown, ctx: ExtensionContext) => void

function registerExtension() {
  const handlers = new Map<string, Handler[]>()
  const registerTool = vi.fn<ExtensionAPI['registerTool']>()
  const pi = {
    on(event: string, handler: Handler) {
      const list = handlers.get(event) ?? []
      list.push(handler)
      handlers.set(event, list)
    },
    registerTool,
    registerCommand: vi.fn(),
    events: { emit: vi.fn(), on: vi.fn() },
  } as unknown as ExtensionAPI
  registerAskUserQuestion(pi, { demoEnabled: false })
  const registered = registerTool.mock.calls[0]?.[0]
  if (!registered) throw new Error('ask_user_question tool was not registered')
  const typed = registered as ReturnType<typeof createAskUserTool>
  const { renderCall, renderResult } = typed
  if (typeof renderCall !== 'function' || typeof renderResult !== 'function') {
    throw new Error('render functions are not defined')
  }
  return {
    tool: {
      execute: (...args: Parameters<typeof typed.execute>) =>
        typed.execute(...args),
      renderCall,
      renderResult,
    },
    fire: (
      event: 'session_start' | 'session_shutdown',
      ctx: ExtensionContext,
    ) => {
      for (const handler of handlers.get(event) ?? []) handler(undefined, ctx)
    },
  }
}

describe('registerAskUserQuestion', () => {
  beforeEach(() => {
    setOwner(undefined)
    vi.mocked(runQuestionnaire).mockClear()
    vi.mocked(runQuestionnaire).mockImplementation(async () => answer)
  })

  it('registers the owner for the TUI session that starts after non-tui sessions', async () => {
    const { tool, fire } = registerExtension()
    fire('session_start', rpcCtx)
    fire('session_start', mainCtx)

    const first = await tool.execute(
      'call-1',
      params,
      undefined,
      undefined,
      mainCtx,
    )

    expect(runQuestionnaire).toHaveBeenCalledTimes(1)
    expect(vi.mocked(runQuestionnaire).mock.calls[0]?.[0]?.ctx).toBe(mainCtx)
    const second = await tool.execute(
      'call-2',
      params,
      undefined,
      undefined,
      mainCtx,
    )
    expect(first).toBeDefined()
    expect(second).toEqual({
      content: [{ type: 'text', text: JSON.stringify(answer) }],
      details: { kind: 'ok', results: answer.results },
    })
  })

  it('bridges a non-tui session ask to the TUI owner', async () => {
    const { tool, fire } = registerExtension()
    fire('session_start', mainCtx)
    fire('session_start', rpcCtx)

    const result = await tool.execute(
      'call-1',
      params,
      undefined,
      undefined,
      rpcCtx,
    )

    expect(runQuestionnaire).toHaveBeenCalledWith(
      expect.objectContaining({
        ctx: mainCtx,
        id: 'call-1',
        params,
        subagent: true,
      }),
    )
    expect(result.details).toEqual({
      kind: 'ok',
      results: answer.results,
    })
  })

  it('does not mark asks from the owner session as subagent', async () => {
    const { tool, fire } = registerExtension()
    fire('session_start', mainCtx)

    const p = await tool.execute(
      'call-1',
      params,
      undefined,
      undefined,
      mainCtx,
    )

    expect(runQuestionnaire).toHaveBeenCalledWith(
      expect.objectContaining({ ctx: mainCtx, id: 'call-1', params }),
    )
    const call = vi.mocked(runQuestionnaire).mock.calls[0]?.[0]
    expect(call?.subagent).toBe(false)
    expect(p.details).toEqual({ kind: 'ok', results: answer.results })
  })

  it('takes over the owner with last-wins when two TUI sessions start in sequence', async () => {
    const { tool, fire } = registerExtension()
    const first = makeCtx('tui', true, 'first-tui')
    const second = makeCtx('tui', true, 'second-tui')
    fire('session_start', first)
    fire('session_start', second)

    const p = await tool.execute('call-1', params, undefined, undefined, second)

    expect(vi.mocked(runQuestionnaire).mock.calls[0]?.[0]?.ctx).toBe(second)
    expect(p.details).toEqual({ kind: 'ok', results: answer.results })
  })

  it('clears ownership on session_shutdown of the owner session only', async () => {
    const { tool, fire } = registerExtension()
    fire('session_start', mainCtx)
    fire('session_shutdown', makeCtx('tui', true, 'other-session'))

    const result1 = await tool.execute(
      'call-1',
      params,
      undefined,
      undefined,
      mainCtx,
    )
    expect(result1.details).toEqual({ kind: 'ok', results: answer.results })
    expect(vi.mocked(runQuestionnaire).mock.calls[0]?.[0]?.ctx).toBe(mainCtx)

    fire('session_shutdown', mainCtx)
    const result = await tool.execute(
      'call-2',
      params,
      undefined,
      undefined,
      rpcCtx,
    )
    expect(runQuestionnaire).toHaveBeenCalledTimes(1)
    expect(result.details).toEqual({
      kind: 'error',
      message: 'Error: ask_user_question requires a TUI coordinator session',
    })
  })

  it('returns cancelled details when the questionnaire is cancelled', async () => {
    vi.mocked(runQuestionnaire).mockResolvedValueOnce({
      results: [],
      cancelled: true,
    })
    const { tool, fire } = registerExtension()
    fire('session_start', mainCtx)

    const result = await tool.execute(
      'call-1',
      params,
      undefined,
      undefined,
      mainCtx,
    )

    expect(result.details).toEqual({ kind: 'cancelled' })
  })

  it('returns error details for invalid params', async () => {
    const { tool } = registerExtension()

    const result = await tool.execute(
      'call-1',
      { questions: [] },
      undefined,
      undefined,
      mainCtx,
    )

    expect(result.details.kind).toBe('error')
    if (result.details.kind === 'error') {
      expect(result.details.message).toContain('Error:')
    }
  })

  describe('renderResult', () => {
    it('renders foreign results (e.g. pi validation failures) as warning text', () => {
      const { tool } = registerExtension()
      const foreign = {
        content: [
          {
            type: 'text',
            text: 'Validation failed for tool "ask_user_question": ...',
          },
        ],
        details: {},
      } as unknown as Parameters<typeof tool.renderResult>[0]
      const ctx = {
        args: {},
        toolCallId: 'call-foreign',
        invalidate: () => {},
        lastComponent: undefined,
      } as unknown as Parameters<typeof tool.renderResult>[3]

      const component = tool.renderResult(
        foreign,
        { expanded: false, isPartial: false },
        createStubTheme(),
        ctx,
      )

      expect(component).toBeDefined()
      const output = component.render(80).map(stripAnsi).join('\n')
      expect(output).toContain('Validation failed for tool "ask_user_question"')
    })

    it('joins multiple foreign content blocks into the warning text', () => {
      const { tool } = registerExtension()
      const foreign = {
        content: [
          { type: 'text', text: 'first block' },
          { type: 'text', text: 'second block' },
        ],
        details: {},
      } as unknown as Parameters<typeof tool.renderResult>[0]
      const ctx = {
        args: {},
        toolCallId: 'call-foreign-multi',
        invalidate: () => {},
        lastComponent: undefined,
      } as unknown as Parameters<typeof tool.renderResult>[3]

      const component = tool.renderResult(
        foreign,
        { expanded: false, isPartial: false },
        createStubTheme(),
        ctx,
      )

      expect(component).toBeDefined()
      const output = component
        .render(80)
        .map((line) => stripAnsi(line).trimEnd())
        .join('\n')
      expect(output).toContain('first block\nsecond block')
    })
  })

  describe('renderCall', () => {
    it('does not throw on raw unvalidated arguments', () => {
      const { tool } = registerExtension()
      const theme = createStubTheme()

      const garbage: unknown[] = [
        {},
        { questions: 'not-an-array' },
        undefined,
        { questions: [null] },
      ]
      const ctx = {
        args: {},
        toolCallId: 'call-garbage',
        invalidate: () => {},
        lastComponent: undefined,
      } as unknown as Parameters<typeof tool.renderCall>[2]
      for (const args of garbage) {
        const component = tool.renderCall(args, theme, ctx)
        expect(component).toBeDefined()
        expect(() => component.render(80)).not.toThrow()
      }
    })
  })
})
