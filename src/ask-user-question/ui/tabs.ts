import type { Theme } from '@earendil-works/pi-coding-agent'
import { visibleWidth } from '@earendil-works/pi-tui'

import { truncateText } from '../../utils/text.js'

type Side = 'left' | 'right'

const LEFT_ARROW = '←'
const RIGHT_ARROW = '→'

export type TabStripItem = { name: string; answered: boolean }

type TabsOptions = {
  items: readonly TabStripItem[]
  currentIndex: number
  width: number
  theme: Theme
}

export class Tabs {
  private readonly items: readonly TabStripItem[]
  private readonly currentIndex: number
  private readonly theme: Theme
  private readonly tabWidth: number
  private remain: number = 0
  private tabLine = ''

  constructor({ items, currentIndex, width, theme }: TabsOptions) {
    this.items = items
    this.currentIndex = currentIndex
    this.tabWidth = width
    this.theme = theme
  }

  render = (): string[] => {
    const { items, currentIndex } = this
    const total = items.length
    if (total <= 1) return []

    this.tabLine = ''
    const hasLeft = currentIndex !== 0
    const hasRight = currentIndex < total - 1
    this.remain = this.tabWidth
    if (hasLeft) this.remain -= 1
    if (hasRight) this.remain -= 1

    this.add('right', this.currentPart(), (s) => this.theme.bg('selectedBg', s))

    for (let offset = 1; this.remain > 0; offset++) {
      const rightIndex = currentIndex + offset
      const leftIndex = currentIndex - offset
      if (rightIndex >= total && leftIndex < 0) break
      if (rightIndex < total) {
        if (!this.add('right', ` ${this.tabLabel(rightIndex)}`)) break
      }
      if (leftIndex >= 0) {
        if (!this.add('left', `${this.tabLabel(leftIndex)} `)) break
      }
    }

    if (currentIndex !== 0) this.tabLine = LEFT_ARROW + this.tabLine
    if (currentIndex < total - 1) this.tabLine += RIGHT_ARROW

    return [this.tabLine]
  }

  private add = (
    pos: Side,
    part: string,
    style?: (s: string) => string,
  ): boolean => {
    const partWidth = visibleWidth(part)
    const fits = partWidth <= this.remain
    if (!fits)
      part = truncateText(part, this.remain, {
        direction: pos === 'left' ? 'start' : 'end',
      })
    const styled = style ? style(part) : part
    switch (pos) {
      case 'left':
        this.tabLine = `${styled}${this.tabLine}`
        break
      case 'right':
        this.tabLine = `${this.tabLine}${styled}`
        break
    }
    this.remain -= partWidth
    return fits
  }

  private tabLabel = (i: number): string =>
    `[${(this.items[i]?.answered ?? false) ? '■' : '□'} ${this.items[i]?.name ?? ''}]`

  private currentPart = (): string =>
    `${this.tabLabel(this.currentIndex)} [${this.currentIndex + 1}/${this.items.length}]`
}
