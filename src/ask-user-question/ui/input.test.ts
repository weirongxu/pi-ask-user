import { type Terminal, TuiMainScreen } from '@earendil-works/pi-tui'
import { describe, expect, it } from 'vitest'

import type { QuestionParamsSchema } from '../schema.js'
import { type QuestionnaireState, createQuestionnaireState } from '../state.js'
import { QuestionnaireInputHandler } from './input.js'
import { QuestionnairePreviewPane } from './preview-pane.js'
import { createStubTheme } from './test-theme.js'

const stubTerminal = (): Terminal => ({
  start: () => {},
  stop: () => {},
  drainInput: async () => {},
  write: () => {},
  get columns() {
    return 80
  },
  get rows() {
    return 24
  },
  get kittyProtocolActive() {
    return false
  },
  moveBy: () => {},
  hideCursor: () => {},
  showCursor: () => {},
  clearLine: () => {},
  clearFromCursor: () => {},
  clearScreen: () => {},
  setTitle: () => {},
  setProgress: () => {},
})

// State auto-appends an "Other:" option as the last option of each question.
const makeHandler = (): {
  handler: QuestionnaireInputHandler
  state: QuestionnaireState
} => {
  const params: QuestionParamsSchema = {
    questions: [
      {
        question: 'Pick one',
        header: 'Tab A',
        options: [{ label: 'A' }, { label: 'B' }],
      },
    ],
  }
  const themeStub = createStubTheme()
  const state = createQuestionnaireState({
    params,
    theme: themeStub,
    tui: new TuiMainScreen(stubTerminal()),
    done: () => {},
  })
  return {
    handler: new QuestionnaireInputHandler({
      state,
      params,
      previewPane: new QuestionnairePreviewPane(themeStub),
    }),
    state,
  }
}

const focusOther = (state: QuestionnaireState): void => {
  state.cursor.optionIndex = state.curQuestion.question.options.length - 1
}

describe('QuestionnaireInputHandler', () => {
  it('inserts a newline in the Other editor for a legacy \\n instead of submitting', () => {
    const { handler, state } = makeHandler()
    focusOther(state)

    handler.handleInput('a')
    handler.handleInput('\n')
    handler.handleInput('b')

    expect(state.curQuestion.customEditor.getText()).toBe('a\nb')
    expect(state.curQuestion.customText).toBeUndefined()
  })

  it('inserts a newline in the Other editor for a kitty shift+enter', () => {
    const { handler, state } = makeHandler()
    focusOther(state)

    handler.handleInput('a')
    handler.handleInput('\x1b[13;2u')
    handler.handleInput('b')

    expect(state.curQuestion.customEditor.getText()).toBe('a\nb')
    expect(state.curQuestion.customText).toBeUndefined()
  })

  it('still commits the Other editor on plain enter', () => {
    const { handler, state } = makeHandler()
    focusOther(state)

    handler.handleInput('a')
    handler.handleInput('\n')
    handler.handleInput('b')
    const slot = state.curQuestion
    handler.handleInput('\r')

    expect(slot.customText).toBe('a\nb')
  })

  it('moves to the next option on Down at the last line of the Other editor', () => {
    const { handler, state } = makeHandler()
    focusOther(state)
    const editor = state.curQuestion.customEditor

    editor.setText('a\nb')
    // Move the editor cursor down to the last logical line before dispatching.
    editor.handleInput('\x1b[B')
    handler.handleInput('\x1b[B')

    // Other is the last option, so focus wraps to the first option.
    expect(state.cursor.optionIndex).toBe(0)
  })

  it('keeps the editor cursor on Down when not at the last line of the Other editor', () => {
    const { handler, state } = makeHandler()
    focusOther(state)
    const editor = state.curQuestion.customEditor

    editor.setText('a\nb')
    // setText parks the cursor at the end; bring it back to the first line.
    editor.handleInput('\x1b[A')
    // Cursor is still on the first line; Down must stay inside the editor.
    handler.handleInput('\x1b[B')

    expect(state.cursor.optionIndex).toBe(
      state.curQuestion.question.options.length - 1,
    )
    expect(editor.getCursor().line).toBe(1)
  })

  it('moves to the previous option on Up at the first line of the Other editor', () => {
    const { handler, state } = makeHandler()
    focusOther(state)

    handler.handleInput('\x1b[A')

    expect(state.cursor.optionIndex).toBe(
      state.curQuestion.question.options.length - 2,
    )
  })

  it('moves to the next option on Down in a single-line Other editor', () => {
    const { handler, state } = makeHandler()
    focusOther(state)

    handler.handleInput('\x1b[B')

    // Other is the last option, so focus wraps to the first option.
    expect(state.cursor.optionIndex).toBe(0)
  })

  it('moves to the previous option on Up in an empty Other editor', () => {
    const { handler, state } = makeHandler()
    focusOther(state)

    handler.handleInput('\x1b[A')

    expect(state.cursor.optionIndex).toBe(
      state.curQuestion.question.options.length - 2,
    )
  })

  it('keeps the editor cursor on Up when not at the first line of the Other editor', () => {
    const { handler, state } = makeHandler()
    focusOther(state)
    const editor = state.curQuestion.customEditor

    editor.setText('a\nb')
    editor.handleInput('\x1b[B')
    handler.handleInput('\x1b[A')

    expect(state.cursor.optionIndex).toBe(
      state.curQuestion.question.options.length - 1,
    )
    expect(editor.getCursor().line).toBe(0)
  })

  it('inserts a newline in the note editor and keeps editing', () => {
    const { handler, state } = makeHandler()
    state.enterOptionNote(0)

    handler.handleInput('a')
    handler.handleInput('\n')
    handler.handleInput('b')

    const noteEditor = state.curQuestion.noteEditors[0]
    expect(noteEditor?.getText()).toBe('a\nb')
    expect(state.curQuestion.editingNoteIndex).toBe(0)
  })

  it('exits note editing on plain enter and saves the multi-line note', () => {
    const { handler, state } = makeHandler()
    state.enterOptionNote(0)

    handler.handleInput('a')
    handler.handleInput('\n')
    handler.handleInput('b')
    handler.handleInput('\r')

    expect(state.curQuestion.editingNoteIndex).toBeNull()
    expect(state.curQuestion.draft[0]?.note).toBe('a\nb')
  })
})
