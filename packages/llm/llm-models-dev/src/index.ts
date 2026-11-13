/**
 * The models.dev model catalog as a harness service.
 *
 * models.dev publishes one catalog document covering every AI SDK provider
 * package: which providers exist, which models each offers, and what each
 * model's context window, output cap, input types, and reasoning controls are.
 * This package fetches that document on a schedule and serves it as facts; a
 * consumer decides what those facts mean for the routes it owns.
 *
 * The service is opt-in: a composition mounts it to let provider routes draw
 * their model catalog from models.dev.
 *
 * @module @deepseek-ai/dsh-llm-models-dev
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// Type-only: pulls the LLM service's Context merge (ctx.llm).
import type {} from '@deepseek-ai/dsh-llm'
import { dshCachePath } from '@deepseek-ai/dsh-home-paths'
import { readCatalogCache, writeCatalogCache } from './cache.ts'
import { DEFAULT_MODELS_DEV_URL, fetchModelsDevCatalog } from './client.ts'
import type { ModelsDevProviderFacts, ModelsDevSnapshot } from './types.ts'

export type {
  ModelsDevEffortValue,
  ModelsDevModelFacts,
  ModelsDevModelStatus,
  ModelsDevProviderFacts,
  ModelsDevReasoningOption,
  ModelsDevSnapshot,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The models.dev catalog this composition serves provider routes from. */
    llmModelsDev: ModelsDevCatalog
  }
}

/** How often the catalog is refetched, in milliseconds. */
const DEFAULT_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000

/** How long one catalog request may take, in milliseconds. */
const DEFAULT_TIMEOUT_MS = 30_000

/** The largest catalog reply accepted, in bytes. */
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024

/**
 * How long a failed attempt waits before the next one, in milliseconds.
 *
 * The catalog is a list a configuration surface offers, so an empty one reads
 * as a missing provider. A failed attempt is therefore retried long before the
 * next scheduled refresh.
 */
const DEFAULT_RETRY_INTERVAL_MS = 30_000

/** The cache file the fetched catalog is kept in, under the harness home's cache directory. */
const DEFAULT_CACHE_FILENAME = 'models-dev.json'

/** Configuration for the catalog service. */
export interface Config {
  /** Catalog endpoint; the default is models.dev's own API document. */
  url?: string
  /** How often the catalog is refetched, in milliseconds. */
  refreshIntervalMs?: number
  /** How long one catalog request may take, in milliseconds. */
  timeoutMs?: number
  /** The largest catalog reply accepted, in bytes. */
  maxBytes?: number
  /**
   * Whether the catalog keeps the models models.dev records as deprecated.
   *
   * A deprecated model is one its provider retired; the catalog drops it
   * unless a deployment asks for it.
   */
  includeDeprecated?: boolean
  /**
   * Where the fetched catalog is kept for the next start.
   *
   * The default is a file in the harness home's cache directory. A deployment
   * that keeps its own home names the file it wants there.
   */
  cachePath?: string
  /** How long a failed attempt waits before the next one, in milliseconds. */
  retryIntervalMs?: number
  /** Harness home override for the default cache location. */
  dshHome?: string
}

/** Schemastery validation for {@link Config}. */
const Config: z<Config> = z.object({
  url: z.string(),
  refreshIntervalMs: z.number(),
  timeoutMs: z.number(),
  maxBytes: z.number(),
  includeDeprecated: z.boolean(),
  cachePath: z.string(),
  retryIntervalMs: z.number(),
  dshHome: z.string(),
})

/** Reject a configuration value the service cannot honor. */
function assertPositiveInteger(field: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`llm-models-dev: ${field} must be a positive safe integer, got ${String(value)}`)
  }
}

/** Reject an endpoint that is not an absolute HTTP(S) URL. */
function assertAbsoluteUrl(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch (error: unknown) {
    throw new TypeError(`llm-models-dev: url must be an absolute HTTP(S) URL, got ${JSON.stringify(url)}`, { cause: error })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TypeError(`llm-models-dev: url must use http or https, got ${JSON.stringify(url)}`)
  }
}

/**
 * The catalog without the models models.dev records as deprecated.
 *
 * A provider that retired a model keeps its record in models.dev so the
 * history stays complete; a deployment serving that provider does not offer
 * the model unless it asks for it.
 * @param snapshot - the catalog as fetched.
 * @returns a catalog holding only the models that are not deprecated.
 */
