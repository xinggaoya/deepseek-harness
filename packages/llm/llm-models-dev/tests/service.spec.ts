import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import ModelsDevCatalog from '../src/index.ts'
import { readCatalogCache } from '../src/cache.ts'

/** A catalog payload with one provider and two models. */
const CATALOG = {
  'acme-ai': {
    id: 'acme-ai',
    name: 'Acme AI',
    npm: '@ai-sdk/openai-compatible',
    api: 'https://api.acme.example/v1',
    env: ['ACME_API_KEY'],
    models: {
      'acme-large': { id: 'acme-large', name: 'Acme Large', reasoning: false },
      'acme-old': { id: 'acme-old', name: 'Acme Old', status: 'deprecated' },
    },
  },
}

/** The endpoint the catalog is fetched from in these tests. */
const URL = 'https://catalog.example/api.json'

/** Answer every fetch with the given status and body. */
function stubFetch(status: number, body: string): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, {
    status,
    headers: { 'content-type': 'application/json' },
  })))
}

let home = ''

beforeEach(async () => {
  // The cache lives in the harness home, so every case gets its own.
  home = await mkdtemp(join(tmpdir(), 'dsh-models-dev-'))
})

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  if (home !== '') await rm(home, { recursive: true, force: true })
  home = ''
})

/** A context with the LLM service the catalog registers itself with. */
async function context(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  return ctx
}

