import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createOwner } from './owner.js'
import type { QuestionParamsSchema, Result } from './schema.js'
import { runQuestionnaire } from './ui/index.js'

vi.mock('./ui/index.js', () => ({
  runQuestionnaire: vi.fn(),
}))

const question = {
  question: 'Pick one',
  header: 'Tab',
  options: [{ label: 'a' }, { label: 'b' }],
}

const params: QuestionParamsSchema = { questions: [question] }

function makeResult(label: string): Result {
  return {
    results: [
      {
        question,
        answer: { customText: undefined, selected: [{ index: 0, label }] },
      },
    ],
    cancelled: false,
  }
}

function makeSetup() {
  const shutdownCallbacks: Array<() => void> = []
  const pi = {
    events: {
      emit: vi.fn(),
      on: vi.fn((_key: string, cb: () => void) => {
        shutdownCallbacks.push(cb)
        return () => {
          const i = shutdownCallbacks.indexOf(cb)
          if (i >= 0) shutdownCallbacks.splice(i, 1)
        }
      }),
    },
  } as unknown as ExtensionAPI
  const setWorkingVisible = vi.fn()
  const ctx = {
    mode: 'tui',
    hasUI: true,
    ui: {
      setWorkingVisible,
      custom: vi.fn(),
      setWidget: vi.fn(),
    },
    sessionManager: { getSessionId: vi.fn(() => 'main-session') },
  } as unknown as ExtensionContext
  const owner = createOwner(pi, ctx)
  const ask = vi.mocked(runQuestionnaire)
  return {
    owner,
    setWorkingVisible,
    ask,
    shutdown: () => {
      const pending = [...shutdownCallbacks]
      for (const cb of pending) cb()
    },
    subscriberCount: () => shutdownCallbacks.length,
  }
}

describe('createOwner ask serialization', () => {
  beforeEach(() => {
    vi.mocked(runQuestionnaire).mockReset()
  })

  it('runs concurrent asks strictly FIFO with non-interleaved start/end', async () => {
    const { owner, ask, setWorkingVisible: workingVisible } = makeSetup()
    const first = makeResult('first')
    const second = makeResult('second')
    const releaseFirst = Promise.withResolvers<Result | null>()
    ask.mockImplementationOnce(async () => {
      return releaseFirst.promise
    })
    ask.mockImplementationOnce(async () => second)

    const p1 = owner.ask('call-1', params, { subagent: false })
    const p2 = owner.ask('call-2', params, { subagent: false })
    await vi.waitFor(() => {
      expect(ask).toHaveBeenCalledTimes(1)
    })

    expect(ask.mock.calls[0]?.[0]?.id).toBe('call-1')
    expect(workingVisible).toHaveBeenLastCalledWith(false)

    releaseFirst.resolve(first)
    await expect(p1).resolves.toBe(first)
    await expect(p2).resolves.toBe(second)

    expect(ask).toHaveBeenCalledTimes(2)
    expect(ask.mock.calls[1]?.[0]?.id).toBe('call-2')
    expect(workingVisible.mock.calls).toEqual([
      [false],
      [true],
      [false],
      [true],
    ])
  })

  it('resolves null for a queued ask when the session shuts down, without rendering it', async () => {
    const { owner, ask, shutdown } = makeSetup()
    ask.mockImplementation(async () => makeResult('only'))

    const p1 = owner.ask('call-1', params, { subagent: false })
    const p2 = owner.ask('call-2', params, { subagent: false })
    shutdown()

    await expect(p2).resolves.toBeNull()
    expect(ask).toHaveBeenCalledTimes(1)
    await expect(p1).resolves.toEqual(makeResult('only'))
  })

  it('keeps the queue running when a questionnaire rejects', async () => {
    const { owner, ask } = makeSetup()
    ask.mockRejectedValueOnce(new Error('boom'))
    const second = makeResult('second')
    ask.mockImplementationOnce(async () => second)

    const p1 = owner.ask('call-1', params, { subagent: false })
    const p2 = owner.ask('call-2', params, { subagent: false })

    await expect(p1).rejects.toThrow('boom')
    await expect(p2).resolves.toBe(second)
    expect(ask).toHaveBeenCalledTimes(2)
  })

  it('rejects and keeps the queue running when setWorkingVisible throws on the first ask', async () => {
    const { owner, ask, setWorkingVisible: workingVisible } = makeSetup()
    let calls = 0
    workingVisible.mockImplementation(() => {
      calls += 1
      if (calls === 1) throw new Error('ui boom')
    })
    const second = makeResult('second')
    ask.mockResolvedValue(second)

    const p1 = owner.ask('call-1', params, { subagent: false })
    const p2 = owner.ask('call-2', params, { subagent: false })

    await expect(p1).rejects.toThrow('ui boom')
    await expect(p2).resolves.toBe(second)
    expect(ask).toHaveBeenCalledTimes(1)
    expect(ask.mock.calls[0]?.[0]?.id).toBe('call-2')
  })

  it('rejects and keeps the queue running when setWorkingVisible throws on completion', async () => {
    const { owner, ask, setWorkingVisible: workingVisible } = makeSetup()
    let calls = 0
    workingVisible.mockImplementation(() => {
      calls += 1
      if (calls === 2) throw new Error('ui boom')
    })
    const second = makeResult('second')
    ask.mockResolvedValue(second)

    const p1 = owner.ask('call-1', params, { subagent: false })
    const p2 = owner.ask('call-2', params, { subagent: false })

    await expect(p1).rejects.toThrow('ui boom')
    await expect(p2).resolves.toBe(second)
    expect(ask).toHaveBeenCalledTimes(2)
    expect(ask.mock.calls[1]?.[0]?.id).toBe('call-2')
  })
})
