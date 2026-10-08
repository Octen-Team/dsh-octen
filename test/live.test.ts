/** Real calls to api.octen.ai. Runs only with OCTEN_LIVE=1 and OCTEN_API_KEY set (`pnpm run test:live`). */

import { describe, expect, it } from 'vitest'
import { OCTEN_DEFAULT_BASE_URL, OctenFetchProvider, OctenSearchProvider, type OctenProviderOptions } from '../src/provider.ts'

const apiKey = process.env.OCTEN_API_KEY ?? ''
const live = process.env.OCTEN_LIVE === '1' && apiKey.length > 0

const options = (): OctenProviderOptions => ({
  apiKey,
  apiKeyEnv: 'OCTEN_API_KEY',
  baseURL: process.env.OCTEN_API_URL ?? OCTEN_DEFAULT_BASE_URL,
  extractTimeoutSeconds: 25,
})

describe.skipIf(!live)('live Octen API', () => {
  it('searches', async () => {
    const result = await new OctenSearchProvider(options).search({ query: 'DeepSeek Harness web search plugin', maxResults: 3 })
    expect(result.sources.length).toBeGreaterThan(0)
    expect(result.sources.length).toBeLessThanOrEqual(3)
    for (const source of result.sources) expect(URL.canParse(source.url)).toBe(true)
    expect(result.sources.some(source => (source.snippet?.length ?? 0) > 0)).toBe(true)
  }, 30_000)

  it('fetches a page as Markdown', async () => {
    const result = await new OctenFetchProvider(options).fetch({ url: 'https://example.com' })
    expect(result.statusCode).toBe(200)
    expect(result.body.kind).toBe('text')
    expect(result.body.content).toContain('Example Domain')
  }, 60_000)

  it('reports an unreachable page as a provider error', async () => {
    await expect(new OctenFetchProvider(options).fetch({ url: 'https://octen-unresolvable-host.invalid/' }))
      .rejects.toMatchObject({ code: 'WEB_PROVIDER_ERROR' })
  }, 60_000)

  it('rejects a bad key', async () => {
    await expect(new OctenSearchProvider(() => ({ ...options(), apiKey: 'invalid-key' })).search({ query: 'x' }))
      .rejects.toMatchObject({ code: 'WEB_PROVIDER_ERROR', message: expect.stringContaining('HTTP 401') as string })
  }, 30_000)
})