describe('ModelsDevCatalog', () => {
  it('publishes the fetched catalog and drops deprecated models by default', async () => {
    stubFetch(200, JSON.stringify(CATALOG))
    const ctx = await context()
    await ctx.plugin(ModelsDevCatalog, { url: URL, dshHome: home })
    const snapshot = await ctx.llmModelsDev.refresh()
    expect(snapshot?.providers.get('acme-ai')?.models.map(model => model.id)).toEqual(['acme-large'])
    expect(ctx.llmModelsDev.snapshot()?.providers.get('acme-ai')).toBeDefined()
    expect(ctx.llmModelsDev.provider('acme-ai')?.name).toBe('Acme AI')
    expect(ctx.llmModelsDev.provider('missing')).toBeUndefined()
    await ctx.fiber.dispose()
  })

  it('keeps deprecated models when the deployment asks for them', async () => {
    stubFetch(200, JSON.stringify(CATALOG))
    const ctx = await context()
    await ctx.plugin(ModelsDevCatalog, { url: URL, includeDeprecated: true, dshHome: home })
    const snapshot = await ctx.llmModelsDev.refresh()
    expect(snapshot?.providers.get('acme-ai')?.models.map(model => model.id)).toEqual(['acme-large', 'acme-old'])
    await ctx.fiber.dispose()
  })

  it('fetches the catalog on mount and keeps the previous one when a refresh fails', async () => {
    stubFetch(200, JSON.stringify(CATALOG))
    const ctx = await context()
    await ctx.plugin(ModelsDevCatalog, { url: URL, dshHome: home })
    await vi.waitFor(() => { expect(ctx.llmModelsDev.snapshot()).toBeDefined() })
    const first = ctx.llmModelsDev.snapshot()
    stubFetch(500, 'nope')
    await expect(ctx.llmModelsDev.refresh()).rejects.toThrow(/answered 500/)
    expect(ctx.llmModelsDev.snapshot()).toBe(first)
    await ctx.fiber.dispose()
  })

  it('refuses a configuration it cannot honor', async () => {
    const ctx = await context()
    await expect(ctx.plugin(ModelsDevCatalog, { url: 'not-a-url', dshHome: home })).rejects.toThrow(/absolute HTTP\(S\) URL/)
    await expect(ctx.plugin(ModelsDevCatalog, { url: 'ftp://catalog.example/api.json', dshHome: home })).rejects.toThrow(/http or https/)
    await expect(ctx.plugin(ModelsDevCatalog, { refreshIntervalMs: 0 })).rejects.toThrow(/refreshIntervalMs/)
    await expect(ctx.plugin(ModelsDevCatalog, { timeoutMs: -1 })).rejects.toThrow(/timeoutMs/)
    await expect(ctx.plugin(ModelsDevCatalog, { maxBytes: 1.5 })).rejects.toThrow(/maxBytes/)
    await ctx.fiber.dispose()
  })

  it('refreshes on the schedule and keeps going after a failed refresh', async () => {
    stubFetch(200, JSON.stringify(CATALOG))
    const ctx = await context()
    await ctx.plugin(ModelsDevCatalog, { url: URL, refreshIntervalMs: 10, retryIntervalMs: 10, dshHome: home })
    await vi.waitFor(() => { expect(ctx.llmModelsDev.snapshot()).toBeDefined() })
    stubFetch(500, 'nope')
    await vi.waitFor(() => { expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(2) })
    // The schedule continues after the failure.
    await vi.waitFor(() => { expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(3) })
    await ctx.fiber.dispose()
  })

  it('retries a failed attempt before the next scheduled refresh', async () => {
    stubFetch(500, 'nope')
    const ctx = await context()
    await ctx.plugin(ModelsDevCatalog, { url: URL, refreshIntervalMs: 60_000, retryIntervalMs: 10, dshHome: home })
    // The catalog is a list a configuration surface offers, so an empty one is
    // retried long before the scheduled refresh.
    await vi.waitFor(() => { expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(2) })
    await ctx.fiber.dispose()
  })

  it('keeps the fetched catalog for the next start', async () => {
    stubFetch(200, JSON.stringify(CATALOG))
    const ctx = await context()
    await ctx.plugin(ModelsDevCatalog, { url: URL, dshHome: home })
    await ctx.llmModelsDev.refresh()
    const cached = await readCatalogCache(join(home, 'cache', 'models-dev.json'))
    expect(cached?.providers.get('acme-ai')?.models.map(model => model.id)).toEqual(['acme-large', 'acme-old'])
    await ctx.fiber.dispose()
  })

  it('keeps serving a catalog it could not write to the cache', async () => {
    stubFetch(200, JSON.stringify(CATALOG))
    const ctx = await context()
    // A cache path under a file cannot be written: the catalog this attempt
    // fetched is already in hand, and the next start fetches again.
    await writeFile(join(home, 'blocked'), 'not a directory', 'utf8')
    await ctx.plugin(ModelsDevCatalog, { url: URL, cachePath: join(home, 'blocked', 'models-dev.json') })
    const snapshot = await ctx.llmModelsDev.refresh()
    expect(snapshot.providers.get('acme-ai')).toBeDefined()
    await ctx.fiber.dispose()
  })

  it('registers itself with the LLM service as a catalog that can be re-read', async () => {
    stubFetch(200, JSON.stringify(CATALOG))
    const ctx = await context()
    await ctx.plugin(ModelsDevCatalog, { url: URL, dshHome: home })
    // The provider routes draw their models from this catalog, so a
    // configuration surface can offer to fetch it again.
    expect(ctx.llm.catalogState()).toEqual({ refreshable: true })
    await ctx.llm.refreshCatalog()
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(1)
    await ctx.fiber.dispose()
  })

  it('serves the cached catalog at the next start without asking the network', async () => {
    stubFetch(200, JSON.stringify(CATALOG))
    const first = await context()
    await first.plugin(ModelsDevCatalog, { url: URL, dshHome: home })
    await first.llmModelsDev.refresh()
    await first.fiber.dispose()

    // A start that has a catalog serves it: the network only decides how
    // current it is.
    stubFetch(500, 'nope')
    const second = await context()
    await second.plugin(ModelsDevCatalog, { url: URL, dshHome: home })
    await second.llmModelsDev.ready()
    expect(second.llmModelsDev.snapshot()?.providers.get('acme-ai')?.name).toBe('Acme AI')
    expect(vi.mocked(fetch).mock.calls.length).toBe(0)
    await second.fiber.dispose()
  })

  it('keeps the cached catalog in the harness home the environment names', async () => {
    vi.stubEnv('DSH_HOME', home)
    stubFetch(200, JSON.stringify(CATALOG))
    const ctx = await context()
    await ctx.plugin(ModelsDevCatalog, { url: URL })
    await ctx.llmModelsDev.refresh()
    const cached = await readCatalogCache(join(home, 'cache', 'models-dev.json'))
    expect(cached?.providers.get('acme-ai')).toBeDefined()
    await ctx.fiber.dispose()
  })

  it('serves the cached catalog with the deprecated models a deployment asks for', async () => {
    stubFetch(200, JSON.stringify(CATALOG))
    const first = await context()
    await first.plugin(ModelsDevCatalog, { url: URL, includeDeprecated: true, dshHome: home })
    await first.llmModelsDev.refresh()
    await first.fiber.dispose()

    const second = await context()
    await second.plugin(ModelsDevCatalog, { url: URL, includeDeprecated: true, dshHome: home })
    await second.llmModelsDev.ready()
    expect(second.llmModelsDev.snapshot()?.providers.get('acme-ai')?.models.map(model => model.id))
      .toEqual(['acme-large', 'acme-old'])
    await second.fiber.dispose()
  })

  it('fetches a cached catalog that has grown old', async () => {
    stubFetch(200, JSON.stringify(CATALOG))
    const first = await context()
    await first.plugin(ModelsDevCatalog, { url: URL, dshHome: home })
    await first.llmModelsDev.refresh()
    await first.fiber.dispose()

    stubFetch(200, JSON.stringify(CATALOG))
    const second = await context()
    await second.plugin(ModelsDevCatalog, { url: URL, refreshIntervalMs: 1, dshHome: home })
    await vi.waitFor(() => { expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(1) })
    await second.fiber.dispose()
  })

  it('stops the schedule and cancels a fetch in flight when disposed', async () => {
    let release: (() => void) | undefined
    // A real fetch fails when its signal aborts, so the cancelled attempt
    // ends there: it neither answers with a catalog nor keeps one.
    vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: { signal?: AbortSignal }) => {
      await new Promise<void>((resolve, reject) => {
        release = resolve
        init?.signal?.addEventListener('abort', () => { reject(new Error('aborted')) })
      })
      return new Response(JSON.stringify(CATALOG), { status: 200 })
    }))
    const ctx = await context()
    await ctx.plugin(ModelsDevCatalog, { url: URL, dshHome: home })
    await vi.waitFor(() => { expect(release).toBeDefined() })
    const service = ctx.llmModelsDev
    await ctx.fiber.dispose()
    release?.()
    await vi.waitFor(() => { expect(vi.mocked(fetch).mock.calls).toHaveLength(1) })
    expect(service.snapshot()).toBeUndefined()
  })

  it('settles its readiness when the first attempt finishes', async () => {
    stubFetch(200, JSON.stringify(CATALOG))
    const ctx = await context()
    await ctx.plugin(ModelsDevCatalog, { url: URL, dshHome: home })
    await ctx.llmModelsDev.ready()
    expect(ctx.llmModelsDev.snapshot()).toBeDefined()
    await ctx.fiber.dispose()
  })

  it('settles its readiness when the first attempt fails', async () => {
    stubFetch(500, 'nope')
    const ctx = await context()
    await ctx.plugin(ModelsDevCatalog, { url: URL, dshHome: home })
    await ctx.llmModelsDev.ready()
    expect(ctx.llmModelsDev.snapshot()).toBeUndefined()
    await ctx.fiber.dispose()
  })

  it('reports a record the payload did not carry in a usable form', async () => {
    stubFetch(200, JSON.stringify({ 'acme-ai': { name: 'No implementation' } }))
    const ctx = await context()
    await ctx.plugin(ModelsDevCatalog, { url: URL, dshHome: home })
    const snapshot = await ctx.llmModelsDev.refresh()
    expect(snapshot?.skippedProviders).toBe(1)
    await ctx.fiber.dispose()
  })

  it('announces a replaced catalog and contains a broken observer', async () => {
    stubFetch(200, JSON.stringify(CATALOG))
    const ctx = await context()
    await ctx.plugin(ModelsDevCatalog, { url: URL, dshHome: home })
    const announced: number[] = []
    ctx.on('llmModelsDev/refresh', () => { announced.push(1); throw new Error('broken observer') })
    // Typed as returning unknown so the listener is not a Promise-returning
    // function type: the point is exactly that an async one may slip in.
    const rejecting = (): unknown => { announced.push(2); return Promise.reject(new Error('broken async observer')) }
    ctx.on('llmModelsDev/refresh', rejecting)
    await ctx.llmModelsDev.refresh()
    // The broken observer neither vetoes the replacement nor starves the next.
    expect(announced).toEqual([1, 2])
    expect(ctx.llmModelsDev.snapshot()).toBeDefined()
    await ctx.fiber.dispose()
  })
})
