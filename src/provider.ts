/**
 * Octen-backed providers for the DeepSeek Harness web seam (`ctx.web`).
 *
 * - {@link OctenSearchProvider} calls `POST /search` and maps each result's
 *   `highlight` to `snippet` and `time_published` to `publishedAt`. Octen
 *   returns no generated answer, so `content` is omitted.
 * - {@link OctenFetchProvider} calls `POST /extract` for one URL and returns the
 *   extracted Markdown as a `text` body, so `dsh-tool-web` skips its HTML
 *   conversion. Octen reports extraction success or failure rather than the
 *   origin's HTTP status: a successful extraction is reported as status 200 and
 *   a failed one throws `WEB_PROVIDER_ERROR` with Octen's reason.
 *
 * Both providers read their options through a thunk at the start of every
 * operation, so a rotated key or an edited endpoint reaches the next call
 * without re-registering. Requests carry the API key, so redirects are refused.
 *
 * @module @octen.ai/dsh-octen/provider
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type {
  WebFetchProvider,
  WebFetchRequest,
  WebFetchResult,
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from '@deepseek-ai/dsh-web'
import type {
  OctenEnvelope,
  OctenExtractData,
  OctenExtractRequest,
  OctenExtractResult,
  OctenSearchData,
  OctenSearchRequest,
  OctenSearchResult,
} from './types.ts'

/** Id both providers register under in `ctx.web`. */
export const OCTEN_PROVIDER_ID = 'octen'

/** Default Octen API base; `/search` and `/extract` are appended. */
export const OCTEN_DEFAULT_BASE_URL = 'https://api.octen.ai'

/** Credential reference resolved when the config names none. */
export const OCTEN_DEFAULT_API_KEY_ENV = 'OCTEN_API_KEY'

/** Octen's upper bound on `count` for `POST /search`. */
const OCTEN_MAX_SEARCH_COUNT = 100

/**
 * Default per-URL extraction timeout, in seconds. It stays under the 30 s
 * budget `dsh-tool-web` gives `web_fetch` by default, so a slow page comes back
 * as Octen's own failure reason instead of a cancelled tool call.
 */
export const OCTEN_DEFAULT_EXTRACT_TIMEOUT_SECONDS = 25

/** Attribution header sent on every request. Kept equal to the package version by a test. */
export const USER_AGENT = 'dsh-octen/0.1.0'

/** Options one operation runs with, resolved fresh for every call. */
export interface OctenProviderOptions {
  /** Literal API key from the config row; wins over {@link resolveApiKey} when non-empty. */
  apiKey?: string
  /** Resolve the key behind {@link apiKeyEnv} for one operation. */
  resolveApiKey?: () => Promise<string | undefined>
  /** Credential reference the key is read from; named in the missing-key error. */
  apiKeyEnv: string
  /** API base; `/search` and `/extract` are appended. */
  baseURL: string
  /** Per-URL extraction timeout sent as `/extract`'s `timeout`, 1–60 seconds. */
  extractTimeoutSeconds: number
}

/** Reads the options for the next operation. */
export type OctenOptionsSource = () => OctenProviderOptions

/**
 * Map one Octen search result to a normalized source.
 * @param result - one entry of `data.results[]`.
 * @returns the source, or `undefined` when the entry has no URL to cite.
 */
export function mapOctenSearchResult(result: OctenSearchResult): WebSearchSource | undefined {
  if (result == null || typeof result !== 'object') return undefined
  const url = nonBlank(result.url)
  if (url === undefined) return undefined
  const title = nonBlank(result.title)
  const snippet = nonBlank(result.highlight)
  const publishedAt = nonBlank(result.time_published)
  return {
    url,
    ...title !== undefined ? { title } : {},
    ...snippet !== undefined ? { snippet: snippet.trim() } : {},
    ...publishedAt !== undefined ? { publishedAt } : {},
  }
}

/**
 * Map a `POST /search` payload to a normalized result. The seam owns the final
 * `maxResults` truncation, so this reports `truncated: false`.
 * @param data - the response's `data`.
 * @returns the normalized result.
 */
