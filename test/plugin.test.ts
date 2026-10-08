import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebRuntime from '@deepseek-ai/dsh-web'
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment'
import * as octen from '../src/index.ts'
import { json, startStub, type StubServer } from './helpers.ts'

let stub: StubServer

beforeAll(async () => {
  stub = await startStub()
  stub.respond((request, response) => {
    if (request.path === '/search') {
      json(response, 200, { code: 0, data: { results: [{ title: 'Hit', url: 'https://hit.test', highlight: 'snippet' }] } })
      return
    }
    json(response, 200, { code: 0, data: { results: [{ url: 'https://page.test', status: 'success', title: 'Page', full_content: 'text' }] } })
  })
})
afterAll(async () => { await stub.close() })
beforeEach(() => { stub.seen.length = 0 })

/** Boot `ctx.web` plus this plugin with one config row, as the loader would. */
async function boot(config: Record<string, unknown>, env: Record<string, string> = {}): Promise<Context> {
  const ctx = new Context()
  ctx.provide('launchEnvironment', createLaunchEnvironmentSnapshot([{ source: 'process', values: env }]))
  await ctx.plugin(WebRuntime, {})
  await ctx.plugin(octen, config)
  return ctx
}

describe('plugin', () => {
  it('serves web search and fetch through Octen once registered', async () => {
    const ctx = await boot({ apiKey: 'row-key', baseURL: stub.baseURL })

    const search = await ctx.web.search({ query: 'octen', maxResults: 3 })
    expect(search.sources).toEqual([{ url: 'https://hit.test', title: 'Hit', snippet: 'snippet' }])
    const page = await ctx.web.fetch({ url: 'https://page.test' })
    expect(page.body).toEqual({ kind: 'text', content: '# Page\n\ntext' })

    expect(stub.seen.map(request => [request.path, request.headers['x-api-key']])).toEqual([
      ['/search', 'row-key'],
      ['/extract', 'row-key'],
    ])
    expect(stub.seen[1]?.body).toMatchObject({ timeout: 25 })
    await ctx.fiber.dispose()
  })

  it('resolves the key and the base from the launch environment when the row names neither', async () => {
    const ctx = await boot({ apiKeyEnv: 'TEAM_OCTEN_KEY' }, { TEAM_OCTEN_KEY: 'env-key', OCTEN_API_URL: stub.baseURL })
    await ctx.web.search({ query: 'x' })
    expect(stub.seen[0]?.headers['x-api-key']).toBe('env-key')
    await ctx.fiber.dispose()
  })

  it('prefers the credentials service over the launch environment', async () => {
    const ctx = new Context()
    ctx.provide('launchEnvironment', createLaunchEnvironmentSnapshot([
      { source: 'process', values: { OCTEN_API_KEY: 'env-key', OCTEN_API_URL: stub.baseURL } },
    ]))
    ctx.provide('credentials', { resolve: (ref: string) => Promise.resolve(ref === 'OCTEN_API_KEY' ? { value: 'stored-key' } : undefined) } as never)
    await ctx.plugin(WebRuntime, {})
    await ctx.plugin(octen, {})
    await ctx.web.search({ query: 'x' })
    expect(stub.seen[0]?.headers['x-api-key']).toBe('stored-key')
    await ctx.fiber.dispose()
  })

  it('fails with a credential error when no layer supplies the key', async () => {
    const ctx = await boot({ baseURL: stub.baseURL })
    await expect(ctx.web.search({ query: 'x' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_CREDENTIAL_MISSING' })
    expect(stub.seen).toHaveLength(0)
    await ctx.fiber.dispose()
  })

  it('rejects an out-of-range extraction timeout in the row', async () => {
    const ctx = new Context()
    await ctx.plugin(WebRuntime, {})
    await expect(ctx.plugin(octen, { extractTimeoutSeconds: 120 })).rejects.toThrow()
    await ctx.fiber.dispose()
  })
})
