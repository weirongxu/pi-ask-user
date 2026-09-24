import { type Static, Type } from 'typebox'
import { Value } from 'typebox/value'

import { flattenToSingleLine } from '../utils/text.js'

export const MIN_QUESTIONS = 1
export const MAX_QUESTIONS = 10
export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 10

export const QuestionOptionSchema = Type.Object({
  label: Type.String(),
  description: Type.Optional(Type.String()),
  preview: Type.Optional(Type.String()),
  isOther: Type.Optional(Type.Boolean()),
})

export const QuestionSchema = Type.Object({
  question: Type.String(),
  // FIXME: 改成 header 是不是好点？深度调查一下是不是其他 agent 都是用 header 的
  tabName: Type.String(),
  options: Type.Array(QuestionOptionSchema),
  multiSelect: Type.Optional(Type.Boolean()),
})

export const QuestionParamsSchema = Type.Object({
  questions: Type.Array(QuestionSchema),
})

export type QuestionOptionSchema = Static<typeof QuestionOptionSchema>
export type QuestionSchema = Static<typeof QuestionSchema>
export type QuestionParamsSchema = Static<typeof QuestionParamsSchema>
export type Selection = { index: number; label: string; note?: string }

export interface Answer {
  customText: string | undefined
  selected: Selection[]
}

export interface Draft {
  check: boolean
  label: string
  isOther: boolean
  note?: string
}

export interface QuestionResult {
  question: QuestionSchema
  answer: Answer
}

export interface Result {
  results: QuestionResult[]
  cancelled: boolean
}

export function parseParams(
  input: unknown,
): { ok: true; value: QuestionParamsSchema } | { ok: false; error: string } {
  if (!Value.Check(QuestionParamsSchema, input)) {
    const errors = Value.Errors(QuestionParamsSchema, input)
    return { ok: false, error: errors[0]?.message ?? 'Invalid parameters.' }
  }
  const qs = input.questions
  if (qs.length < MIN_QUESTIONS || qs.length > MAX_QUESTIONS) {
    return {
      ok: false,
      error: `Expected ${MIN_QUESTIONS}–${MAX_QUESTIONS} questions.`,
    }
  }
  for (const q of qs) {
    const opts = q.options
    if (opts.length < MIN_OPTIONS || opts.length > MAX_OPTIONS) {
      return {
        ok: false,
        error: `Each question must have ${MIN_OPTIONS}–${MAX_OPTIONS} options.`,
      }
    }
  }
  return { ok: true, value: normalizeOptionLabels(input) }
}

// Normalize option labels so downstream list rendering never receives raw
// newlines; long labels wrap via wrapPrefixed instead of breaking the layout.
function normalizeOptionLabels(
  params: QuestionParamsSchema,
): QuestionParamsSchema {
  return {
    questions: params.questions.map((q) => ({
      ...q,
      options: q.options.map((opt) => ({
        ...opt,
        label: flattenToSingleLine(opt.label),
      })),
    })),
  }
}

export function buildAnswer(
  draft: Draft[],
  customText: string | undefined,
): Answer {
  const selected: Selection[] = []
  for (const [i, d] of draft.entries()) {
    if (!d.check) continue
    const label = d.isOther && customText !== undefined ? customText : d.label
    selected.push({ index: i, label, note: d.note })
  }
  return { customText, selected }
}