export function mapOctenSearchData(data: OctenSearchData | undefined): WebSearchResult {
  const results: readonly OctenSearchResult[] = Array.isArray(data?.results) ? data.results : []
  const sources = results
    .map(mapOctenSearchResult)
    .filter((source): source is WebSearchSource => source !== undefined)
  return { sources, truncated: false }
}

/**
 * Map one `POST /extract` result to a fetch result.
 * @param requestUrl - the URL the caller asked for.
 * @param result - the first entry of `data.results[]`, if any.
 * @returns the fetched page as Markdown text, headed by its title when Octen found one and the text does not already open with it.
 * @throws {WebError} `WEB_PROVIDER_ERROR` when Octen returned no result or reports the extraction failed.
 */
export function mapOctenExtractResult(requestUrl: string, result: OctenExtractResult | undefined): WebFetchResult {
  if (result == null || typeof result !== 'object') {
    throw new WebError(`Octen extract returned no result for ${requestUrl}`, 'WEB_PROVIDER_ERROR')
  }
  if (result.status !== 'success') {
    const reason = nonBlank(result.error_message) ?? 'no reason given'
    throw new WebError(`Octen could not extract ${requestUrl}: ${reason}`, 'WEB_PROVIDER_ERROR')
  }
  const title = nonBlank(result.title)
  const body = typeof result.full_content === 'string' ? result.full_content : ''
  return {
    url: nonBlank(result.url) ?? requestUrl,
    statusCode: 200,
    body: { kind: 'text', content: title === undefined || startsWithHeading(body, title) ? body : `# ${title}\n\n${body}` },
    truncated: false,
  }
}

/** Searches the web through Octen `POST /search`. */
export class OctenSearchProvider implements WebSearchProvider {
  readonly id = OCTEN_PROVIDER_ID

  /** @param options - read at the start of every search. */
  constructor(private readonly options: OctenOptionsSource) {}

  available(): boolean {
    return isUsable(this.options())
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const body: OctenSearchRequest = { query: request.query }
    if (request.maxResults !== undefined) {
      body.count = Math.min(Math.max(Math.floor(request.maxResults), 1), OCTEN_MAX_SEARCH_COUNT)
    }
    const data = await callOcten<OctenSearchData>(this.options(), '/search', body, 'search', signal)
    return mapOctenSearchData(data)
  }
}

/** Fetches one page through Octen `POST /extract`, as Markdown. */
export class OctenFetchProvider implements WebFetchProvider {
  readonly id = OCTEN_PROVIDER_ID

  /** @param options - read at the start of every fetch. */
  constructor(private readonly options: OctenOptionsSource) {}

  available(): boolean {
    return isUsable(this.options())
  }

  async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult> {
    const options = this.options()
    const body: OctenExtractRequest = { urls: [request.url], format: 'markdown', timeout: options.extractTimeoutSeconds }
    const data = await callOcten<OctenExtractData>(options, '/extract', body, 'extract', signal)
    const results: readonly OctenExtractResult[] = Array.isArray(data?.results) ? data.results : []
    return mapOctenExtractResult(request.url, results[0])
  }
}

/** True when the options can serve a call: an allowed base, some key source, and an in-range timeout. */
function isUsable(options: OctenProviderOptions): boolean {
  const hasKeySource = (options.apiKey?.length ?? 0) > 0 || options.resolveApiKey !== undefined
  const timeout = options.extractTimeoutSeconds
  return hasKeySource && isAllowedBaseURL(options.baseURL) && Number.isInteger(timeout) && timeout >= 1 && timeout <= 60
}

/** Loopback hosts that may be reached over plain HTTP, for local gateways and tests. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Whether the key may be sent to `baseURL`: HTTPS anywhere, plain HTTP only to
 * a loopback host, so the key never crosses a network in cleartext.
 * @param baseURL - the configured API base.
 * @returns true when the base parses and its scheme and host are allowed.
 */
export function isAllowedBaseURL(baseURL: string): boolean {
  if (!URL.canParse(baseURL)) return false
  const { protocol, hostname } = new URL(baseURL)
  return protocol === 'https:' || (protocol === 'http:' && LOOPBACK_HOSTS.has(hostname))
}

