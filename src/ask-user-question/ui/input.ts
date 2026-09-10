import { Key, matchesKey } from '@earendil-works/pi-tui'

import type { QuestionParamsSchema } from '../schema.js'
import type { QuestionnaireState } from '../state.js'
import type { QuestionnairePreviewPane } from './preview-pane.js'

const KEYMAP = {
  'option.prev': [Key.up, Key.ctrl('p'), 'k'],
  'option.next': [Key.down, Key.ctrl('n'), 'j'],
  'tab.next': [Key.tab, Key.right, 'l'],
  'tab.prev': ['shift+tab', Key.left, 'h'],
  'preview.scrollDown': ['d'],
  'preview.scrollUp': ['u'],
} as const

type Action = keyof typeof KEYMAP

export class QuestionnaireInputHandler {
  private readonly state: QuestionnaireState
  private readonly params: QuestionParamsSchema
  private readonly previewPane: QuestionnairePreviewPane

  constructor({
    state,
    params,
    previewPane,
  }: {
    state: QuestionnaireState
    params: QuestionParamsSchema
    previewPane: QuestionnairePreviewPane
  }) {
    this.state = state
    this.params = params
    this.previewPane = previewPane
  }

  handleInput = (data: string): void => {
    const { state } = this
    const q = state.curQuestion.question
    const option = q.options[state.cursor.optionIndex]
    const isOtherOption = option?.isOther === true
    const isEditingNote = state.curQuestion.editingNoteIndex !== null

    if (isEditingNote) {
      this.handleNoteInput(data)
      return
    }

    if (isOtherOption) {
      this.handleOtherOptionInput(data)
      return
    }

    if (this.handlePreviewScrollInput(data)) return

    if (this.handleNormalOptionInput(data)) {
      return
    }

    this.handleTabNavigation(data, this.params.questions.length)
  }

  private matches(data: string, action: Action): boolean {
    return KEYMAP[action].some((key) => matchesKey(data, key))
  }

  private handlePreviewScrollInput(data: string): boolean {
    if (this.state.getFocusedPreview() === null) return false
    if (this.matches(data, 'preview.scrollDown')) {
      this.previewPane.pageDown()
      return true
    }
    if (this.matches(data, 'preview.scrollUp')) {
      this.previewPane.pageUp()
      return true
    }
    return false
  }

  // Branch order: cancel/clear -> submit (exit edit) -> fall through to editor
  private handleNoteInput(data: string): boolean {
    const { state } = this
    const slot = state.curQuestion
    const noteIndex = slot.editingNoteIndex
    if (noteIndex === null) return false

    const editor = slot.noteEditors[noteIndex]
    if (!editor) return false

    if (matchesKey(data, Key.escape)) {
      if (editor.getText().length > 0) {
        editor.setText('')
        state.requestRender()
      } else {
        state.exitOptionNote()
      }
      return true
    }

    if (matchesKey(data, Key.enter)) {
      state.exitOptionNote()
      return true
    }

    editor.handleInput(data)
    state.requestRender()
    return true
  }

  // Branch order: cursor move -> tab switch -> cancel/clear -> submit -> editor
  private handleOtherOptionInput(data: string): boolean {
    const { state, params } = this
    const q = state.curQuestion.question
    const editor = state.curQuestion.customEditor
    const isOtherNextTab = matchesKey(data, Key.tab)
    const isOtherPrevTab = matchesKey(data, 'shift+tab')

    if (matchesKey(data, Key.up) && editor.getCursor().line === 0) {
      state.cursor.optionIndex =
        (state.cursor.optionIndex - 1 + q.options.length) % q.options.length
      this.resetPreviewScroll()
      state.requestRender()
      return true
    }

    if (params.questions.length > 1) {
      if (isOtherNextTab) {
        this.resetPreviewScroll()
        state.switchTab('next')
        return true
      }
      if (isOtherPrevTab) {
        this.resetPreviewScroll()
        state.switchTab('prev')
        return true
      }
    }

    if (matchesKey(data, Key.escape)) {
      if (editor.getText().length > 0) {
        editor.setText('')
        state.requestRender()
      } else {
        state.cancel()
      }
      return true
    }

    if (matchesKey(data, Key.enter)) {
      const text = editor.getText()
      if (text.trim().length > 0) {
        state.commitCustom(text)
      } else if (q.multiSelect === true) {
        state.commitOption()
      }
      return true
    }

    editor.handleInput(data)
    state.requestRender()
    return true
  }

  // Branch order: cursor move -> cancel -> select -> note -> submit
  private handleNormalOptionInput(data: string): boolean {
    const { state } = this
    const slot = state.curQuestion
    const q = slot.question
    const optionCount = q.options.length

    if (this.matches(data, 'option.prev') && optionCount > 1) {
      state.cursor.optionIndex =
        (state.cursor.optionIndex - 1 + optionCount) % optionCount
      this.resetPreviewScroll()
      state.requestRender()
      return true
    }

    if (this.matches(data, 'option.next') && optionCount > 1) {
      state.cursor.optionIndex = (state.cursor.optionIndex + 1) % optionCount
      this.resetPreviewScroll()
      state.requestRender()
      return true
    }

    if (matchesKey(data, Key.escape)) {
      state.cancel()
      return true
    }

    if (matchesKey(data, Key.space)) {
      state.toggleSelect(state.cursor.optionIndex)
      return true
    }

    if (matchesKey(data, 'n')) {
      state.enterOptionNote(state.cursor.optionIndex)
      return true
    }

    if (matchesKey(data, Key.enter)) {
      this.resetPreviewScroll()
      state.commitOption()
      return true
    }

    return false
  }

  // Branch order: tab switch (next -> prev)
  private handleTabNavigation(data: string, questionCount: number): boolean {
    const { state } = this
    if (questionCount <= 1) {
      return false
    }

    if (this.matches(data, 'tab.next')) {
      this.resetPreviewScroll()
      state.switchTab('next')
      return true
    }

    if (this.matches(data, 'tab.prev')) {
      this.resetPreviewScroll()
      state.switchTab('prev')
      return true
    }

    return false
  }

  // preview scroll is a manual d/u offset, so it must be cleared on cursor
  // moves; the question list is safe without reset: setFocusIndex before each
  // render and ScrollView.nextOffset() clamps via ensureVisible.
  private resetPreviewScroll(): void {
    this.previewPane.resetScroll()
  }
}
