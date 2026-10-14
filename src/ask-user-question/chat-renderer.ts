import type { AgentToolResult } from '@earendil-works/pi-coding-agent'
import type { Theme } from '@earendil-works/pi-coding-agent'
import { Container, type Component, Text } from '@earendil-works/pi-tui'

import { flattenToSingleLine, truncateText } from '../utils/text.js'
import type { QuestionParamsSchema, QuestionResult } from './schema.js'
import type { AskDetails } from './tool.js'

// Pure render functions: they map (data, theme, expanded, width) to styled
// lines. Keeping them free of component state makes them easy to test.

/** Collapsed call line: `ask_user_question N question(s)`. */
export function renderCallCollapsed(
  args: QuestionParamsSchema,
  theme: Theme,
): string[] {
  const count = args.questions.length
  return [
    theme.fg('toolTitle', theme.bold('ask_user_question ')) +
      theme.fg('muted', `${count} question${count === 1 ? '' : 's'}`),
  ]
}

/** Expanded call lines: title, then each question with its options. */
export function renderCallExpanded(
  args: QuestionParamsSchema,
  theme: Theme,
): string[] {
  const lines: string[] = [
    theme.fg('toolTitle', theme.bold('ask_user_question')),
  ]
  for (const q of args.questions) {
    lines.push(theme.fg('accent', theme.bold(flattenToSingleLine(q.header))))
    const multi = q.multiSelect === true ? theme.fg('muted', ' (multi)') : ''
    lines.push(`${flattenToSingleLine(q.question)}${multi}`)
    for (const option of q.options) {
      let line = `  ${theme.fg('muted', '•')} ${option.label}`
      if (option.description !== undefined) {
        line += ` ${theme.fg('dim', flattenToSingleLine(option.description))}`
      }
      lines.push(line)
    }
  }
  return lines
}

/** Marker shown after the question text in expanded result lines. */
function resultMarker(result: QuestionResult, theme: Theme): string {
  if (result.answer.customText !== undefined) {
    return theme.fg('muted', ' (wrote)')
  }
  if (result.question.multiSelect === true) {
    return theme.fg('muted', ' (multi)')
  }
  return ''
}

/** Collapsed result line for a successful run: first question + `(+N)`. */
function renderResultOkCollapsed(
  results: QuestionResult[],
  theme: Theme,
): string[] {
  const head = results[0]
  if (!head) return [theme.fg('warning', '(no results)')]
  const a = head.answer
  const value = a.customText ?? a.selected.map((s) => s.label).join(', ')
  const extra =
    results.length > 1 ? theme.fg('muted', ` (+${results.length - 1})`) : ''
  let prefix = ''
  if (a.customText !== undefined) {
    prefix = '(wrote) '
  } else if (head.question.multiSelect === true) {
    prefix = '(multi) '
  }
  return [
    `${theme.fg('success', '✓ ')}${theme.fg('muted', `${head.question.question}: `)}${theme.fg('accent', prefix + value)}${extra}`,
  ]
}

/** Expanded result lines for a successful run: per question and option. */
function renderResultOkExpanded(
  results: QuestionResult[],
  theme: Theme,
): string[] {
  const lines: string[] = []
  for (const r of results) {
    const q = r.question
    const a = r.answer
    lines.push(
      `${theme.fg('success', '✓ ')}${flattenToSingleLine(q.question)}${resultMarker(r, theme)}`,
    )
    const selectedIndexes = new Set(a.selected.map((s) => s.index))
    for (const [i, option] of q.options.entries()) {
      if (selectedIndexes.has(i)) {
        lines.push(
          `  ${theme.fg('success', '✓')} ${theme.fg('accent', option.label)}`,
        )
      } else {
        lines.push(`  ${theme.fg('dim', '·')} ${theme.fg('dim', option.label)}`)
      }
      const note = a.selected.find((s) => s.index === i)?.note
      if (note !== undefined) {
        lines.push(`    ${theme.fg('dim', `— ${flattenToSingleLine(note)}`)}`)
      }
    }
    // Selections pointing past the options range (defensive) still show
    // their label and note so nothing is silently dropped.
    for (const s of a.selected) {
      if (s.index >= 0 && s.index < q.options.length) continue
      let line = `  ${theme.fg('success', '✓')} ${theme.fg('accent', s.label)}`
      if (s.note !== undefined) {
        line += ` ${theme.fg('dim', `— ${flattenToSingleLine(s.note)}`)}`
      }
      lines.push(line)
    }
    // Custom free-form answer: show it unless it duplicates a selected label.
    if (
      a.customText !== undefined &&
      !a.selected.some((s) => s.label === a.customText)
    ) {
      lines.push(`  ${theme.fg('accent', `✎ ${a.customText}`)}`)
    }
  }
  return lines
}