/**
 * POST one JSON body to an Octen endpoint and return the envelope's `data`.
 * @throws {WebError} `WEB_ABORTED` on cancellation, `WEB_PROVIDER_CREDENTIAL_MISSING`
 *   when no key resolves, `WEB_PROVIDER_ERROR` for transport, HTTP, envelope, and parse failures.
 */
async function callOcten<D>(
  options: OctenProviderOptions,
  path: string,
  body: object,
  operation: string,
  signal: AbortSignal | undefined,
): Promise<D | undefined> {
  // `available()` already refuses these bases; checked again here because the
  // seam may call a provider that was selected before the config changed.
  if (!isAllowedBaseURL(options.baseURL)) {
    throw new WebError(`Octen ${operation} refused base URL ${JSON.stringify(options.baseURL)}: use https, or http only for localhost`, 'WEB_PROVIDER_ERROR')
  }
  const apiKey = await resolveKey(options)
  const url = `${options.baseURL.replace(/\/+$/, '')}${path}`
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json',
        'accept': 'application/json',
        'user-agent': USER_AGENT,
      },
      body: JSON.stringify(body),
      ...signal !== undefined ? { signal } : {},
    })
  } catch (error: unknown) {
    if (isAbort(error, signal)) throw abortError(operation, error)
    throw new WebError(`Octen ${operation} request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
  }

  let envelope: OctenEnvelope<D> | undefined
  try {
    envelope = await response.json() as OctenEnvelope<D>
  } catch (error: unknown) {
    if (isAbort(error, signal)) throw abortError(operation, error)
    // A non-JSON body is expected from gateways on 5xx/429; the status below still reports the failure.
    if (response.ok) {
      throw new WebError(`Octen ${operation} returned an unreadable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }

  const code = envelope?.code
  if (!response.ok || (code !== undefined && code !== 0)) {
    const detail = (nonBlank(envelope?.msg) ?? nonBlank(response.statusText) ?? 'no message').trim().replace(/\.+$/, '')
    const status = response.ok ? `code ${String(code)}` : `HTTP ${String(response.status)}`
    const hint = response.status === 401 || code === 401
      ? ` Check the Octen API key stored under "${options.apiKeyEnv}".`
      : ''
    throw new WebError(`Octen ${operation} failed (${status}): ${detail}.${hint}`, 'WEB_PROVIDER_ERROR')
  }
  return envelope?.data
}

/** The literal key if set, else the resolved credential; throws when neither yields one. */
async function resolveKey(options: OctenProviderOptions): Promise<string> {
  if (options.apiKey !== undefined && options.apiKey.length > 0) return options.apiKey
  let resolved: string | undefined
  try {
    resolved = await options.resolveApiKey?.()
  } catch (error: unknown) {
    throw new WebError(`Octen credential resolution failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
  }
  if (resolved !== undefined && resolved.length > 0) return resolved
  throw new WebError(
    `Octen has no API key for "${options.apiKeyEnv}". Save one on the Octen page under Plugins, `
    + `export ${options.apiKeyEnv} in the environment that launches DeepSeek Harness, `
    + 'or get a key at https://octen.ai.',
    'WEB_PROVIDER_CREDENTIAL_MISSING',
  )
}

/** True when the Markdown already opens with a heading that reads `title`. */
function startsWithHeading(markdown: string, title: string): boolean {
  const firstLine = markdown.trimStart().split('\n', 1)[0] ?? ''
  return /^#{1,6}\s/.test(firstLine) && firstLine.replace(/^#{1,6}\s+/, '').trim() === title.trim()
}

/** Read an optional wire string: anything that is not a non-blank string is absent. */
function nonBlank(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

/** True for a cancellation (including a custom abort reason or a timeout signal), surfaced as `WEB_ABORTED`. */
function isAbort(error: unknown, signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true || (error instanceof DOMException && error.name === 'AbortError')
}

function abortError(operation: string, cause: unknown): WebError {
  return new WebError(`Octen ${operation} aborted`, 'WEB_ABORTED', { cause })
}
