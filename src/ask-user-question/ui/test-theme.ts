import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Theme } from '@earendil-works/pi-coding-agent'

type ColorMode = 'truecolor' | '256color'

interface InternalThemeModule {
  loadThemeFromPath(themePath: string, mode?: ColorMode): Theme
}

/**
 * Load pi's built-in dark theme with an explicit 'truecolor' mode, so the
 * resulting ANSI output is deterministic regardless of the test terminal's
 * color capabilities. Tests must strip ANSI before asserting on text.
 */
async function loadRealDarkTheme(): Promise<Theme> {
  // The internal theme module (loadThemeFromPath) is not re-exported from the
  // package root, so resolve it from the installed package's dist directory.
  const pkgEntry = import.meta.resolve('@earendil-works/pi-coding-agent')
  const themeDir = join(
    dirname(fileURLToPath(pkgEntry)),
    'modes/interactive/theme',
  )
  const themeModule: InternalThemeModule = await import(
    join(themeDir, 'theme.js')
  )
  return themeModule.loadThemeFromPath(join(themeDir, 'dark.json'), 'truecolor')
}

const realDarkTheme = await loadRealDarkTheme()

export const createStubTheme = (): Theme => realDarkTheme

export const stripAnsi = (text: string): string =>
  text.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '')
