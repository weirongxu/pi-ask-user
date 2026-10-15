import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { QuestionParamsSchema, Result } from '../schema.js'
import {
  EVENT_KEY_UI_END,
  EVENT_KEY_UI_START,
  runQuestionnaire,
} from './index.js'
import { createStubTheme } from './test-theme.js'

const mocks = vi.hoisted(() => ({
  lastOnFinish: undefined as undefined | ((r: unknown) => void),
  component: undefined as undefined | { handleInput: (data: string) => void },
}))

vi.mock('./component.js', () => ({
  QuestionnaireComponent: class {
    handleInput = vi.fn((data: string) => data)
    invalidate = vi.fn()
    constructor({ onFinish }: { onFinish: (r: unknown) => void }) {
      mocks.lastOnFinish = onFinish
      mocks.component = this as unknown as {
        handleInput: (data: string) => void
      }
    }
  },
}))
vi.mock('../state.js', () => ({
  createQuestionnaireState: () => ({}),
}))

const params: QuestionParamsSchema = {
  questions: [
    {
      question: 'Pick one',
      header: 'Tab',
      options: [{ label: 'a' }, { label: 'b' }],
    },
  ],
}

const sentinel: Result = { results: [], cancelled: false }

beforeEach(() => {
  mocks.lastOnFinish = undefined
  mocks.component = undefined
})

type Wrapper = {
  render: (width: number) => string[]
  handleInput: (data: string) => void
}

// Returns the mock fns separately so tests never reference them as bound
// methods of the ctx object (avoids unbound-method lint noise).
type CustomImpl = (
  factory: (...args: unknown[]) => unknown,
  options?: unknown,
) => Promise<unknown>

function makeCtx(impl?: CustomImpl): {
  ctx: ExtensionContext
  custom: ReturnType<typeof vi.fn>
  setWidget: ReturnType<typeof vi.fn>
  wrapper: () => Wrapper | undefined
  doneCalls: unknown[]
} {
  let wrapper: Wrapper | undefined
  const doneCalls: unknown[] = []
  const setWidget = vi.fn()
  const custom = vi.fn(
    (
      factory: (...args: unknown[]) => unknown,
      options?: unknown,
    ): Promise<unknown> =>
      impl
        ? impl(factory, options)
        : new Promise((resolve) => {
            const done = (r: unknown) => {
              doneCalls.push(r)
              resolve(r)
            }
            wrapper = factory({}, createStubTheme(), {}, done) as Wrapper
          }),
  )
  const ctx = {
    mode: 'tui',
    hasUI: true,
    ui: { custom, setWidget },
  } as unknown as ExtensionContext
  return { ctx, custom, setWidget, wrapper: () => wrapper, doneCalls }
}

function makeShutdownEvents(): {
  events: Parameters<typeof runQuestionnaire>[0]['events']
  shutdown: () => void
} {
  const shutdownCallbacks: Array<() => void> = []
  return {
    events: {
      emit: vi.fn(),
      on: vi.fn((key: string, cb: () => void) => {
        if (key === 'session_shutdown') shutdownCallbacks.push(cb)
        return () => {}
      }),
    },
    shutdown: () => {
      for (const cb of shutdownCallbacks) cb()
    },
  }
}

async function ask(input: {
  ctx: ExtensionContext
  events?: Parameters<typeof runQuestionnaire>[0]['events']
  mode: 'widget' | 'custom' | 'overlay'
  id?: string
}): Promise<Result | null> {
  return await runQuestionnaire({
    ctx: input.ctx,
    events: input.events ?? { emit: vi.fn(), on: vi.fn(() => () => {}) },
    id: input.id ?? 'id-1',
    mode: input.mode,
    params,
    subagent: false,
  })
}

describe('runQuestionnaire dispatch', () => {
  it.each([
    { mode: 'custom', overlay: false },
    { mode: 'overlay', overlay: true },
    { mode: 'widget', overlay: true },
  ] as const)(
    'renders $mode via ctx.ui.custom with overlay=$overlay',
    async ({
      mode,
      overlay,
    }: {
      mode: 'custom' | 'overlay' | 'widget'
      overlay: boolean
    }) => {
      const { ctx, custom } = makeCtx()
      const pending = ask({ ctx, mode })

      expect(custom).toHaveBeenCalledTimes(1)
      const [, options] = custom.mock.calls[0] as [
        (...args: unknown[]) => unknown,
        { overlay?: boolean } | undefined,
      ]
      expect(options?.overlay).toBe(overlay)
      pending.catch(() => {})
    },
  )

  it('propagates a non-null done result', async () => {
    const { ctx } = makeCtx()
    const pending = ask({ ctx, mode: 'custom' })

    mocks.lastOnFinish?.(sentinel)
    await expect(pending).resolves.toBe(sentinel)
  })
})