/** Result lines for any state (collapsed or expanded). */
export function renderResultLines(
  result: AgentToolResult<AskDetails>,
  theme: Theme,
  expanded: boolean,
): string[] {
  const details = result.details
  switch (details.kind) {
    case 'cancelled':
      return [theme.fg('warning', 'Cancelled')]
    case 'error':
      return [theme.fg('warning', details.message)]
    case 'ok':
      return expanded
        ? renderResultOkExpanded(details.results, theme)
        : renderResultOkCollapsed(details.results, theme)
    default: {
      // Foreign details (not produced by this tool version): fall back to
      // the raw text content, one warning line per text block.
      const lines: string[] = []
      for (const item of result.content) {
        if (item.type === 'text') lines.push(flattenToSingleLine(item.text))
      }
      if (lines.length === 0) lines.push('(no content)')
      return lines.map((line) => theme.fg('warning', line))
    }
  }
}

/** Truncate each rendered line to the current terminal width. */
function fitLines(lines: string[], width: number): string[] {
  // Width 0 means "not rendered yet"; the render(width) override rebuilds
  // with the real width before anything is drawn.
  if (width <= 0) return lines
  return lines.map((line) => truncateText(line, width))
}

function makeText(lines: string[]): Component {
  return new Text(lines.join('\n'), 0, 0)
}

/**
 * Component rendering the ask_user_question tool call. Supports host-driven
 * expand/collapse via setExpanded(); the host owns the interaction.
 */
export class AskCallComponent extends Container {
  #args: QuestionParamsSchema
  #expanded: boolean
  #theme: Theme
  #width = 0

  constructor({
    args,
    expanded,
    theme,
  }: {
    args: QuestionParamsSchema
    expanded: boolean
    theme: Theme
  }) {
    super()
    this.#args = args
    this.#expanded = expanded
    this.#theme = theme
    this.rebuild()
  }

  setExpanded(expanded: boolean): void {
    if (this.#expanded === expanded) return
    this.#expanded = expanded
    this.rebuild()
  }

  // Args may be re-parsed by the host on every render; only rebuild when the
  // serialized form actually differs.
  setArgs(args: QuestionParamsSchema): void {
    if (JSON.stringify(args) === JSON.stringify(this.#args)) return
    this.#args = args
    this.rebuild()
  }

  override render(width: number): string[] {
    if (width !== this.#width) {
      this.#width = width
      this.rebuild()
    }
    return super.render(width)
  }

  rebuild(): void {
    this.clear()
    const lines = this.#expanded
      ? renderCallExpanded(this.#args, this.#theme)
      : renderCallCollapsed(this.#args, this.#theme)
    this.addChild(makeText(fitLines(lines, this.#width)))
  }
}

/**
 * Component rendering the ask_user_question tool result. Supports
 * host-driven expand/collapse via setExpanded().
 */
export class AskResultComponent extends Container {
  #result: AgentToolResult<AskDetails>
  #expanded: boolean
  #theme: Theme
  #width = 0

  constructor({
    result,
    expanded,
    theme,
  }: {
    result: AgentToolResult<AskDetails>
    expanded: boolean
    theme: Theme
  }) {
    super()
    this.#result = result
    this.#expanded = expanded
    this.#theme = theme
    this.rebuild()
  }

  setExpanded(expanded: boolean): void {
    if (this.#expanded === expanded) return
    this.#expanded = expanded
    this.rebuild()
  }

  override render(width: number): string[] {
    if (width !== this.#width) {
      this.#width = width
      this.rebuild()
    }
    return super.render(width)
  }

  rebuild(): void {
    this.clear()
    const lines = renderResultLines(this.#result, this.#theme, this.#expanded)
    this.addChild(makeText(fitLines(lines, this.#width)))
  }
}
