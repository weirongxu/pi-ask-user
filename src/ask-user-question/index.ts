import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

import { registerAskDemoCommand } from './command/ask-demo.js'
import { registerAskModeCommand } from './command/ask-mode.js'
import { getConfigurationState } from './config.js'
import { createOwner, getOwner, isTuiOwnerSession, setOwner } from './owner.js'
import { createAskUserTool } from './tool.js'

export function registerAskUserQuestion(
  pi: ExtensionAPI,
  options: { demoEnabled: boolean },
): void {
  pi.on('session_start', (_event, ctx) => {
    if (isTuiOwnerSession(ctx)) setOwner(createOwner(pi, ctx))
    if (!getConfigurationState().valid) {
      ctx.ui.notify('ask-user.json is invalid, fallback to defaults', 'warning')
    }
  })
  pi.on('session_shutdown', (_event, ctx) => {
    if (getOwner()?.sessionId === ctx.sessionManager.getSessionId()) {
      setOwner(undefined)
    }
  })
  pi.registerTool(createAskUserTool(getOwner))

  registerAskModeCommand(pi)
  if (options.demoEnabled) registerAskDemoCommand(pi)
}
