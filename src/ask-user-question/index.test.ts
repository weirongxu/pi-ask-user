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

vi.mock('./ui/index.js', () => ({
  runQuestionnaire: vi.fn(async () => answer),
}))

type CtxMode = ExtensionContext['mode']

const question = {
  question: 'Pick one',
  tabName: 'Tab',
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
  return {
    tool: {
      execute: (...args: Parameters<typeof typed.execute>) =>
        typed.execute(...args),
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

    await tool.execute('call-1', params, undefined, undefined, mainCtx)

    expect(runQuestionnaire).toHaveBeenCalledTimes(1)
    expect(vi.mocked(runQuestionnaire).mock.calls[0]?.[0]?.ctx).toBe(mainCtx)
    const second = await tool.execute(
      'call-2',
      params,
      undefined,
      undefined,
      mainCtx,
    )
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

    await tool.execute('call-1', params, undefined, undefined, mainCtx)

    expect(runQuestionnaire).toHaveBeenCalledWith(
      expect.objectContaining({ ctx: mainCtx, id: 'call-1', params }),
    )
    const call = vi.mocked(runQuestionnaire).mock.calls[0]?.[0]
    expect(call?.subagent).toBe(false)
  })

  it('takes over the owner with last-wins when two TUI sessions start in sequence', async () => {
    const { tool, fire } = registerExtension()
    const first = makeCtx('tui', true, 'first-tui')
    const second = makeCtx('tui', true, 'second-tui')
    fire('session_start', first)
    fire('session_start', second)

    await tool.execute('call-1', params, undefined, undefined, second)

    expect(vi.mocked(runQuestionnaire).mock.calls[0]?.[0]?.ctx).toBe(second)
  })

  it('clears ownership on session_shutdown of the owner session only', async () => {
    const { tool, fire } = registerExtension()
    fire('session_start', mainCtx)
    fire('session_shutdown', makeCtx('tui', true, 'other-session'))

    await tool.execute('call-1', params, undefined, undefined, mainCtx)
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
    const { tool, fire } = registerExtension()
    fire('session_start', mainCtx)

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
})
