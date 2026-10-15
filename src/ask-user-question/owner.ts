import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent'

import { getConfigurationState } from './config.js'
import type { QuestionParamsSchema, Result } from './schema.js'
import { runQuestionnaire } from './ui/index.js'

export type Owner = {
  sessionId: string
  ask(
    id: string,
    params: QuestionParamsSchema,
    opts: { subagent: boolean },
  ): Promise<Result | null>
}

// NOTE: main and subagent sessions share one extension module instance, so this
// module-level owner bridges asks from any session to the real TUI session.
let owner: Owner | undefined

export function isTuiOwnerSession(ctx: ExtensionContext): boolean {
  return ctx.mode === 'tui' && ctx.hasUI
}

export function getOwner(): Owner | undefined {
  return owner
}

export function setOwner(o: Owner | undefined): void {
  owner = o
}

// NOTE: bindExtensions guarantees session_start fires before any tool execute
// (including after /new, /resume and /fork rebinds), so owner registration
// happens only here.
export function createOwner(pi: ExtensionAPI, ctx: ExtensionContext): Owner {
  return {
    sessionId: ctx.sessionManager.getSessionId(),
    ask: async (id, params, opts) => {
      ctx.ui.setWorkingVisible(false)
      try {
        return await runQuestionnaire({
          ctx,
          events: pi.events,
          id,
          mode: getConfigurationState().configuration.mode,
          params,
          subagent: opts.subagent,
        })
      } finally {
        ctx.ui.setWorkingVisible(true)
      }
    },
  }
}
