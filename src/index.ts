import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

import { registerAskUserQuestion } from './ask-user-question/index.js'

export default async function (pi: ExtensionAPI) {
  registerAskUserQuestion(pi, { demoEnabled: process.env.PI_DEMO === '1' })
}
