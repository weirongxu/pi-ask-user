import { type Terminal, TuiMainScreen } from '@earendil-works/pi-tui'
import { describe, expect, it, vi } from 'vitest'

import type { QuestionParamsSchema } from '../schema.js'
import { type QuestionnaireState, createQuestionnaireState } from '../state.js'
import { QuestionnaireComponent } from './component.js'
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
  setProgramStatus: () => {},
})

const params: QuestionParamsSchema = {
  questions: [
    {
      question: 'Pick one',
      header: 'Tab A',
      options: [{ label: 'A' }, { label: 'B' }],
    },
  ],
}

const makeState = (): QuestionnaireState =>
  createQuestionnaireState({
    params,
    theme: createStubTheme(),
    tui: new TuiMainScreen(stubTerminal()),
  })

const commitLastQuestion = (state: QuestionnaireState): void => {
  state.commitOption()
}

describe('after finish (stale render/input race)', () => {
  it('getFocusedPreview returns null instead of throwing', () => {
    const state = makeState()
    commitLastQuestion(state)

    expect(state.isFinished).toBe(true)
    expect(state.getFocusedPreview()).toBeNull()
  })

  it('component render returns empty lines and handleInput is a no-op', () => {
    const state = makeState()
    const onFinish = vi.fn()
    const component = new QuestionnaireComponent({
      state,
      params,
      theme: createStubTheme(),
      subagent: false,
      onFinish,
    })
    const handler = new QuestionnaireInputHandler({
      state,
      params,
      previewPane: new QuestionnairePreviewPane(createStubTheme()),
      onFinish,
    })

    expect(component.render(80).length).toBeGreaterThan(0)

    handler.handleInput('\r')
    expect(state.isFinished).toBe(true)
    expect(onFinish).toHaveBeenCalledTimes(1)

    component.render(80)
    component.handleInput('any stale key')
    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(component.render(80)).toEqual([])
  })
})