describe('runQuestionnaire event contract', () => {
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

  it('emits START with the id before and END after the questionnaire settles', async () => {
    const log: string[] = []
    const { events, emit } = makeEvents(log)
    const { ctx } = makeCtx(async (factory) => {
      // START must already have been emitted before custom is invoked.
      expect(log).toEqual(['start'])
      ;(
        factory as (
          _tui: unknown,
          _theme: unknown,
          _kb: unknown,
          done: (r: Result | null) => void,
        ) => unknown
      )(null, null, null, () => {})
      // Simulate the keypress that settles the questionnaire.
      mocks.lastOnFinish?.(sentinel)
      log.push('custom-invoked')
      return sentinel
    })

    const result = await ask({ ctx, events, mode: 'overlay', id: 'id-2' })

    expect(result).toBe(sentinel)
    expect(emit).toHaveBeenCalledWith(EVENT_KEY_UI_START, { id: 'id-2' })
    expect(emit).toHaveBeenCalledWith(EVENT_KEY_UI_END, { id: 'id-2' })
    expect(log).toEqual(['start', 'custom-invoked', 'end'])
  })

  it('resolves with the result even when the START emit throws', async () => {
    const log: string[] = []
    const emit = vi.fn((key: string) => {
      if (key === EVENT_KEY_UI_START) {
        log.push('start')
        throw new Error('listener exploded')
      }
      if (key === EVENT_KEY_UI_END) log.push('end')
    })
    const events = { emit } as unknown as Parameters<
      typeof runQuestionnaire
    >[0]['events']
    const { ctx } = makeCtx(async (factory) => {
      ;(
        factory as (
          _tui: unknown,
          _theme: unknown,
          _kb: unknown,
          done: (r: Result | null) => void,
        ) => unknown
      )(null, null, null, () => {})
      mocks.lastOnFinish?.(sentinel)
      return sentinel
    })

    const result = await ask({ ctx, events, mode: 'custom', id: 'id-3' })

    expect(result).toBe(sentinel)
    expect(log).toEqual(['start', 'end'])
  })

  it('still resolves normally when the END emit throws', async () => {
    const emit = vi.fn((key: string) => {
      if (key === EVENT_KEY_UI_END) throw new Error('listener exploded')
    })
    const events = { emit } as unknown as Parameters<
      typeof runQuestionnaire
    >[0]['events']
    const { ctx } = makeCtx(async (factory) => {
      ;(
        factory as (
          _tui: unknown,
          _theme: unknown,
          _kb: unknown,
          done: (r: Result | null) => void,
        ) => unknown
      )(null, null, null, () => {})
      mocks.lastOnFinish?.(sentinel)
      return sentinel
    })

    const result = await ask({ ctx, events, mode: 'custom', id: 'id-4' })

    expect(result).toBe(sentinel)
    expect(emit).toHaveBeenCalledWith(EVENT_KEY_UI_END, { id: 'id-4' })
  })
})

describe('runQuestionnaire widget mode', () => {
  function mountWidgetFactory(input: {
    setWidget: ReturnType<typeof vi.fn>
  }): (tui: unknown, theme: unknown) => unknown {
    const [, factory] = input.setWidget.mock.lastCall as [
      string,
      (tui: unknown, theme: unknown) => unknown,
    ]
    return factory
  }

  it('calls ctx.ui.custom with overlay=true and mounts the widget via setWidget', async () => {
    const { events, shutdown } = makeShutdownEvents()
    const { ctx, custom, setWidget, wrapper } = makeCtx()
    const pending = ask({ ctx, events, mode: 'widget' })
    await Promise.resolve()

    expect(custom).toHaveBeenCalledTimes(1)
    expect(custom.mock.calls[0]?.[1]).toEqual({ overlay: true })
    expect(setWidget).toHaveBeenCalledTimes(1)
    expect(setWidget.mock.calls[0]?.[0]).toBe('pi-ask-user')

    // The wrapper renders nothing; the real UI lives in the widget component.
    expect(wrapper()?.render(80)).toEqual([])
    mountWidgetFactory({ setWidget })({}, createStubTheme())
    expect(mocks.component).toBeDefined()

    shutdown()
    await expect(pending).resolves.toBeNull()
    expect(setWidget).toHaveBeenLastCalledWith('pi-ask-user', undefined)
  })

  it('forwards wrapper input to the widget component and resolves through done', async () => {
    const { events } = makeShutdownEvents()
    const { ctx, setWidget, wrapper } = makeCtx()
    const pending = ask({ ctx, events, mode: 'widget' })
    await Promise.resolve()

    mountWidgetFactory({ setWidget })({}, createStubTheme())

    wrapper()?.handleInput('x')
    expect(mocks.component?.handleInput).toHaveBeenCalledWith('x')

    mocks.lastOnFinish?.(sentinel)
    await expect(pending).resolves.toBe(sentinel)
    expect(setWidget).toHaveBeenLastCalledWith('pi-ask-user', undefined)
  })

  it('resolves null on session_shutdown, settles the wrapper, and allows a follow-up run', async () => {
    const { events, shutdown } = makeShutdownEvents()
    const { ctx, custom, setWidget, doneCalls } = makeCtx()
    const first = ask({ ctx, events, mode: 'widget' })
    await Promise.resolve()

    shutdown()
    await expect(first).resolves.toBeNull()
    // The wrapper's custom promise must be settled too, otherwise the core
    // prompt bookkeeping (ui_prompt_start/end) stays open for good.
    expect(doneCalls).toEqual([null])
    expect(setWidget).toHaveBeenLastCalledWith('pi-ask-user', undefined)

    const second = ask({ ctx, events, mode: 'widget' })
    await Promise.resolve()
    expect(custom).toHaveBeenCalledTimes(2)
    mountWidgetFactory({ setWidget })({}, createStubTheme())
    mocks.lastOnFinish?.(sentinel)
    await expect(second).resolves.toBe(sentinel)
    expect(setWidget).toHaveBeenLastCalledWith('pi-ask-user', undefined)
  })
})
