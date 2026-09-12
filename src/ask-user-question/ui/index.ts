import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from '@earendil-works/pi-coding-agent'
import type { Component } from '@earendil-works/pi-tui'
import type { TUI } from '@earendil-works/pi-tui'

import type { QuestionParamsSchema, Result } from '../schema.js'
import { createQuestionnaireState } from '../state.js'
import { QuestionnaireComponent } from './component.js'

export const EVENT_KEY_UI_START = 'pi-ask-user:ask_user_question:ui_start'
export const EVENT_KEY_UI_END = 'pi-ask-user:ask_user_question:ui_end'

export type AskUserUiEventPayload = { id: string }

export async function runQuestionnaire({
  ctx,
  events,
  id,
  params,
  subagent,
}: {
  ctx: ExtensionContext
  events: ExtensionAPI['events']
  id: string
  params: QuestionParamsSchema
  subagent: boolean
}): Promise<Result | null> {
  events.emit(EVENT_KEY_UI_START, { id })
  try {
    return await ctx.ui.custom<Result | null>((tui, theme, _kb, done) =>
      renderQuestionnaire({ params, theme, tui, done, subagent }),
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
  subagent: boolean
}): Component {
  const state = createQuestionnaireState(args)

  return new QuestionnaireComponent({
    state,
    params: args.params,
    theme: args.theme,
    subagent: args.subagent,
  })
}
