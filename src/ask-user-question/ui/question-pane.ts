import type { Theme } from '@earendil-works/pi-coding-agent'
import { visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui'
import { compact } from 'lodash-es'

import type {
  Draft,
  QuestionOptionSchema,
  QuestionParamsSchema,
} from '../schema.js'
import type { QuestionnaireState } from '../state.js'
import { Pane } from './pane.js'
import { type FocusRange, ScrollView } from './scroll.js'
import { Tabs } from './tabs.js'

const wrapPrefixed = (
  prefix: string,
  text: string,
  width: number,
): string[] => {
  const pw = visibleWidth(prefix)
  if (pw >= width) return wrapTextWithAnsi(prefix + text, width)
  const wrapped = wrapTextWithAnsi(text, width - pw)
  const cont = ' '.repeat(pw)
  return wrapped.map((seg, i) => `${i === 0 ? prefix : cont}${seg}`)
}

// Unfocused editors still render their cursor as ANSI reverse-video blank;
// flatten it to a plain space.
const EDITOR_CURSOR = '\x1b[7m \x1b[0m'

const stripEditorCursor = (line: string): string =>
  line.replaceAll(EDITOR_CURSOR, ' ')

// Aligns wrapped description/note lines under the option label.
const OPTION_BODY_INDENT = '     '
// pointer (2 cols) + checkbox glyph (1 col) + space (1 col)
const OPTION_PREFIX_WIDTH = 4
const NOTE_LABEL = 'Note: '

type RowContext = {
  isFocused: boolean
  rowPrefix: string
  styledLabel: string
}

type OptionRender = {
  row: RowContext
  draftItem: Draft
  opt: QuestionOptionSchema
}

export class QuestionPaneComponent {
  private readonly state: QuestionnaireState
  private readonly params: QuestionParamsSchema
  private readonly theme: Theme
  private readonly pane: Pane
  private readonly scrollView: ScrollView

  private readonly subagent: boolean

  constructor({
    state,
    params,
    theme,
    subagent,
  }: {
    state: QuestionnaireState
    params: QuestionParamsSchema
    theme: Theme
    subagent: boolean
  }) {
    this.state = state
    this.params = params
    this.theme = theme
    this.subagent = subagent
    this.scrollView = new ScrollView({ theme })
    this.pane = new Pane({
      theme,
      title: (width) => this.renderTabs(width),
      footer: (width) => this.renderFooter(width),
      body: (width, usedHeight) => this.renderBody(width, usedHeight),
    })
  }

  render = (width: number, height: number): string[] => {
    this.scrollView.setFocusIndex(this.state.cursor.optionIndex)
    return this.pane.render(width, height)
  }

  invalidate = (): void => {}

  private renderTabs(width: number): string[] {
    const { state, params, theme } = this
    return new Tabs({
      items: params.questions.map((q, i) => ({
        name: q.header,
        answered: state.answeredIndices.has(i),
      })),
      currentIndex: state.cursor.questionIndex,
      width,
      theme,
    }).render()
  }

  private renderQuestion(width: number, lines: string[]): void {
    const { theme, subagent } = this
    const prefix = subagent
      ? ` ${theme.fg('warning', 'subagent')} ${theme.fg('muted', '·')} `
      : ' '
    lines.push(
      ...wrapPrefixed(
        prefix,
        theme.fg('text', this.state.curQuestion.question.question),
        width,
      ),
    )
    lines.push('')
  }

  private renderFooter(width: number): string[] {
    const { params, theme } = this
    const hasMultipleQuestions = params.questions.length > 1
    return [
      '',
      ...wrapPrefixed(
        ' ',
        theme.fg(
          'dim',
          compact([
            '↑↓ navigate',
            'Space toggle',
            'n add note',
            'Enter next',
            'Esc cancel',
            hasMultipleQuestions ? 'Tab/Shift+Tab to jump' : null,
          ]).join(' • '),
        ),
        width,
      ),
    ]
  }

  private renderBody = (width: number, usedHeight: number): string[] =>
    this.scrollView.render(width, usedHeight, (cw) => {
      const lines: string[] = []
      this.renderQuestion(cw, lines)
      const focusRanges = this.renderOptions(cw, lines)
      return { lines, focusRanges }
    })

  private pushEditorLines(
    lines: string[],
    prefix: string,
    editorLines: string[],
  ): void {
    lines.push(`${prefix}${editorLines[0] ?? ''}`)
    const cont = ' '.repeat(visibleWidth(prefix))
    for (const line of editorLines.slice(1)) {
      lines.push(`${cont}${line}`)
    }
  }

  private renderOtherEditor(
    width: number,
    lines: string[],
    row: RowContext,
  ): void {
    const slot = this.state.curQuestion
    const editorWidth = Math.max(
      1,
      width - OPTION_PREFIX_WIDTH - visibleWidth(row.styledLabel) - 1,
    )
    const rawLines = slot.customEditor.render(editorWidth).slice(1, -1)
    const contentLines = row.isFocused
      ? rawLines
      : rawLines.map(stripEditorCursor)
    const hasContent = contentLines.some(
      (line) => line.replace(/\s/g, '').length > 0,
    )

    if (!row.isFocused && !hasContent) {
      lines.push(...wrapPrefixed(row.rowPrefix, row.styledLabel, width))
      return
    }

    this.pushEditorLines(
      lines,
      `${row.rowPrefix}${row.styledLabel} `,
      contentLines,
    )
  }

  private renderNote(
    width: number,
    lines: string[],
    note: string | undefined,
    editorLines: string[],
    isEditing: boolean,
  ): void {
    const indent = ' '.repeat(OPTION_PREFIX_WIDTH)

    if (isEditing) {
      this.pushEditorLines(
        lines,
        `${OPTION_BODY_INDENT}${indent}${NOTE_LABEL}`,
        editorLines,
      )
      return
    }

    if (note) {
      lines.push(
        ...wrapPrefixed(
          `${OPTION_BODY_INDENT}${indent}`,
          this.theme.fg('muted', `${NOTE_LABEL}${note}`),
          width,
        ),
      )
    }
  }

  private optionContext(i: number): OptionRender | null {
    const { state, theme } = this
    const slot = state.curQuestion
    const draftItem = slot.draft[i]
    const opt = slot.question.options[i]
    if (!draftItem || !opt) return null

    const isMulti = slot.question.multiSelect === true

    const isFocused = i === state.cursor.optionIndex
    const isSelected = draftItem.check
    const pointer = isFocused ? theme.fg('accent', '❯ ') : '  '
    const glyph = isMulti ? (isSelected ? '■' : '□') : isSelected ? '●' : '○'
    const box = theme.fg(isSelected ? 'accent' : 'muted', glyph)
    const rowPrefix = `${pointer}${box} `
    const label = opt.isOther === true ? 'Other:' : `${i + 1}. ${opt.label}`
    const styledLabel = isFocused
      ? theme.fg('accent', theme.bold(label))
      : label

    return {
      row: {
        isFocused,
        rowPrefix,
        styledLabel,
      },
      draftItem,
      opt,
    }
  }

  private renderOption(width: number, lines: string[], i: number): void {
    const slot = this.state.curQuestion
    const item = this.optionContext(i)
    if (!item) return
    const { row, draftItem, opt } = item

    if (opt.isOther === true) {
      this.renderOtherEditor(width, lines, row)
    } else {
      lines.push(...wrapPrefixed(row.rowPrefix, row.styledLabel, width))
    }

    if (opt.description) {
      lines.push(
        ...wrapPrefixed(
          OPTION_BODY_INDENT,
          this.theme.fg('muted', opt.description),
          width,
        ),
      )
    }

    const isEditingNote = slot.editingNoteIndex === i
    if (!isEditingNote && !draftItem.note) return

    const editor = slot.noteEditors[i]
    if (!editor) return
    const noteEditorWidth = Math.max(
      1,
      width -
        OPTION_PREFIX_WIDTH -
        OPTION_BODY_INDENT.length -
        visibleWidth(NOTE_LABEL),
    )
    this.renderNote(
      width,
      lines,
      draftItem.note,
      editor.render(noteEditorWidth).slice(1, -1),
      isEditingNote,
    )
  }

  private renderOptions(width: number, lines: string[]): FocusRange[] {
    const ranges: FocusRange[] = []
    for (const [i] of this.state.curQuestion.question.options.entries()) {
      const start = lines.length
      this.renderOption(width, lines, i)
      ranges.push({ start, end: lines.length })
    }
    lines.push('')
    return ranges
  }
}
