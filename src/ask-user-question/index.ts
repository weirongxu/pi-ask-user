import type {
  AgentToolResult,
  ExtensionAPI,
} from '@earendil-works/pi-coding-agent'
import { defineTool } from '@earendil-works/pi-coding-agent'
import { Text } from '@earendil-works/pi-tui'

import {
  deriveLabels,
  MAX_OPTIONS,
  MAX_QUESTIONS,
  MIN_OPTIONS,
  MIN_QUESTIONS,
  parseParams,
  QuestionParamsSchema,
  type Result,
} from './schema.js'
import { runQuestionnaire } from './ui/index.js'

export function registerAskUserQuestion(
  pi: ExtensionAPI,
  { demoEnabled }: { demoEnabled?: boolean } = {},
): void {
  pi.registerTool(
    defineTool<typeof QuestionParamsSchema, Result>({
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
      ): Promise<AgentToolResult<Result>> {
        if (ctx.mode !== 'tui') {
          return errResult(
            'Error: UI not available (running in non-interactive mode)',
          )
        }

        const parsed = parseParams(params)
        if (!parsed.ok) return errResult(`Error: ${parsed.error}`)
        const value = parsed.value

        try {
          ctx.ui.setWorkingVisible(false)
          const result = await runQuestionnaire({
            ctx,
            events: pi.events,
            id,
            params: value,
          })
          if (!result || result.cancelled) {
            return errResult('User cancelled the questionnaire')
          }
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
            details: result,
          }
        } finally {
          ctx.ui.setWorkingVisible(true)
        }
      },

      renderCall(args: QuestionParamsSchema, theme) {
        const count = args.questions.length
        let text = theme.fg('toolTitle', theme.bold('ask_user_question '))
        text += theme.fg('muted', `${count} question${count === 1 ? '' : 's'}`)
        return new Text(text, 0, 0)
      },

      renderResult(result, _opts, theme) {
        const details = result.details
        if (details.cancelled)
          return new Text(theme.fg('warning', 'Cancelled'), 0, 0)
        const lines = details.results.flatMap((r) => {
          const a = r.answer
          const q = r.question
          const labels = deriveLabels(a, q.options)
          const value = labels.join(', ')
          const prefix =
            a.customText !== undefined
              ? '(wrote) '
              : q.multiSelect === true
                ? '(multi) '
                : ''
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
      },
    }),
  )

  if (demoEnabled) {
    pi.registerCommand('ask-user-demo', {
      description: 'Test ask_user_question tool UI component',
      handler: async (_args, ctx) => {
        const { runAskUserDemo } = await import('./ask-demo.js')
        await runAskUserDemo(ctx, pi.events)
      },
    })
  }
}

function errResult(message: string): AgentToolResult<Result> {
  return {
    content: [{ type: 'text', text: message }],
    details: { results: [], cancelled: true },
  }
}
