import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { getAgentDir } from '@earendil-works/pi-coding-agent'
import Type, { type Static } from 'typebox'
import { Check } from 'typebox/value'

const configSchema = Type.Object({
  mode: Type.Optional(
    Type.Union([
      Type.Literal('widget'),
      Type.Literal('custom'),
      Type.Literal('overlay'),
    ]),
  ),
})

const stateSchema = Type.Object({
  configuration: configSchema,
  valid: Type.Boolean(),
})

type AskUserConfiguration = Required<Static<typeof configSchema>>

export type AskUserRenderMode = AskUserConfiguration['mode']

type ConfigurationState = {
  configuration: AskUserConfiguration
  valid: boolean
}

const defaultConfiguration: AskUserConfiguration = Object.freeze({
  mode: 'custom',
})

const configPath = join(getAgentDir(), 'ask-user.json')

function loadConfiguration(): ConfigurationState {
  if (!existsSync(configPath)) {
    return { configuration: defaultConfiguration, valid: true }
  }
  try {
    const raw = readFileSync(configPath, 'utf8')
    const value: unknown = JSON.parse(raw)
    if (!Check(stateSchema, value)) throw new Error('invalid config state')
    return {
      configuration: { mode: value.configuration.mode ?? 'widget' },
      valid: value.valid,
    }
  } catch {
    return { configuration: defaultConfiguration, valid: false }
  }
}

const state = loadConfiguration()

export function getConfigurationState(): ConfigurationState {
  return state
}

export const RENDER_MODE_ORDER = ['widget', 'custom', 'overlay'] as const

function commitRenderMode(nextMode: AskUserRenderMode): AskUserRenderMode {
  const previous = { ...state }
  state.configuration = { mode: nextMode }
  state.valid = true
  try {
    writeConfiguration()
  } catch (error) {
    state.configuration = previous.configuration
    state.valid = previous.valid
    throw error
  }
  return nextMode
}

export function toggleRenderMode(): AskUserRenderMode {
  const currentIndex = RENDER_MODE_ORDER.indexOf(state.configuration.mode)
  const nextIndex = (currentIndex + 1) % RENDER_MODE_ORDER.length
  return commitRenderMode(RENDER_MODE_ORDER[nextIndex] ?? 'widget')
}

export function setRenderMode(mode: AskUserRenderMode): AskUserRenderMode {
  return commitRenderMode(mode)
}

function writeConfiguration(): void {
  const path = configPath
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}
