import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from '@earendil-works/pi-coding-agent'
import type { Component, TUI } from '@earendil-works/pi-tui'

import type { AskUserRenderMode } from '../config.js'
import type { QuestionParamsSchema, Result } from '../schema.js'
import { createQuestionnaireState } from '../state.js'
import { QuestionnaireComponent } from './component.js'

const WIDGET_KEY = 'pi-ask-user'

export const EVENT_KEY_UI_START = 'pi-ask-user:ask_user_question:ui_start'
export const EVENT_KEY_UI_END = 'pi-ask-user:ask_user_question:ui_end'

export type AskUserUiEventPayload = { id: string }

type QuestionnaireArgs = {
  ctx: ExtensionContext
  params: QuestionParamsSchema
  subagent: boolean
}

// TUI-only by contract: non-TUI sessions never register as owner
// (isTuiOwnerSession), so the widget path never runs outside a TUI.
export async function runQuestionnaire({
  ctx,
  events,
  id,
  mode,
  params,
  subagent,
}: QuestionnaireArgs & {
  events: ExtensionAPI['events']
  id: string
  mode: AskUserRenderMode
}): Promise<Result | null> {
  try {
    events.emit(EVENT_KEY_UI_START, { id })
  } catch {
    // Swallow: failing to announce UI start must not break the question flow.
  }
  try {
    return await runMode({ ctx, events, mode, params, subagent })
  } finally {
    try {
      events.emit(EVENT_KEY_UI_END, { id })
    } catch {
      // Swallow: an END-emit throw must not mask the questionnaire result.
    }
  }
}

async function runMode({
  ctx,
  events,
  mode,
  params,
  subagent,
}: QuestionnaireArgs & {
  events: ExtensionAPI['events']
  mode: AskUserRenderMode
}): Promise<Result | null> {
  if (mode === 'widget')
    return await runWidget({ ctx, events, params, subagent })
  return await runCustom({ ctx, params, subagent, overlay: mode === 'overlay' })
}

function runCustom({
  ctx,
  params,
  subagent,
  overlay,
}: QuestionnaireArgs & { overlay: boolean }) {
  return ctx.ui.custom<Result | null>(
    (tui, theme, _kb, done) =>
      renderQuestionnaire({ onFinish: done, params, theme, tui, subagent }),
    { overlay },
  )
}

async function runWidget({
  ctx,
  events,
  params,
  subagent,
}: QuestionnaireArgs & {
  events: ExtensionAPI['events']
}): Promise<Result | null> {
  const { promise: aborted, resolve } = Promise.withResolvers<Result | null>()
  let finishWrapper: ((r: Result | null) => void) | undefined
  const offShutdown = events.on('session_shutdown', () => {
    finishWrapper?.(null)
    resolve(null)
  })
  try {
    return await Promise.race([
      ctx.ui.custom<Result | null>(
        (_tui, _theme, _kb, done) => {
          finishWrapper = done
          return mountWidget({ ctx, done, params, subagent })
        },
        {
          // Overlay wrapper: pi-tui's overlay stack survives editorContainer.clear(),
          // unlike non-overlay custom wrappers which get silently evicted by any
          // later UI pushed into the editor container.
          overlay: true,
        },
      ),
      aborted,
    ])
  } finally {
    offShutdown()
    ctx.ui.setWidget(WIDGET_KEY, undefined)
  }
}

function mountWidget({
  ctx,
  done,
  params,
  subagent,
}: QuestionnaireArgs & {
  done: (r: Result | null) => void
}): Component {
  let component: QuestionnaireComponent | undefined
  ctx.ui.setWidget(
    WIDGET_KEY,
    (tui, theme) => {
      component = renderQuestionnaire({
        onFinish: done,
        params,
        theme,
        tui,
        subagent,
      })
      return component
    },
    { placement: 'aboveEditor' },
  )
  return {
    render: () => [],
    handleInput: (data) => component?.handleInput(data),
    invalidate: () => component?.invalidate(),
  }
}

export function renderQuestionnaire({
  params,
  theme,
  tui,
  onFinish,
  subagent,
}: {
  params: QuestionParamsSchema
  theme: Theme
  tui: TUI
  onFinish: (r: Result | null) => void
  subagent: boolean
}): QuestionnaireComponent {
  const state = createQuestionnaireState({ params, theme, tui })

  return new QuestionnaireComponent({
    state,
    params,
    theme,
    subagent,
    onFinish,
  })
}
