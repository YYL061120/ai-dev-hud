import { describe, it, expect } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { captureClaudeSubscription, readClaudeSubscription } from '../src/local-control/subscriptions.js'
async function* input(value: unknown) { yield Buffer.from(JSON.stringify(value)) }
describe('passive official statusline adapter', () => {
  it.each([72, null])('does not let delayed old capture overwrite a newer observation (%s)', async percentage => {
    const directory = await mkdtemp(join(tmpdir(), 'hud-subscription-race-'))
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    async function* delayed() { await gate; yield JSON.stringify({ rate_limits: { seven_day: { used_percentage: 11 } } }) }
    const old = captureClaudeSubscription(delayed(), directory)
    await new Promise(resolve => setTimeout(resolve, 5))
    await captureClaudeSubscription(input(percentage === null ? {} : { rate_limits: { seven_day: { used_percentage: percentage } } }), directory)
    release(); await old
    expect((await readClaudeSubscription(directory))?.windows.map(window => window.usedPercent)).toEqual(percentage === null ? [] : [72])
  })
  it('persists only the quota allowlist, never prompt/context/cost/credentials, and does not accumulate usage', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hud-subscription-'))
    const fixture = { rate_limits: { seven_day: { used_percentage: 25, resets_at: Math.floor(Date.now() / 1000) + 86400 } }, prompt: 'PRIVATE_PROMPT', credentials: 'PRIVATE_SECRET', context_window: { total_input_tokens: 1000, used_percentage: 80 } }
    await captureClaudeSubscription(input(fixture), directory)
    await captureClaudeSubscription(input(fixture), directory)
    const text = await readFile(join(directory, 'subscription-claude.json'), 'utf8')
    expect(text).not.toMatch(/PRIVATE|context_window|tokens|credentials/)
    expect((await readClaudeSubscription(directory))?.windows).toHaveLength(1)
    expect((await readClaudeSubscription(directory))?.windows[0].usedPercent).toBe(25)
  })
  it('handles absent/malformed capture, bounds stdin, and removes old percentages when a window is absent', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hud-subscription-'))
    expect(await readClaudeSubscription(directory)).toBeUndefined()
    await writeFile(join(directory, 'subscription-claude.json'), 'bad')
    expect(await readClaudeSubscription(directory)).toBeUndefined()
    await expect(captureClaudeSubscription(input('x'.repeat(256 * 1024)), directory)).rejects.toThrow('exceeds limit')
    await captureClaudeSubscription(input({ rate_limits: {} }), directory)
    expect((await readClaudeSubscription(directory))?.windows).toEqual([])
  })
})
