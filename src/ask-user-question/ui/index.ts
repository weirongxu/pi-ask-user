import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import type { Theme } from '@earendil-works/pi-coding-agent'
import type { Component } from '@earendil-works/pi-tui'
import type { TUI } from '@earendil-works/pi-tui'

import type { QuestionParamsSchema, Result } from '../schema.js'
import { createQuestionnaireState } from '../state.js'
import { QuestionnaireComponent } from './component.js'

export const EVENT_KEY_UI_START = 'pi-ask-user:ask_user_question:ui_start'
export const EVENT_KEY_UI_END = 'pi-ask-user:ask_user_question:ui_end'

export type AskUserUiEventPayload = { id: string }

export async function runQuestionnaire(args: {
  ctx: ExtensionContext
  events: { emit: (key: string, payload: AskUserUiEventPayload) => void }
  id: string
  params: QuestionParamsSchema
}): Promise<Result | null> {
  const { ctx, events, id, params } = args
  events.emit(EVENT_KEY_UI_START, { id })
  try {
    return await ctx.ui.custom<Result | null>((tui, theme, _kb, done) =>
      renderQuestionnaire({ params, theme, tui, done }),
    )
  } finally {
    events.emit(EVENT_KEY_UI_END, { id })
  }
}

export function renderQuestionnaire(args: {
  params: QuestionParamsSchema
  theme: Theme
  tui: TUI
  done: (r: Result | null) => void
}): Component {
  const state = createQuestionnaireState(args)

  return new QuestionnaireComponent({
    state,
    params: args.params,
    theme: args.theme,
  })
}
