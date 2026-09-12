import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent'

import type { QuestionParamsSchema, Result } from './schema.js'
import { runQuestionnaire } from './ui/index.js'

export type Owner = {
  sessionId: string
  ask(id: string, params: QuestionParamsSchema): Promise<Result | null>
}

// NOTE: main and subagent sessions share one extension module instance, so this
// module-level owner bridges asks from any session to the real TUI session.
let owner: Owner | undefined

// NOTE: only a true TUI session (ctx.mode === 'tui' && ctx.hasUI) may register
// as owner (last-wins); non-TUI sessions with UI context (rpc/print subagent
// sessions) must not steal ownership and are always routed to the TUI owner at
// execute time so asks run through ctx.ui.custom.
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
    ask: async (id, params) => {
      ctx.ui.setWorkingVisible(false)
      try {
        return await runQuestionnaire({
          ctx,
          events: pi.events,
          id,
          params,
        })
      } finally {
        ctx.ui.setWorkingVisible(true)
      }
    },
  }
}
