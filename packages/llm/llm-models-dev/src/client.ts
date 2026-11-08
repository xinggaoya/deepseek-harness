/**
 * Fetching the models.dev catalog.
 *
 * The catalog is one JSON document served from a fixed endpoint. The reply is
 * read under a byte ceiling rather than by its declared length, because a
 * server that under-declares its size (or streams) tells the reader nothing
 * up front, and a catalog too large to hold is a failure worth reporting
 * rather than a truncated document worth parsing.
 *
 * @module dsh-llm-models-dev/client
 */

import { createRequire } from 'node:module'
import { parseModelsDevCatalog } from './parse.ts'
import type { ModelsDevSnapshot } from './types.ts'

// The package's own manifest is the single source of the version so the
// User-Agent cannot drift from what is published (`./package.json` is an
// export of this package; the relative path resolves from both `src/` and the
// bundled `lib/`).
const { version } = createRequire(import.meta.url)('../package.json') as { version: string }

/**
 * The identity this package sends to the catalog endpoint.
 *
 * The catalog is a public document, so the request carries no secret and
 * identifies only the product that asked for it.
 */
export const USER_AGENT = `deepseek-harness-models-dev/${version} (+https://github.com/deepseek-ai/deepseek-harness)`

/**
 * The endpoint the catalog is fetched from.
 *
 * The document is models.dev's own; this fork serves it from its own proxy,
 * because models.dev is unreachable from the deployments the fork targets. A
 * deployment that can reach models.dev directly names its own endpoint in the
 * plugin's `url` configuration.
 */
export const DEFAULT_MODELS_DEV_URL = 'https://models.moncn.cn/api.json'

/** How the client reaches the catalog. */
export interface ModelsDevClientOptions {
  /** Catalog endpoint. */
  url: string
  /** Request timeout, in milliseconds. */
  timeoutMs: number
  /** Largest reply accepted, in bytes. */
  maxBytes: number
}

/**
 * Read a reply body, refusing one that outgrows the ceiling.
 *
 * A declared length is checked first, so an honest server is turned away
 * without transferring anything; the accumulated total is what actually
 * enforces the bound.
 * @param response - the reply to read.
 * @param maxBytes - the ceiling, in bytes.
 * @returns the decoded body.
 * @throws Error when the body outgrows the ceiling.
 */
async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const oversized = (): Error =>
    new Error(`models.dev catalog exceeds ${maxBytes} bytes`)
  const declared = Number(response.headers.get('content-length') ?? Number.NaN)
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel()
    throw oversized()
  }
  /* v8 ignore next -- fetch always exposes a body stream on a 2xx Response; the null guard is defensive. */
  if (response.body === null) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) throw oversized()
      chunks.push(value)
    }
  } finally {
    /* v8 ignore next 4 -- cancel() after a completed or abandoned read settles without rejecting; unobserved best-effort cleanup. */
    await reader.cancel().catch(() => {
      // Cancel after a drained read, or after this function walked away from
      // an oversized one, is cleanup; the reply is already decided either way.
    })
  }
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

/**
 * Fetch and read the catalog.
 * @param options - the endpoint, timeout, and byte ceiling.
 * @param signal - caller cancellation, composed with the request timeout.
 * @returns the catalog facts the payload carried.
 * @throws Error when the endpoint is unreachable, answers a failure, or does not answer JSON.
 */
export async function fetchModelsDevCatalog(
  options: ModelsDevClientOptions,
  signal?: AbortSignal,
): Promise<ModelsDevSnapshot> {
  const timeout = AbortSignal.timeout(options.timeoutMs)
  const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
  let response: Response
  try {
    response = await fetch(options.url, {
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      signal: combined,
    })
  } catch (error: unknown) {
    throw new Error(`could not reach ${options.url}`, { cause: error })
  }
  if (!response.ok) {
    throw new Error(`${options.url} answered ${response.status}`)
  }
  const text = await readBounded(response, options.maxBytes)
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch (error: unknown) {
    throw new Error(`${options.url} did not answer with JSON`, { cause: error })
  }
  return parseModelsDevCatalog(payload, Date.now())
}
