import { visibleWidth } from '@earendil-works/pi-tui'
import { describe, expect, it } from 'vitest'

import { truncateText } from './text.js'

describe('truncateText with direction start', () => {
  it('never exceeds maxWidth for wide characters', () => {
    for (let width = 1; width <= 12; width++) {
      const result = truncateText('中文标签甲', width, { direction: 'start' })
      expect(visibleWidth(result)).toBeLessThanOrEqual(width)
    }
  })

  it('drops one extra char instead of overshooting the target', () => {
    // With ellipsis '…' (width 1) and maxWidth 4, the target is 3: keeping
    // the 2-wide tail char would overshoot, so it is dropped too.
    expect(
      truncateText('中文标签甲', 4, { ellipsis: '…', direction: 'start' }),
    ).toBe('…甲')
  })
})
