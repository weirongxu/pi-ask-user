import type { Theme } from '@earendil-works/pi-coding-agent'
import { Editor, type EditorTheme, type TUI } from '@earendil-works/pi-tui'

import type {
  Draft,
  QuestionParamsSchema,
  QuestionSchema,
  Result,
} from './schema.js'
import { buildAnswer } from './schema.js'

export type Cursor = { questionIndex: number; optionIndex: number }

export type QuestionSlot = {
  question: QuestionSchema
  draft: Draft[]
  customText: string | undefined
  customEditor: Editor
  noteEditors: Editor[]
  editingNoteIndex: number | null
}

export interface QuestionnaireState {
  cursor: Cursor
  questions: QuestionSlot[]
  get curQuestion(): QuestionSlot
  get isFinished(): boolean
  get answeredIndices(): Set<number>
  toggleSelect(index: number): void
  enterOptionNote(index: number): void
  exitOptionNote(): void
  updateOptionNote(index: number, text: string): void
  commitOption(): void
  commitCustom(value: string): void
  advance(): void
  requestRender(): void
  getFocusedPreview(): { preview: string; label: string } | null
  switchTab(direction: 'next' | 'prev'): void
  cancel(): void
}

function normalizeQuestions(
  questions: QuestionParamsSchema['questions'],
): QuestionParamsSchema['questions'] {
  return questions.map((q) =>
    q.options[q.options.length - 1]?.isOther !== true
      ? { ...q, options: [...q.options, { label: 'Other:', isOther: true }] }
      : q,
  )
}

function createEditorTheme(theme: Theme): EditorTheme {
  return {
    borderColor: (s: string) => theme.fg('accent', s),
    selectList: {
      selectedPrefix: (t: string) => theme.fg('accent', t),
      selectedText: (t: string) => theme.fg('accent', t),
      description: (t: string) => theme.fg('muted', t),
      scrollInfo: (t: string) => theme.fg('dim', t),
      noMatch: (t: string) => theme.fg('warning', t),
    },
  }
}

function createDraft(optionsCount: number): Draft[] {
  return Array.from({ length: optionsCount }, () => ({ check: false }))
}

function buildSlots(
  questions: QuestionParamsSchema['questions'],
  tui: TUI,
  editorTheme: EditorTheme,
  onSubmitCustom: (value: string) => void,
  onSubmitNote: (index: number, value: string) => void,
): QuestionSlot[] {
  return questions.map((question) => {
    const customEditor = new Editor(tui, editorTheme)
    const draft = createDraft(question.options.length)
    const noteEditors = draft.map(() => new Editor(tui, editorTheme))
    customEditor.onSubmit = onSubmitCustom
    noteEditors.forEach((editor, i) => {
      editor.onSubmit = (value) => {
        onSubmitNote(i, value)
      }
    })
    return {
      question,
      draft,
      customText: undefined,
      customEditor,
      noteEditors,
      editingNoteIndex: null,
    }
  })
}

export function createQuestionnaireState(args: {
  params: QuestionParamsSchema
  theme: Theme
  tui: TUI
  done: (r: Result | null) => void
}): QuestionnaireState {
  const { params, theme, tui, done } = args

  let isFinished = false
  const cursor: Cursor = { questionIndex: 0, optionIndex: 0 }
  const normalizedQuestions = normalizeQuestions(params.questions)
  const editorTheme = createEditorTheme(theme)

  const finish = (r: Result | null): void => {
    if (isFinished) return
    isFinished = true
    done(r)
  }

  const state: QuestionnaireState = {
    cursor,
    questions: [],
    get curQuestion() {
      const slot = this.questions[cursor.questionIndex]
      if (!slot) throw new Error('internal: question index out of range')
      return slot
    },
    get isFinished() {
      return isFinished
    },
    get answeredIndices() {
      const result = new Set<number>()
      this.questions.forEach((slot, i) => {
        if (slot.draft.some((d) => d.check) || slot.customText !== undefined) {
          result.add(i)
        }
      })
      return result
    },
    toggleSelect(index: number) {
      const slot = this.curQuestion
      const draftItem = slot.draft[index]
      if (!draftItem) return
      if (slot.question.multiSelect) {
        draftItem.check = !draftItem.check
      } else {
        slot.draft.forEach((d, i) => {
          d.check = i === index
        })
      }
      this.requestRender()
    },
    enterOptionNote(index: number) {
      const slot = this.curQuestion
      const draftItem = slot.draft[index]
      if (!draftItem) return
      if (!draftItem.check) this.toggleSelect(index)
      slot.editingNoteIndex = index
      this.requestRender()
    },
    exitOptionNote() {
      const slot = this.curQuestion
      const index = slot.editingNoteIndex
      if (index !== null) {
        const editor = slot.noteEditors[index]
        if (editor) editor.onSubmit?.(editor.getText())
      }
      slot.editingNoteIndex = null
      this.requestRender()
    },
    updateOptionNote(index: number, text: string) {
      const slot = this.curQuestion
      const draftItem = slot.draft[index]
      if (!draftItem) return
      draftItem.note = text.trim() || undefined
    },
    commitOption() {
      const slot = this.curQuestion
      if (!slot.question.multiSelect) {
        slot.draft.forEach((d, i) => {
          d.check = i === cursor.optionIndex
        })
      }
      this.curQuestion.customText = undefined
      this.advance()
    },
    commitCustom(value: string) {
      const trimmed = value.trim()
      if (!trimmed) return
      const slot = this.curQuestion
      const q = slot.question
      const lastIndex = q.options.length - 1
      slot.customText = trimmed
      if (!q.multiSelect) {
        slot.draft.forEach((d, i) => {
          d.check = i === lastIndex
        })
      } else {
        const lastDraft = slot.draft[lastIndex]
        if (lastDraft) lastDraft.check = true
      }
      this.advance()
    },
    advance() {
      const answered = this.answeredIndices
      const unansweredIndex = this.questions.findIndex(
        (_, i) => !answered.has(i),
      )
      if (unansweredIndex !== -1) {
        cursor.questionIndex = unansweredIndex
        cursor.optionIndex = 0
        this.requestRender()
        return
      }
      cursor.questionIndex += 1
      cursor.optionIndex = 0
      if (cursor.questionIndex >= this.questions.length) {
        finish({
          results: this.questions.map((s) => ({
            question: s.question,
            answer: buildAnswer(s.draft, s.customText),
          })),
          cancelled: false,
        })
      } else {
        this.requestRender()
      }
    },
    requestRender() {
      if (isFinished) return
      tui.requestRender()
    },
    getFocusedPreview() {
      const q = this.curQuestion.question
      const opt = q.options[this.cursor.optionIndex]
      if (!opt || typeof opt.preview !== 'string') return null
      return { preview: opt.preview, label: opt.label }
    },
    switchTab(direction: 'next' | 'prev') {
      const count = this.questions.length
      if (count <= 1) return
      cursor.questionIndex =
        direction === 'next'
          ? (cursor.questionIndex + 1) % count
          : (cursor.questionIndex - 1 + count) % count
      const slot = this.curQuestion
      const selectedIndex = slot.draft.findIndex((d) => d.check)
      cursor.optionIndex =
        slot.question.multiSelect === false && selectedIndex >= 0
          ? selectedIndex
          : 0
      this.requestRender()
    },
    cancel() {
      finish(null)
    },
  }

  state.questions = buildSlots(
    normalizedQuestions,
    tui,
    editorTheme,
    (value) => {
      state.commitCustom(value)
    },
    (index, value) => {
      state.updateOptionNote(index, value)
    },
  )

  return state
}
