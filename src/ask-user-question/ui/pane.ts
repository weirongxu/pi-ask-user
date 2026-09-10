import type { Theme } from '@earendil-works/pi-coding-agent'

export interface PaneOptions {
  theme: Theme
  title: (width: number) => string[]
  footer: (width: number) => string[]
  body: (width: number, usedHeight: number) => string[]
}

/** Frame: pinned title + rule, body viewport, pinned footer. */
export class Pane {
  private readonly theme: Theme
  private readonly title: (width: number) => string[]
  private readonly footer: (width: number) => string[]
  private readonly body: (width: number, usedHeight: number) => string[]

  constructor(opts: PaneOptions) {
    this.theme = opts.theme
    this.title = opts.title
    this.footer = opts.footer
    this.body = opts.body
  }

  render = (width: number, height: number): string[] => {
    const titleLines = this.title(width)
    const ruleLines =
      titleLines.length > 0 ? [this.theme.fg('accent', '─'.repeat(width))] : []
    const footerLines = this.footer(width)
    const budget = this.bodyBudget(
      height,
      titleLines.length,
      ruleLines.length,
      footerLines.length,
    )
    return [
      ...titleLines,
      ...ruleLines,
      ...this.body(width, budget),
      ...footerLines,
    ]
  }

  private bodyBudget = (
    height: number,
    title: number,
    rule: number,
    footer: number,
  ): number => Math.max(1, height - title - rule - footer)
}
