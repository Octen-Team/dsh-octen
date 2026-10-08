import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { WebError } from '@deepseek-ai/dsh-web'
import {
  OCTEN_DEFAULT_EXTRACT_TIMEOUT_SECONDS,
  OctenFetchProvider,
  OctenSearchProvider,
  USER_AGENT,
  mapOctenExtractResult,
  mapOctenSearchData,
  type OctenProviderOptions,
} from '../src/provider.ts'
import { json, startStub, type StubServer } from './helpers.ts'

let stub: StubServer

beforeAll(async () => { stub = await startStub() })
afterAll(async () => { await stub.close() })
beforeEach(() => { stub.seen.length = 0 })

function options(overrides: Partial<OctenProviderOptions> = {}): OctenProviderOptions {
  return {
    apiKeyEnv: 'OCTEN_API_KEY',
    resolveApiKey: () => Promise.resolve('resolved-key'),
    baseURL: stub.baseURL,
    extractTimeoutSeconds: OCTEN_DEFAULT_EXTRACT_TIMEOUT_SECONDS,
    ...overrides,
  }
}

async function failure(run: () => Promise<unknown>): Promise<WebError> {
  try {
    await run()
  } catch (error: unknown) {
    return error as WebError
  }
  throw new Error('expected a WebError')
}

