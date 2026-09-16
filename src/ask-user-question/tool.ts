import type { AgentToolResult } from '@earendil-works/pi-coding-agent'
import { defineTool } from '@earendil-works/pi-coding-agent'
import { Text } from '@earendil-works/pi-tui'
import { Value } from 'typebox/value'

import { beginBusy, endBusy } from './busy.js'
import type { Owner } from './owner.js'
import {
  MAX_OPTIONS,
  MAX_QUESTIONS,
  MIN_OPTIONS,
  MIN_QUESTIONS,
  parseParams,
  QuestionParamsSchema,
  type QuestionResult,
  type Result,
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

async function withBusy(
  run: () => Promise<Result | null>,
): Promise<Result | null> {
  await beginBusy()
  try {
    return await run()
  } finally {
    endBusy()
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
      // NOTE: only sessions that could not register as owner (non-TUI or
      // headless) can hit this, i.e. when no TUI coordinator session exists.
      if (!current) {
        return errResult(
          'Error: ask_user_question requires a TUI coordinator session',
        )
      }
      // NOTE: asks from any session other than the owner (the TUI coordinator)
      // come from a subagent and are labelled as such in the UI.
      const isSubagent = current.sessionId !== ctx.sessionManager.getSessionId()
      const result = await withBusy(() =>
        current.ask(id, parsed.value, { subagent: isSubagent }),
      )
      return toToolResult(result)
    },

    renderCall(args: QuestionParamsSchema, theme) {
      if (!Value.Check(QuestionParamsSchema, args)) {
        return new Text(theme.fg('warning', '(invalid arguments)'), 0, 0)
      }
      let text = theme.fg('toolTitle', theme.bold('ask_user_question '))
      const count = args.questions.length
      text += theme.fg('muted', `${count} question${count === 1 ? '' : 's'}`)
      return new Text(text, 0, 0)
    },

    renderResult(result, _opts, theme) {
      const details = result.details
      switch (details.kind) {
        case 'cancelled':
          return new Text(theme.fg('warning', 'Cancelled'), 0, 0)
        case 'error':
          return new Text(theme.fg('warning', details.message), 0, 0)
        case 'ok': {
          const lines = details.results.flatMap((r) => {
            const a = r.answer
            const q = r.question
            const value = a.selected.map((s) => s.label).join(', ')
            let prefix = ''
            if (a.customText !== undefined) {
              prefix = '(wrote) '
            } else if (q.multiSelect === true) {
              prefix = '(multi) '
            }
            const mainLine = `${theme.fg('success', '✓ ')}${theme.fg('muted', `${q.question}: `)}${theme.fg('accent', prefix + value)}`
            const noteLines = a.selected
              .filter((s) => s.note !== undefined)
              .map(
                (s) =>
                  `  ${theme.fg('muted', `Note for option ${s.index + 1}:`)} ${theme.fg('dim', s.note ?? '')}`,
              )
            return [mainLine, ...noteLines]
          })
          return new Text(lines.join('\n'), 0, 0)
        }
        default: {
          const lines: string[] = []
          for (const item of result.content) {
            if (item.type === 'text') lines.push(item.text)
          }
          if (lines.length === 0) lines.push('(no content)')
          return new Text(theme.fg('warning', lines.join('\n')), 0, 0)
        }
      }
    },
  })
}