function withoutDeprecated(snapshot: ModelsDevSnapshot): ModelsDevSnapshot {
  const providers = new Map<string, ModelsDevProviderFacts>()
  for (const [id, provider] of snapshot.providers) {
    providers.set(id, {
      ...provider,
      models: provider.models.filter(model => model.status !== 'deprecated'),
    })
  }
  return { ...snapshot, providers }
}

/**
 * The models.dev catalog, fetched on a schedule and read by identity.
 */
export class ModelsDevCatalog extends Service {
  static inject: string[] = ['llm']

  static Config = Config

  private readonly url: string
  private readonly refreshIntervalMs: number
  private readonly timeoutMs: number
  private readonly maxBytes: number
  private readonly includeDeprecated: boolean
  private readonly retryIntervalMs: number
  private readonly cachePath: string
  private current: ModelsDevSnapshot | undefined
  private timer: NodeJS.Timeout | undefined
  private inFlight: AbortController | undefined
  private stopped = false
  private readonly settled: Promise<void>
  private markSettled: (() => void) | undefined

  /**
   * Start the catalog service and its refresh schedule.
   * @param ctx - plugin context owning the service and its schedule.
   * @param config - endpoint, schedule, timeout, size ceiling, cache, and lifecycle choice.
   * @throws TypeError when a configured value cannot be honored.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'llmModelsDev')
    this.url = config.url ?? DEFAULT_MODELS_DEV_URL
    this.refreshIntervalMs = config.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxBytes = config.maxBytes ?? DEFAULT_MAX_BYTES
    this.includeDeprecated = config.includeDeprecated ?? false
    this.retryIntervalMs = config.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS
    assertPositiveInteger('refreshIntervalMs', this.refreshIntervalMs)
    assertPositiveInteger('timeoutMs', this.timeoutMs)
    assertPositiveInteger('maxBytes', this.maxBytes)
    assertPositiveInteger('retryIntervalMs', this.retryIntervalMs)
    assertAbsoluteUrl(this.url)
    this.cachePath = config.cachePath
      ?? dshCachePath(config.dshHome === undefined ? {} : { dshHome: config.dshHome }, DEFAULT_CACHE_FILENAME)
    this.settled = new Promise<void>((resolve) => { this.markSettled = resolve })
    // The catalog is the provider routes' source of models, so it registers
    // itself with the LLM service: a configuration surface then knows that a
    // catalog is there to re-read.
    this.ctx.effect(() => ctx.llm.registerCatalogSource({
      catalogState: () => ({ refreshable: true }),
      refreshCatalog: async () => { await this.refresh() },
    }), 'llm-models-dev: catalog source')
    ctx.effect(() => {
      // The cache answers first: a start serves the providers it had while the
      // network decides how current they are.
      void this.restore().then(() => { this.scheduleNext() })
      return () => { this.stop() }
    })
  }

  /**
   * Settles when the service has a catalog to serve.
   *
   * A composition that restored the cached catalog answers at once; one with
   * no cache waits for the first attempt, whether it succeeded or not, so a
   * consumer reads what the service has rather than an empty catalog.
   * @returns a promise that settles once a catalog is available.
   */
  ready(): Promise<void> {
    return this.settled
  }

  /**
   * The catalog as last fetched.
   * @returns the current catalog, or `undefined` before the first successful fetch.
   */
  snapshot(): ModelsDevSnapshot | undefined {
    return this.current
  }

  /**
   * One provider's facts from the current catalog.
   * @param id - the provider's models.dev id.
   * @returns the provider's facts, or `undefined` when the catalog does not carry it.
   */
  provider(id: string): ModelsDevProviderFacts | undefined {
    return this.current?.providers.get(id)
  }

  /**
   * Fetch the catalog now and replace the current one.
   *
   * A failed fetch rejects, leaving the previous catalog in place; the
   * scheduled refresh reports its own failures and keeps going.
   * @returns the catalog that was fetched.
   * @throws Error when the endpoint is unreachable or does not answer a catalog.
   */
  async refresh(): Promise<ModelsDevSnapshot> {
    return this.load()
  }

  /** Fetch the catalog, reporting a failure without changing the current one. */
  private async load(): Promise<ModelsDevSnapshot> {
    const controller = new AbortController()
    this.inFlight = controller
    try {
      const fetched = await fetchModelsDevCatalog({
        url: this.url,
        timeoutMs: this.timeoutMs,
        maxBytes: this.maxBytes,
      }, controller.signal)
      this.current = this.includeDeprecated ? fetched : withoutDeprecated(fetched)
      this.ctx.logger.info(
        'llm-models-dev: catalog refreshed with %d provider(s) and %d model(s)',
        this.current.providers.size,
        [...this.current.providers.values()].reduce((total, provider) => total + provider.models.length, 0),
      )
      if (this.current.skippedProviders > 0 || this.current.skippedModels > 0) {
        this.ctx.logger.warn(
          'llm-models-dev: skipped %d provider record(s) and %d model record(s) the catalog did not carry in a usable form',
          this.current.skippedProviders,
          this.current.skippedModels,
        )
      }
      // The catalog is kept for the next start: a start that has one serves
      // the providers it had, whatever the network does afterwards.
      await this.keep(fetched)
      this.announceRefresh()
      return this.current
    } finally {
      this.inFlight = undefined
      this.settle()
    }
  }

