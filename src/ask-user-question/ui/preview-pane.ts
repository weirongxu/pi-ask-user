import type { Theme } from '@earendil-works/pi-coding-agent'
import { Markdown, type MarkdownTheme } from '@earendil-works/pi-tui'

import { flattenToSingleLine, truncateText } from '../../utils/text.js'
import { Pane } from './pane.js'
import { type ScrollMetrics, ScrollView } from './scroll.js'

const scrollHint = (metrics: ScrollMetrics): string =>
  metrics.maxOffset > 0
    ? ` (d/u scroll, ${Math.min(metrics.offset + 1, metrics.total)}/${metrics.total})`
    : ''

const createMarkdownTheme = (theme: Theme): MarkdownTheme => ({
  heading: (text: string) => theme.fg('mdHeading', text),
  link: (text: string) => theme.fg('mdLink', text),
  linkUrl: (text: string) => theme.fg('mdLinkUrl', text),
  code: (text: string) => theme.fg('mdCode', text),
  codeBlock: (text: string) => theme.fg('mdCodeBlock', text),
  codeBlockBorder: (text: string) => theme.fg('mdCodeBlockBorder', text),
  quote: (text: string) => theme.fg('mdQuote', text),
  quoteBorder: (text: string) => theme.fg('mdQuoteBorder', text),
  hr: (text: string) => theme.fg('mdHr', text),
  listBullet: (text: string) => theme.fg('mdListBullet', text),
  bold: (text: string) => theme.bold(text),
  italic: (text: string) => theme.italic(text),
  strikethrough: (text: string) => theme.strikethrough(text),
  underline: (text: string) => theme.underline(text),
})

export class QuestionnairePreviewPane {
  private readonly theme: Theme
  private readonly markdown: Markdown
  private readonly pane: Pane
  private readonly scrollView: ScrollView
  private baseTitle = ''

  constructor(theme: Theme) {
    this.theme = theme
    this.markdown = new Markdown('', 0, 0, createMarkdownTheme(theme), {
      color: (text: string) => theme.fg('muted', text),
    })
    this.scrollView = new ScrollView({ theme })
    this.pane = new Pane({
      theme,
      title: this.renderTitle,
      footer: () => [],
      body: (width, usedHeight) =>
        this.scrollView.render(width, usedHeight, (contentWidth) => ({
          lines: this.renderContent(contentWidth),
        })),
    })
  }

  setPreview = (preview: string, label: string): void => {
    this.markdown.setText(preview)
    this.baseTitle = `Preview: ${flattenToSingleLine(label)}`
  }

  render = (width: number, height: number): string[] => {
    return this.pane.render(width, height)
  }

  private renderTitle = (width: number): string[] => {
    const title = this.baseTitle + scrollHint(this.scrollView.metrics)
    return [
      this.theme.fg('muted', truncateText(title, width, { ellipsis: '…' })),
    ]
  }

  pageDown = (): void => {
    this.scrollView.pageDown()
  }

  pageUp = (): void => {
    this.scrollView.pageUp()
  }

  resetScroll = (): void => {
    this.scrollView.reset()
  }

  invalidate = (): void => {
    this.markdown.invalidate()
  }

  private renderContent = (contentWidth: number): string[] => {
    const paddedWidth = Math.max(1, contentWidth - 2)
    return this.markdown.render(paddedWidth).map((line) => ` ${line}`)
  }
}