describe('search', () => {
  it('posts the query and the bounded count with the resolved key', async () => {
    stub.respond((_request, response) => {
      json(response, 200, {
        code: 0,
        msg: 'success',
        data: {
          results: [
            { title: 'A', url: 'https://a.test', highlight: '  passage A  ', time_published: '2026-01-02T00:00:00Z' },
            { title: '', url: 'https://b.test', highlight: '', time_published: '' },
            { title: 'no url', url: '', highlight: 'x' },
          ],
        },
      })
    })
    const result = await new OctenSearchProvider(() => options()).search({ query: 'octen', maxResults: 8 })

    expect(stub.seen).toHaveLength(1)
    const [request] = stub.seen
    expect(request?.method).toBe('POST')
    expect(request?.path).toBe('/search')
    expect(request?.headers['x-api-key']).toBe('resolved-key')
    expect(request?.headers['user-agent']).toBe(USER_AGENT)
    expect(request?.body).toEqual({ query: 'octen', count: 8 })
    expect(result).toEqual({
      sources: [
        { url: 'https://a.test', title: 'A', snippet: 'passage A', publishedAt: '2026-01-02T00:00:00Z' },
        { url: 'https://b.test' },
      ],
      truncated: false,
    })
  })

  it('clamps the count to Octen limits and omits it when no bound is set', async () => {
    const provider = new OctenSearchProvider(() => options())
    await provider.search({ query: 'a', maxResults: 500 })
    await provider.search({ query: 'b', maxResults: 0 })
    await provider.search({ query: 'c' })
    expect(stub.seen.map(request => request.body)).toEqual([
      { query: 'a', count: 100 },
      { query: 'b', count: 1 },
      { query: 'c' },
    ])
  })

  it('prefers a literal key over the resolver and tolerates a trailing slash on the base', async () => {
    const provider = new OctenSearchProvider(() => options({ apiKey: 'literal-key', baseURL: `${stub.baseURL}/` }))
    await provider.search({ query: 'x' })
    expect(stub.seen[0]?.path).toBe('/search')
    expect(stub.seen[0]?.headers['x-api-key']).toBe('literal-key')
  })

  it('reports a missing key without contacting Octen', async () => {
    const provider = new OctenSearchProvider(() => options({ resolveApiKey: () => Promise.resolve(undefined) }))
    const error = await failure(() => provider.search({ query: 'x' }))
    expect(error.code).toBe('WEB_PROVIDER_CREDENTIAL_MISSING')
    expect(error.message).toContain('OCTEN_API_KEY')
    expect(stub.seen).toHaveLength(0)
  })

  it('wraps a failing credential resolver', async () => {
    const provider = new OctenSearchProvider(() => options({ resolveApiKey: () => Promise.reject(new Error('store locked')) }))
    const error = await failure(() => provider.search({ query: 'x' }))
    expect(error.code).toBe('WEB_PROVIDER_ERROR')
    expect(error.message).toContain('store locked')
  })

  it('surfaces a rejected key with the reference to fix', async () => {
    stub.respond((_request, response) => { json(response, 401, { code: 401, msg: 'Invalid API Key.' }) })
    const error = await failure(() => new OctenSearchProvider(() => options({ apiKeyEnv: 'MY_OCTEN_KEY' })).search({ query: 'x' }))
    expect(error.code).toBe('WEB_PROVIDER_ERROR')
    expect(error.message).toContain('HTTP 401')
    expect(error.message).toBe('Octen search failed (HTTP 401): Invalid API Key. Check the Octen API key stored under "MY_OCTEN_KEY".')
  })

  it('treats a non-zero envelope code on HTTP 200 as a failure', async () => {
    stub.respond((_request, response) => { json(response, 200, { code: 403, msg: 'Insufficient balance' }) })
    const error = await failure(() => new OctenSearchProvider(() => options()).search({ query: 'x' }))
    expect(error.code).toBe('WEB_PROVIDER_ERROR')
    expect(error.message).toContain('code 403')
    expect(error.message).toContain('Insufficient balance')
  })

  it('reports a gateway failure whose body is not JSON', async () => {
    stub.respond((_request, response) => { response.writeHead(502); response.end('<html>bad gateway</html>') })
    const error = await failure(() => new OctenSearchProvider(() => options()).search({ query: 'x' }))
    expect(error.code).toBe('WEB_PROVIDER_ERROR')
    expect(error.message).toContain('HTTP 502')
  })

  it('reports an unreadable success body', async () => {
    stub.respond((_request, response) => { response.writeHead(200); response.end('not json') })
    const error = await failure(() => new OctenSearchProvider(() => options()).search({ query: 'x' }))
    expect(error.code).toBe('WEB_PROVIDER_ERROR')
    expect(error.message).toContain('unreadable')
  })

  it('refuses to follow a redirect, so the key never reaches the target', async () => {
    stub.respond((request, response) => {
      if (request.path === '/search') {
        response.writeHead(307, { location: `${stub.baseURL}/elsewhere` })
        response.end()
        return
      }
      json(response, 200, { code: 0, data: { results: [] } })
    })
    const error = await failure(() => new OctenSearchProvider(() => options()).search({ query: 'x' }))
    expect(error.code).toBe('WEB_PROVIDER_ERROR')
    expect(stub.seen.map(request => request.path)).toEqual(['/search'])
  })

  it('reports an unreachable endpoint', async () => {
    const error = await failure(() => new OctenSearchProvider(() => options({ baseURL: 'http://127.0.0.1:1' })).search({ query: 'x' }))
    expect(error.code).toBe('WEB_PROVIDER_ERROR')
    expect(error.message).toContain('request failed')
  })

  it('reports cancellation as WEB_ABORTED', async () => {
    stub.respond(() => { /* never answer */ })
    const controller = new AbortController()
    const pending = failure(() => new OctenSearchProvider(() => options()).search({ query: 'x' }, controller.signal))
    setTimeout(() => { controller.abort(new Error('tool timeout')) }, 20)
    expect((await pending).code).toBe('WEB_ABORTED')
  })
})

