import type { Theme } from '@earendil-works/pi-coding-agent'
import type { Component } from '@earendil-works/pi-tui'

import { truncateText } from '../../utils/text.js'
import type { QuestionParamsSchema } from '../schema.js'
import type { QuestionnaireState } from '../state.js'
import { QuestionnaireInputHandler } from './input.js'
import { QuestionnairePreviewPane } from './preview-pane.js'
import { QuestionPaneComponent } from './question-pane.js'

const MAX_PANE_HEIGHT = 20

export class QuestionnaireComponent implements Component {
  private readonly state: QuestionnaireState
  private readonly theme: Theme
  private readonly questionPane: QuestionPaneComponent
  private readonly previewPane: QuestionnairePreviewPane
  private readonly inputHandler: QuestionnaireInputHandler

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
    this.theme = theme
    this.questionPane = new QuestionPaneComponent({
      state,
      params,
      theme,
      subagent,
    })
    this.previewPane = new QuestionnairePreviewPane(theme)
    this.inputHandler = new QuestionnaireInputHandler({
      state,
      params,
      previewPane: this.previewPane,
    })
  }

  render = (width: number): string[] => {
    const totalWidth = Math.max(1, width)
    const previewInfo = this.state.getFocusedPreview()

    const gap = 1
    const leftWidth =
      previewInfo === null
        ? totalWidth
        : Math.max(1, Math.floor((totalWidth - gap) * 0.6))
    const leftLines = this.questionPane.render(leftWidth, MAX_PANE_HEIGHT)

    const rule = this.theme.fg('accent', '─'.repeat(totalWidth))
    if (previewInfo === null) return [rule, ...leftLines, rule]

    const rightWidth = Math.max(1, totalWidth - gap - leftWidth)
    this.previewPane.setPreview(previewInfo.preview, previewInfo.label)
    const rightLines = this.previewPane.render(rightWidth, leftLines.length)

    const separator = this.theme.fg('accent', '│')
    const rows = leftLines.map((line, i) => {
      const left = truncateText(line, leftWidth, { pad: true })
      const right = truncateText(rightLines[i] ?? '', rightWidth, { pad: true })
      return left + separator + right
    })
    return [rule, ...rows, rule]
  }

  invalidate = (): void => {
    this.questionPane.invalidate()
    this.previewPane.invalidate()
  }

  handleInput = (data: string): void => {
    this.inputHandler.handleInput(data)
  }
}