  /**
   * Serve the catalog kept by the last successful fetch.
   *
   * A cache this build did not write, or one cut short by a crash, is not a
   * catalog: the restore reports absence, and the service fetches a fresh
   * document instead.
   * @returns a promise that settles once the cache has been read.
   */
  private async restore(): Promise<void> {
    const cached = await readCatalogCache(this.cachePath)
    if (cached === undefined) return
    this.current = this.includeDeprecated ? cached : withoutDeprecated(cached)
    this.ctx.logger.info(
      'llm-models-dev: serving the cached catalog with %d provider(s) fetched at %d',
      this.current.providers.size,
      this.current.fetchedAt,
    )
    this.announceRefresh()
    this.settle()
  }

  /**
   * Keep the fetched catalog for the next start.
   *
   * A cache that cannot be written is not a failed fetch: the catalog this
   * attempt fetched is already in hand, and the next start fetches again.
   * @param snapshot - the catalog as fetched.
   */
  private async keep(snapshot: ModelsDevSnapshot): Promise<void> {
    try {
      await writeCatalogCache(this.cachePath, snapshot)
    } catch (error: unknown) {
      this.ctx.logger.warn('llm-models-dev: could not write the catalog cache')
      this.ctx.logger.warn(error)
    }
  }

  /** Settle the readiness promise, once. */
  private settle(): void {
    this.markSettled?.()
    this.markSettled = undefined
  }

  /**
   * Announce the replaced catalog, containing each observer's failure.
   *
   * Cordis emit uses `Array.map`: one synchronous throw starves the later
   * listeners. A catalog replacement is already committed, so a broken
   * observer may not fail the fetch.
   */
  private announceRefresh(): void {
    for (const listener of this.ctx.events.dispatch('emit', ['llmModelsDev/refresh']) as Array<() => unknown>) {
      try {
        const returned = listener()
        if (returned != null && typeof (returned as PromiseLike<unknown>).then === 'function') {
          void Promise.resolve(returned as PromiseLike<unknown>).then(undefined, (error: unknown) => {
            this.warnRefreshListenerFailure(error)
          })
        }
      } catch (error) {
        this.warnRefreshListenerFailure(error)
      }
    }
  }

  /** Contained-listener diagnostic for the refresh announcement. */
  private warnRefreshListenerFailure(error: unknown): void {
    this.ctx.logger.warn('llm-models-dev: an llmModelsDev/refresh listener failed')
    this.ctx.logger.warn(error)
  }

  /**
   * Schedule the next fetch.
   *
   * A catalog this service already serves decides when the network is
   * consulted: a catalog younger than the refresh interval only has to catch
   * up when it grows old, and no catalog at all is fetched at once.
   */
  private scheduleNext(): void {
    const age = this.current === undefined ? undefined : Date.now() - this.current.fetchedAt
    if (age !== undefined && age < this.refreshIntervalMs) {
      this.schedule(this.refreshIntervalMs - age)
      return
    }
    this.schedule(0)
  }

  /**
   * Schedule the next fetch.
   *
   * A failed attempt is retried long before the next scheduled refresh: the
   * catalog is a list a configuration surface offers, and an empty one reads
   * as a missing provider for as long as the wait lasts.
   * @param delayMs - how long to wait before the attempt.
   */
  private schedule(delayMs: number): void {
    if (this.stopped) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.load()
        .then(() => { this.schedule(this.refreshIntervalMs) })
        .catch((error: unknown) => {
          this.ctx.logger.warn('llm-models-dev: catalog refresh failed; keeping the previous catalog')
          this.ctx.logger.warn(error)
          this.schedule(this.retryIntervalMs)
        })
    }, delayMs)
    // A pending refresh must not keep the process alive on its own.
    this.timer.unref()
  }

  /** Stop the schedule and cancel a fetch in flight. */
  private stop(): void {
    this.stopped = true
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    this.inFlight?.abort('llm-models-dev service disposed')
  }
}

export default ModelsDevCatalog