describe('fetch', () => {
  it('extracts one URL as Markdown headed by its title', async () => {
    stub.respond((_request, response) => {
      json(response, 200, {
        code: 0,
        data: { results: [{ url: 'https://example.com/final', status: 'success', title: 'Example', full_content: 'Body text.' }] },
      })
    })
    const result = await new OctenFetchProvider(() => options()).fetch({ url: 'https://example.com' })

    expect(stub.seen[0]?.path).toBe('/extract')
    expect(stub.seen[0]?.headers['x-api-key']).toBe('resolved-key')
    expect(stub.seen[0]?.body).toEqual({ urls: ['https://example.com'], format: 'markdown', timeout: 25 })
    expect(result).toEqual({
      url: 'https://example.com/final',
      statusCode: 200,
      body: { kind: 'text', content: '# Example\n\nBody text.' },
      truncated: false,
    })
  })

  it('sends the configured extraction timeout', async () => {
    stub.respond((_request, response) => { json(response, 200, { code: 0, data: { results: [{ status: 'success', full_content: 'x' }] } }) })
    await new OctenFetchProvider(() => options({ extractTimeoutSeconds: 10 })).fetch({ url: 'https://example.com' })
    expect(stub.seen[0]?.body).toMatchObject({ timeout: 10 })
  })

  it('raises Octen\'s reason when the extraction failed', async () => {
    stub.respond((_request, response) => {
      json(response, 200, { code: 0, data: { results: [{ url: 'https://x.invalid', status: 'failed', error_message: 'Failed to resolve domain' }] } })
    })
    const error = await failure(() => new OctenFetchProvider(() => options()).fetch({ url: 'https://x.invalid' }))
    expect(error.code).toBe('WEB_PROVIDER_ERROR')
    expect(error.message).toBe('Octen could not extract https://x.invalid: Failed to resolve domain')
  })
})

describe('mapping', () => {
  it('maps an absent search payload to no sources', () => {
    expect(mapOctenSearchData(undefined)).toEqual({ sources: [], truncated: false })
  })

  it('does not repeat a title the Markdown already opens with', () => {
    const page = (content: string) => mapOctenExtractResult('https://a.test', { status: 'success', title: 'Example Domains', full_content: content }).body.content
    expect(page('\n# Example Domains\n\nBody')).toBe('\n# Example Domains\n\nBody')
    expect(page('## Example Domains\n\nBody')).toBe('## Example Domains\n\nBody')
    expect(page('# Other heading\n\nBody')).toBe('# Example Domains\n\n# Other heading\n\nBody')
    expect(page('Example Domains are reserved')).toBe('# Example Domains\n\nExample Domains are reserved')
  })

  it('keeps the requested URL and skips the heading when Octen returns neither', () => {
    expect(mapOctenExtractResult('https://a.test', { status: 'success', full_content: null })).toEqual({
      url: 'https://a.test', statusCode: 200, body: { kind: 'text', content: '' }, truncated: false,
    })
  })

  it('tolerates malformed wire data instead of throwing a TypeError', () => {
    expect(mapOctenSearchData({ results: 'oops' } as never)).toEqual({ sources: [], truncated: false })
    expect(mapOctenSearchData({ results: [null, { url: 42, title: 'x' }, { url: 'https://ok.test', title: 7 }] } as never))
      .toEqual({ sources: [{ url: 'https://ok.test' }], truncated: false })
    expect(() => mapOctenExtractResult('https://a.test', null as never)).toThrow('no result')
  })

  it('treats an empty result list and a reasonless failure as errors', () => {
    expect(() => mapOctenExtractResult('https://a.test', undefined)).toThrow('no result')
    expect(() => mapOctenExtractResult('https://a.test', { status: 'failed' })).toThrow('no reason given')
  })
})

describe('availability', () => {
  it('needs a parseable base, a key source, and an in-range timeout', () => {
    const available = (value: OctenProviderOptions) => new OctenSearchProvider(() => value).available()
    const base = { apiKeyEnv: 'OCTEN_API_KEY', baseURL: 'https://api.octen.ai', extractTimeoutSeconds: 25 }
    expect(available({ ...base, apiKey: 'k' })).toBe(true)
    expect(available({ ...base, resolveApiKey: () => Promise.resolve('k') })).toBe(true)
    expect(available(base)).toBe(false)
    expect(available({ ...base, apiKey: 'k', baseURL: 'not a url' })).toBe(false)
    expect(available({ ...base, apiKey: 'k', extractTimeoutSeconds: 0 })).toBe(false)
    expect(available({ ...base, apiKey: 'k', extractTimeoutSeconds: 61 })).toBe(false)
    expect(new OctenFetchProvider(() => ({ ...base, apiKey: 'k' })).available()).toBe(true)
  })
})

describe('package metadata', () => {
  it('sends a User-Agent naming the published version', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
    expect(USER_AGENT).toBe(`dsh-octen/${manifest.version}`)
  })
})
