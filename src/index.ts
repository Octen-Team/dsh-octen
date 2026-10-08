/**
 * `@octen.ai/dsh-octen` — Octen search and fetch for the DeepSeek Harness web
 * capability seam (`ctx.web`).
 *
 * Registers one search provider and one fetch provider, both under the id
 * `octen`. Selection stays with `dsh-web`: this package's bundle patch points
 * `searchProvider` and `fetchProvider` at `octen`, and a later patch layer can
 * point either back at a shipped provider.
 *
 * The key is resolved per operation: a literal `apiKey` in the row wins, then
 * the credential reference `apiKeyEnv` (default `OCTEN_API_KEY`) through the
 * credentials service, then the launch environment.
 *
 * @module @octen.ai/dsh-octen
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import type {} from '@deepseek-ai/dsh-web'
import {
  OCTEN_DEFAULT_API_KEY_ENV,
  OCTEN_DEFAULT_BASE_URL,
  OCTEN_DEFAULT_EXTRACT_TIMEOUT_SECONDS,
  OctenFetchProvider,
  OctenSearchProvider,
} from './provider.ts'
import type { OctenProviderOptions } from './provider.ts'

export {
  mapOctenExtractResult,
  mapOctenSearchData,
  mapOctenSearchResult,
  isAllowedBaseURL,
  OCTEN_DEFAULT_API_KEY_ENV,
  OCTEN_DEFAULT_BASE_URL,
  OCTEN_DEFAULT_EXTRACT_TIMEOUT_SECONDS,
  OCTEN_PROVIDER_ID,
  OctenFetchProvider,
  OctenSearchProvider,
} from './provider.ts'
export type { OctenOptionsSource, OctenProviderOptions } from './provider.ts'

/** Cordis plugin name; also the settings namespace the browser half edits. */
export const name = 'dsh-octen'

/** The web seam both providers register into. */
export const inject = ['web']

/** Environment variable that overrides the API base when the row sets none. */
const BASE_URL_ENV = 'OCTEN_API_URL'

/** Launch-environment layers {@link BASE_URL_ENV} is read from; the project `.env` is excluded. */
const TRUSTED_BASE_URL_SOURCES = ['process', 'user-env'] as const

/** An empty value reads as absent. */
function nonEmpty(value: string | undefined): string | undefined {
  return value !== undefined && value.length > 0 ? value : undefined
}

/** Plugin config. Every field is re-read at the start of each operation. */
export interface Config {
  /** Literal Octen API key; prefer {@link apiKeyEnv} so no secret enters configuration files. */
  apiKey: Volatile<string | undefined>
  /** Credential reference the key is resolved from. Defaults to `OCTEN_API_KEY`. */
  apiKeyEnv: Volatile<string>
  /**
   * API base; `/search` and `/extract` are appended. Defaults to `$OCTEN_API_URL` from the process
   * environment or the Harness home `.env` (never the project `.env`), then `https://api.octen.ai`.
   * Must be HTTPS, or HTTP to a loopback host.
   */
  baseURL: Volatile<string | undefined>
  /** Per-URL extraction timeout for `web_fetch`, 1–60 seconds. Defaults to 25. */
  extractTimeoutSeconds: Volatile<number>
}

export const Config = z.object({
  apiKey: z.string().role('secret').volatile()
    .description('Literal Octen API key. Prefer the credential reference below.'),
  apiKeyEnv: z.string().role('credential-ref').default(OCTEN_DEFAULT_API_KEY_ENV).volatile()
    .description('Stored credential or environment variable holding the Octen API key.'),
  baseURL: z.string().volatile()
    .description('Octen API base (HTTPS, or HTTP to localhost). Leave blank for $OCTEN_API_URL or https://api.octen.ai.'),
  extractTimeoutSeconds: z.number().step(1).min(1).max(60).default(OCTEN_DEFAULT_EXTRACT_TIMEOUT_SECONDS).volatile()
    .description('Per-URL extraction timeout for web_fetch, in seconds. Keep it below the web_fetch tool budget (30 s by default).'),
})

/** The current values of {@link Config}, unwrapped. */
export interface ConfigValues {
  apiKey: string | undefined
  apiKeyEnv: string
  baseURL: string | undefined
  extractTimeoutSeconds: number
}

/**
 * Project the current config into the options one operation runs with.
 * @param ctx - plugin context supplying the credentials service and launch environment.
 * @param config - the current config values.
 * @returns fully defaulted options; the key itself is resolved lazily.
 */
export function resolveOptions(ctx: Context, config: ConfigValues): OctenProviderOptions {
  const apiKeyEnv = config.apiKeyEnv.length > 0 ? config.apiKeyEnv : OCTEN_DEFAULT_API_KEY_ENV
  const ref = credentialRef(apiKeyEnv)
  const literal = config.apiKey !== undefined && config.apiKey.length > 0 ? config.apiKey : undefined
  const configuredBase = config.baseURL !== undefined && config.baseURL.length > 0 ? config.baseURL : undefined
  return {
    ...literal !== undefined ? { apiKey: literal } : {},
    apiKeyEnv,
    resolveApiKey: async () => {
      const credentials = ctx.get('credentials')
      if (credentials !== undefined) {
        const value = (await credentials.resolve(ref))?.value
        if (value !== undefined && value.length > 0) return value
      }
      const ambient = launchEnvironmentOf(ctx).get(apiKeyEnv)?.value
      return ambient !== undefined && ambient.length > 0 ? ambient : undefined
    },
    // The invoking directory's `.env` is not trusted to move the endpoint: a
    // cloned project could otherwise redirect the key to a host it controls.
    baseURL: configuredBase
      ?? nonEmpty(launchEnvironmentOf(ctx).getFrom(BASE_URL_ENV, TRUSTED_BASE_URL_SOURCES)?.value)
      ?? OCTEN_DEFAULT_BASE_URL,
    extractTimeoutSeconds: config.extractTimeoutSeconds,
  }
}

/**
 * Register the Octen search and fetch providers with `ctx.web`.
 * @param ctx - plugin context.
 * @param config - the validated row; its fields are read per operation.
 */
export function apply(ctx: Context, config: Config): void {
  const options = (): OctenProviderOptions => resolveOptions(ctx, {
    apiKey: config.apiKey.get(),
    apiKeyEnv: config.apiKeyEnv.get(),
    baseURL: config.baseURL.get(),
    extractTimeoutSeconds: config.extractTimeoutSeconds.get(),
  })
  ctx.web.registerSearchProvider(new OctenSearchProvider(options))
  ctx.web.registerFetchProvider(new OctenFetchProvider(options))
}
