import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import { describe, expect, it, vi } from 'vitest'

import type { QuestionParamsSchema, Result } from '../schema.js'
import {
  EVENT_KEY_UI_END,
  EVENT_KEY_UI_START,
  runQuestionnaire,
} from './index.js'
import { createStubTheme } from './test-theme.js'

const params: QuestionParamsSchema = {
  questions: [
    {
      question: 'Pick one',
      tabName: 'Tab',
      options: [{ label: 'a' }, { label: 'b' }],
    },
  ],
}

// Non-null sentinel result used to pin exact propagation through done.
const sentinel: Result = { results: [], cancelled: false }

// Emit mock over a shared emission log so tests can assert the exact
// order of START / custom invocation / END.
function makeEvents(log: string[] = []): {
  events: Parameters<typeof runQuestionnaire>[0]['events']
  emit: ReturnType<typeof vi.fn>
} {
  const emit = vi.fn((key: string) => {
    if (key === EVENT_KEY_UI_START) log.push('start')
    if (key === EVENT_KEY_UI_END) log.push('end')
  })
  return {
    events: { emit } as unknown as Parameters<
      typeof runQuestionnaire
    >[0]['events'],
    emit,
  }
}

// Returns the mock fn separately so tests never reference it as a bound
// method of the ctx object (avoids unbound-method lint noise).
function makeCtx(
  impl: (factory: unknown, options?: unknown) => Promise<unknown> = async () =>
    null,
): { ctx: ExtensionContext; custom: ReturnType<typeof vi.fn> } {
  const custom = vi.fn(impl)
  const ctx = { ui: { custom } } as unknown as ExtensionContext
  return { ctx, custom }
}

describe('runQuestionnaire', () => {
  it('shows the questionnaire as an overlay via ctx.ui.custom', async () => {
    const { events, emit } = makeEvents()
    const { ctx, custom } = makeCtx()
    await runQuestionnaire({ ctx, events, id: 'id-1', params, subagent: false })

    expect(custom).toHaveBeenCalledTimes(1)
    const [factory, options] = custom.mock.calls[0] as [
      (...args: unknown[]) => unknown,
      { overlay?: boolean } | undefined,
    ]
    expect(options?.overlay).toBe(true)
    // Factory is still the (tui, theme, keybindings, done) renderer.
    expect(typeof factory).toBe('function')

    expect(emit).toHaveBeenCalledWith(EVENT_KEY_UI_START, { id: 'id-1' })
    expect(emit).toHaveBeenCalledWith(EVENT_KEY_UI_END, { id: 'id-1' })
  })

  it('propagates a non-null done result and emits START before custom and END after settle', async () => {
    const log: string[] = []
    const { events } = makeEvents(log)
    const theme = createStubTheme()

    // Invoke the factory, capture done, fire it with the sentinel, and
    // settle the custom promise with that same value.
    const { ctx } = makeCtx((factory) => {
      // START must already have been emitted before custom is invoked.
      expect(log).toEqual(['start'])
      const render = factory as (
        tui: unknown,
        theme: unknown,
        kb: unknown,
        done: (r: Result | null) => void,
      ) => unknown
      let lastResult: Result | null = null
      const done = (r: Result | null) => {
        lastResult = r
      }
      render({}, theme, {}, done)
      // Simulate the keypress that settles the questionnaire.
      done(sentinel)
      log.push('custom-invoked')
      return Promise.resolve(lastResult)
    })

    const result = await runQuestionnaire({
      ctx,
      events,
      id: 'id-2',
      params,
      subagent: false,
    })

    // Exact same object must come out of the promise.
    expect(result).toBe(sentinel)
    // END must only be emitted after the custom promise settles.
    expect(log).toEqual(['start', 'custom-invoked', 'end'])
  })

  it('resolves with the result even when the START emit throws', async () => {
    const log: string[] = []
    const emit = vi.fn((key: string) => {
      if (key === EVENT_KEY_UI_START) {
        // Emission happened (and was observed) before the listener threw.
        log.push('start')
        throw new Error('listener exploded')
      }
      if (key === EVENT_KEY_UI_END) log.push('end')
    })
    const events = { emit } as unknown as Parameters<
      typeof runQuestionnaire
    >[0]['events']
    const theme = createStubTheme()
    const { ctx } = makeCtx((factory) => {
      const render = factory as (
        tui: unknown,
        theme: unknown,
        kb: unknown,
        done: (r: Result | null) => void,
      ) => unknown
      let lastResult: Result | null = null
      const done = (r: Result | null) => {
        lastResult = r
      }
      render({}, theme, {}, done)
      done(sentinel)
      return Promise.resolve(lastResult)
    })

    const result = await runQuestionnaire({
      ctx,
      events,
      id: 'id-3',
      params,
      subagent: false,
    })

    expect(result).toBe(sentinel)
    // END was still attempted despite the START-emit throw.
    expect(log).toEqual(['start', 'end'])
  })

  it('still resolves normally when the END emit throws', async () => {
    const emit = vi.fn((key: string) => {
      if (key === EVENT_KEY_UI_END) throw new Error('listener exploded')
    })
    const events = { emit } as unknown as Parameters<
      typeof runQuestionnaire
    >[0]['events']
    const theme = createStubTheme()
    const { ctx } = makeCtx((factory) => {
      const render = factory as (
        tui: unknown,
        theme: unknown,
        kb: unknown,
        done: (r: Result | null) => void,
      ) => unknown
      let lastResult: Result | null = null
      const done = (r: Result | null) => {
        lastResult = r
      }
      render({}, theme, {}, done)
      done(sentinel)
      return Promise.resolve(lastResult)
    })

    const result = await runQuestionnaire({
      ctx,
      events,
      id: 'id-4',
      params,
      subagent: false,
    })

    expect(result).toBe(sentinel)
    expect(emit).toHaveBeenCalledWith(EVENT_KEY_UI_END, { id: 'id-4' })
  })
})
