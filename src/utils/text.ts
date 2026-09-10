import { visibleWidth } from '@earendil-works/pi-tui'

const flatten = (text: string): string => text.replace(/\s*[\r\n]+\s*/g, ' ')

export function flattenToSingleLine(text: string): string {
  return flatten(text).trim()
}

type TruncateOptions = {
  ellipsis?: string
  pad?: boolean
  direction?: 'start' | 'end'
}

export function truncateText(
  text: string,
  maxWidth: number,
  { ellipsis = '', pad = false, direction = 'end' }: TruncateOptions = {},
): string {
  if (maxWidth <= 0) return ''

  // Truncation only works on single-line text: visibleWidth() counts '\n' as
  // zero-width, which would defeat truncation. Like flattenToSingleLine() but
  // without trimming, to preserve leading indentation of rendered lines.
  const flat = flatten(text)

  const textWidth = visibleWidth(flat)
  if (textWidth <= maxWidth) {
    return pad ? flat + ' '.repeat(maxWidth - textWidth) : flat
  }

  const ellipsisWidth = visibleWidth(ellipsis)
  const targetWidth = maxWidth - ellipsisWidth

  if (targetWidth <= 0) {
    if (ellipsisWidth <= maxWidth) {
      return pad ? ellipsis + ' '.repeat(maxWidth - ellipsisWidth) : ellipsis
    }
    return truncateText(ellipsis, maxWidth, { pad, direction })
  }

  const entries: Array<{ char: string; width: number }> = []
  let total = 0
  for (const char of flat) {
    const width = visibleWidth(char)
    entries.push({ char, width })
    total += width
  }

  let kept = ''
  let keptWidth = 0
  switch (direction) {
    case 'start': {
      const cutTarget = total - targetWidth
      let cut = 0
      let dropped = 0
      for (const { width } of entries) {
        if (cut + width <= cutTarget) {
          cut += width
          dropped++
        } else {
          break
        }
      }
      kept =
        ellipsis +
        entries
          .slice(dropped)
          .map((e) => e.char)
          .join('')
      keptWidth = ellipsisWidth + (total - cut)
      break
    }
    case 'end': {
      let used = 0
      let count = 0
      for (const { width } of entries) {
        if (used + width > targetWidth) break
        used += width
        count++
      }
      kept =
        entries
          .slice(0, count)
          .map((e) => e.char)
          .join('') + ellipsis
      keptWidth = used + ellipsisWidth
      break
    }
  }

  if (pad && keptWidth < maxWidth) {
    kept += ' '.repeat(maxWidth - keptWidth)
  }

  return kept
}
