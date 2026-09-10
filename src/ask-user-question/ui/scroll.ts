import type { Theme } from '@earendil-works/pi-coding-agent'

import { truncateText } from '../../utils/text.js'

export interface FocusRange {
  start: number
  end: number
}

export interface ScrollMetrics {
  total: number
  offset: number
  maxOffset: number
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

const ensureVisible = (
  offset: number,
  start: number,
  end: number,
  visible: number,
): number => {
  if (end - start > visible) return start
  if (start < offset) return start
  if (end > offset + visible) return end - visible
  return offset
}

const thumbMetrics = (
  total: number,
  visible: number,
  offset: number,
  maxOffset: number,
): { len: number; start: number } => {
  const len = Math.max(1, Math.floor((visible * visible) / total))
  const start = Math.round((offset / Math.max(1, maxOffset)) * (visible - len))
  return { len, start }
}

const EMPTY_METRICS: ScrollMetrics = {
  total: 0,
  offset: 0,
  maxOffset: 0,
}

export class ScrollView {
  private readonly theme: Theme
  private focusIndex: number | null = null
  private offset = 0
  private scrollStep = 0
  metrics: ScrollMetrics = EMPTY_METRICS

  constructor(opts: { theme: Theme }) {
    this.theme = opts.theme
  }

  render = (
    width: number,
    height: number,
    build: (contentWidth: number) => {
      lines: string[]
      focusRanges?: FocusRange[]
    },
  ): string[] => {
    const contentWidth = Math.max(1, width - 1)
    const { lines, focusRanges: ranges = [] } = build(contentWidth)

    const visible = Math.max(1, height)
    const total = lines.length
    const maxOffset = Math.max(0, total - visible)
    this.offset = this.nextOffset(ranges, visible, maxOffset)
    this.scrollStep = Math.max(1, Math.floor(visible / 2))
    this.metrics = {
      total,
      offset: this.offset,
      maxOffset,
    }
    if (maxOffset === 0) return lines

    const { len, start } = thumbMetrics(total, visible, this.offset, maxOffset)
    const from = this.offset
    return lines
      .slice(from, from + visible)
      .map((line, row) => this.decorate(line, contentWidth, start, len, row))
  }

  setFocusIndex = (index: number | null): void => {
    this.focusIndex = index
  }

  scrollBy = (delta: number): void => {
    this.offset = clamp(this.offset + delta, 0, this.metrics.maxOffset)
  }

  pageDown = (): void => {
    this.scrollBy(this.scrollStep)
  }

  pageUp = (): void => {
    this.scrollBy(-this.scrollStep)
  }

  reset = (): void => {
    this.offset = 0
  }

  private nextOffset = (
    focusRanges: FocusRange[],
    visible: number,
    maxOffset: number,
  ): number => {
    const range =
      this.focusIndex === null ? undefined : focusRanges[this.focusIndex]
    if (!range) return clamp(this.offset, 0, maxOffset)
    return clamp(
      ensureVisible(this.offset, range.start, range.end, visible),
      0,
      maxOffset,
    )
  }

  private decorate = (
    line: string,
    contentWidth: number,
    thumbStart: number,
    thumbLen: number,
    row: number,
  ): string => {
    const text = truncateText(line, contentWidth, { pad: true })
    const bar =
      row >= thumbStart && row < thumbStart + thumbLen
        ? this.theme.fg('accent', '▐')
        : this.theme.fg('dim', '░')
    return text + bar
  }
}
