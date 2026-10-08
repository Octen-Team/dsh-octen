/**
 * Wire types for the two Octen endpoints this package calls, read from the
 * published OpenAPI document (`https://docs.octen.ai/api-reference/openapi.json`).
 * Types only — no runtime code. Every endpoint answers inside the same
 * envelope: `code` is `0` on success and the HTTP status (or another non-zero
 * value) on failure, with `msg` describing it.
 *
 * @module @octen.ai/dsh-octen/types
 */

/** The envelope every Octen response shares. */
export interface OctenEnvelope<D> {
  code?: number
  msg?: string
  request_id?: string
  data?: D
}

/** Request body for `POST /search`. Only the fields this package sends. */
export interface OctenSearchRequest {
  query: string
  /** Result count, 1–100 (server default 5). */
  count?: number
}

/** One entry of `data.results[]` from `POST /search`. */
export interface OctenSearchResult {
  url?: string | null
  title?: string | null
  /** Query-relevant passage of the page. */
  highlight?: string | null
  /** ISO-8601 publication time when the page states one. */
  time_published?: string | null
}

/** `data` of a `POST /search` response. */
export interface OctenSearchData {
  results?: OctenSearchResult[]
}

/** Request body for `POST /extract`. Only the fields this package sends. */
export interface OctenExtractRequest {
  urls: string[]
  format: 'markdown' | 'text'
  /** Per-URL fetch timeout in seconds, 1–60 (server default 30). */
  timeout?: number
}

/** One entry of `data.results[]` from `POST /extract`. */
export interface OctenExtractResult {
  url?: string | null
  status?: 'success' | 'failed'
  title?: string | null
  full_content?: string | null
  error_message?: string | null
}

/** `data` of a `POST /extract` response. */
export interface OctenExtractData {
  results?: OctenExtractResult[]
}
