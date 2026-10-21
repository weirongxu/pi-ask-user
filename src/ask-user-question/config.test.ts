import { mkdtempSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  getConfigurationState,
  setRenderMode,
  toggleRenderMode,
} from './config.js'

type Config = {
  getConfigurationState: typeof getConfigurationState
  toggleRenderMode: typeof toggleRenderMode
  setRenderMode: typeof setRenderMode
}

let agentDir: string | undefined

async function loadConfig(dir?: string): Promise<Config> {
  agentDir = dir ?? agentDir ?? mkdtempSync(join(tmpdir(), 'pi-ask-user-test-'))
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDir)
  vi.resetModules()
  return await import('./config.js')
}

afterEach(() => {
  agentDir = undefined
  vi.unstubAllEnvs()
})

async function writeRaw(content: string): Promise<string> {
  if (!agentDir) throw new Error('config module not loaded')
  const path = join(agentDir, 'ask-user.json')
  writeFileSync(path, content, 'utf8')
  return path
}

describe('module-load read', () => {
  it('uses default custom when the file is missing', async () => {
    const config = await loadConfig()
    expect(config.getConfigurationState()).toEqual({
      configuration: { mode: 'custom' },
      valid: true,
    })
  })

  it('uses default widget when the mode field is missing', async () => {
    await loadConfig()
    await writeRaw(JSON.stringify({ configuration: {}, valid: true }))
    const config = await loadConfig()
    expect(config.getConfigurationState()).toEqual({
      configuration: { mode: 'widget' },
      valid: true,
    })
  })

  it('reads mode overlay', async () => {
    await loadConfig()
    await writeRaw(
      JSON.stringify({ configuration: { mode: 'overlay' }, valid: true }),
    )
    const config = await loadConfig()
    expect(config.getConfigurationState()).toEqual({
      configuration: { mode: 'overlay' },
      valid: true,
    })
  })

  it('reads mode custom', async () => {
    await loadConfig()
    await writeRaw(
      JSON.stringify({ configuration: { mode: 'custom' }, valid: true }),
    )
    const config = await loadConfig()
    expect(config.getConfigurationState()).toEqual({
      configuration: { mode: 'custom' },
      valid: true,
    })
  })
})

describe('invalid fallback', () => {
  it('reports invalid state on broken JSON and keeps the file untouched', async () => {
    await loadConfig()
    const broken = '{oops'
    const path = await writeRaw(broken)
    const config = await loadConfig()
    expect(config.getConfigurationState()).toEqual({
      configuration: { mode: 'custom' },
      valid: false,
    })
    expect(await readFile(path, 'utf8')).toBe(broken)
  })

  it('reports invalid state on an illegal mode value and keeps the file untouched', async () => {
    await loadConfig()
    const broken = JSON.stringify({
      configuration: { mode: 'bogus' },
      valid: true,
    })
    const path = await writeRaw(broken)
    const config = await loadConfig()
    expect(config.getConfigurationState()).toEqual({
      configuration: { mode: 'custom' },
      valid: false,
    })
    expect(await readFile(path, 'utf8')).toBe(broken)
  })

  it('reports invalid state on a legacy boolean config file', async () => {
    await loadConfig()
    const legacy = JSON.stringify({ overlay: true })
    await writeRaw(legacy)
    const config = await loadConfig()
    expect(config.getConfigurationState()).toEqual({
      configuration: { mode: 'custom' },
      valid: false,
    })
    if (!agentDir) throw new Error('config module not loaded')
    expect(await readFile(join(agentDir, 'ask-user.json'), 'utf8')).toBe(legacy)
  })
})

describe('toggleRenderMode persistence', () => {
  it('cycles custom -> overlay -> widget -> custom, persisting each step', async () => {
    await loadConfig()
    await writeRaw('{oops')
    const config = await loadConfig()
    expect(config.getConfigurationState()).toEqual({
      configuration: { mode: 'custom' },
      valid: false,
    })
    expect(config.toggleRenderMode()).toBe('overlay')
    if (!agentDir) throw new Error('config module not loaded')
    expect(
      JSON.parse(await readFile(join(agentDir, 'ask-user.json'), 'utf8')),
    ).toEqual({ configuration: { mode: 'overlay' }, valid: true })
    expect(config.toggleRenderMode()).toBe('widget')
    if (!agentDir) throw new Error('config module not loaded')
    expect(
      JSON.parse(await readFile(join(agentDir, 'ask-user.json'), 'utf8')),
    ).toEqual({ configuration: { mode: 'widget' }, valid: true })
    expect(config.toggleRenderMode()).toBe('custom')
    if (!agentDir) throw new Error('config module not loaded')
    expect(
      JSON.parse(await readFile(join(agentDir, 'ask-user.json'), 'utf8')),
    ).toEqual({ configuration: { mode: 'custom' }, valid: true })
    const reloaded = await loadConfig()
    expect(reloaded.getConfigurationState()).toEqual({
      configuration: { mode: 'custom' },
      valid: true,
    })
    expect(reloaded.toggleRenderMode()).toBe('overlay')
  })

  it('creates the agent dir recursively when missing', async () => {
    await loadConfig()
    if (!agentDir) throw new Error('config module not loaded')
    const nested = join(agentDir, 'nested', 'agent')
    const config = await loadConfig(nested)
    expect(config.toggleRenderMode()).toBe('overlay')
    expect(
      JSON.parse(await readFile(join(nested, 'ask-user.json'), 'utf8')),
    ).toEqual({ configuration: { mode: 'overlay' }, valid: true })
  })

  it('honors a stored valid: false flag', async () => {
    await loadConfig()
    await writeRaw(
      JSON.stringify({ configuration: { mode: 'custom' }, valid: false }),
    )
    const config = await loadConfig()
    expect(config.getConfigurationState()).toEqual({
      configuration: { mode: 'custom' },
      valid: false,
    })
  })

  it('throws and keeps state unchanged when writing fails', async () => {
    const base = mkdtempSync(join(tmpdir(), 'pi-ask-user-test-'))
    const blocked = join(base, 'blocked')
    writeFileSync(blocked, '', 'utf8')
    const config = await loadConfig(blocked)
    expect(config.getConfigurationState()).toEqual({
      configuration: { mode: 'custom' },
      valid: true,
    })
    expect(() => config.toggleRenderMode()).toThrow()
    expect(config.getConfigurationState()).toEqual({
      configuration: { mode: 'custom' },
      valid: true,
    })
  })
})

describe('setRenderMode persistence', () => {
  it('sets and persists a specific mode', async () => {
    await loadConfig()
    const config = await loadConfig()
    expect(config.setRenderMode('overlay')).toBe('overlay')
    expect(config.getConfigurationState()).toEqual({
      configuration: { mode: 'overlay' },
      valid: true,
    })
    if (!agentDir) throw new Error('config module not loaded')
    expect(
      JSON.parse(await readFile(join(agentDir, 'ask-user.json'), 'utf8')),
    ).toEqual({ configuration: { mode: 'overlay' }, valid: true })
  })

  it('persists without error when setting the same mode', async () => {
    await loadConfig()
    const config = await loadConfig()
    expect(config.setRenderMode('widget')).toBe('widget')
    expect(config.setRenderMode('widget')).toBe('widget')
    expect(config.getConfigurationState()).toEqual({
      configuration: { mode: 'widget' },
      valid: true,
    })
  })
})
