import type { AgentToolResult } from '@earendil-works/pi-coding-agent'
import { defineTool } from '@earendil-works/pi-coding-agent'
import { Text } from '@earendil-works/pi-tui'
import { Value } from 'typebox/value'

import { AskCallComponent, AskResultComponent } from './chat-renderer.js'
import type { Owner } from './owner.js'
import {
  MAX_OPTIONS,
  MAX_QUESTIONS,
  MIN_OPTIONS,
  MIN_QUESTIONS,
  QuestionParamsSchema,
  type QuestionResult,
  type Result,
  parseParams,
} from './schema.js'

export type AskDetails =
  | { kind: 'ok'; results: QuestionResult[] }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string }

function errResult(message: string): AgentToolResult<AskDetails> {
  return {
    content: [{ type: 'text', text: message }],
    details: { kind: 'error', message },
  }
}

function toToolResult(result: Result | null): AgentToolResult<AskDetails> {
  if (!result || result.cancelled) {
    return {
      content: [{ type: 'text', text: 'User cancelled the questionnaire' }],
      details: { kind: 'cancelled' },
    }
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    details: { kind: 'ok', results: result.results },
  }
}

export function createAskUserTool(getOwner: () => Owner | undefined) {
  return defineTool<typeof QuestionParamsSchema, AskDetails>({
    name: 'ask_user_question',
    label: 'AskUserQuestion',
    description:
      `Ask the user one or more multiple-choice questions (${MIN_QUESTIONS}–${MAX_QUESTIONS} questions, ${MIN_OPTIONS}–${MAX_OPTIONS} options each). ` +
      'Each question has optional option descriptions and (for single-select) preview content. ' +
      'Set multiSelect=true to allow several options; otherwise the user picks one. ' +
      'A "Other:" row is always available for a free-form answer; just type to write and Enter to submit (Shift+Enter inserts a newline).',
    parameters: QuestionParamsSchema,

    async execute(
      id,
      params,
      _signal,
      _onUpdate,
      ctx,
    ): Promise<AgentToolResult<AskDetails>> {
      const parsed = parseParams(params)
      if (!parsed.ok) return errResult(`Error: ${parsed.error}`)

      const current = getOwner()
      if (!current) {
        return errResult(
          'Error: ask_user_question requires a TUI coordinator session',
        )
      }
      // NOTE: asks from any session other than the owner (the TUI coordinator)
      // come from a subagent and are labelled as such in the UI.
      const isSubagent = current.sessionId !== ctx.sessionManager.getSessionId()
      const result = await current.ask(id, parsed.value, {
        subagent: isSubagent,
      })
      return toToolResult(result)
    },

    renderCall(args: QuestionParamsSchema, theme, ctx) {
      if (!Value.Check(QuestionParamsSchema, args)) {
        return new Text(theme.fg('warning', '(invalid arguments)'), 0, 0)
      }
      // Reuse the previous component so the host's expand toggle only rebuilds
      // when the state actually changed.
      if (ctx.lastComponent instanceof AskCallComponent) {
        ctx.lastComponent.setArgs(args)
        ctx.lastComponent.setExpanded(ctx.expanded)
        return ctx.lastComponent
      }
      return new AskCallComponent({ args, expanded: ctx.expanded, theme })
    },

    renderResult(result, opts, theme, ctx) {
      // Reuse the previous component so the host's expand toggle only rebuilds
      // when the state actually changed.
      if (ctx.lastComponent instanceof AskResultComponent) {
        ctx.lastComponent.setExpanded(opts.expanded)
        return ctx.lastComponent
      }
      return new AskResultComponent({
        result,
        expanded: opts.expanded,
        theme,
      })
    },
  })
}
