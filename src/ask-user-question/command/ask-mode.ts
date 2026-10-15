import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

import {
  setRenderMode,
  toggleRenderMode,
  type AskUserRenderMode,
  RENDER_MODE_ORDER,
} from '../config.js'
import { isTuiOwnerSession } from '../owner.js'

function isRenderMode(value: string): value is AskUserRenderMode {
  return RENDER_MODE_ORDER.some((mode) => mode === value)
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export function registerAskModeCommand(pi: ExtensionAPI): void {
  pi.registerCommand('ask-user-mode', {
    description: 'Cycle ask_user_question render mode (widget/custom/overlay)',
    getArgumentCompletions: (prefix) => {
      const typed = prefix.trim().toLowerCase()
      return RENDER_MODE_ORDER.filter((mode) => mode.startsWith(typed)).map(
        (mode) => ({
          value: mode,
          label: mode,
        }),
      )
    },
    handler: async (args, ctx) => {
      if (!isTuiOwnerSession(ctx)) {
        ctx.ui.notify('ask-user-mode requires a TUI session', 'warning')
        return
      }
      const requested = args.trim().toLowerCase()
      if (requested !== '' && !isRenderMode(requested)) return
      try {
        const mode =
          requested === '' ? toggleRenderMode() : setRenderMode(requested)
        ctx.ui.notify(`ask-user mode: ${mode}`, 'info')
      } catch (error) {
        ctx.ui.notify(
          `ask-user mode switch failed: ${errorMessage(error)}`,
          'error',
        )
      }
    },
  })
}
