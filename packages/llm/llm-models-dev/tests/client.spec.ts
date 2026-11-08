import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_MODELS_DEV_URL, fetchModelsDevCatalog } from '../src/client.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchModelsDevCatalog', () => {
  it('reads the catalog from the fork\'s proxy by default', () => {
    expect(DEFAULT_MODELS_DEV_URL).toBe('https://models.moncn.cn/api.json')
  })
  it('reads a catalog document', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })))
    const snapshot = await fetchModelsDevCatalog({
      url: 'https://catalog.example/api.json',
      timeoutMs: 1000,
      maxBytes: 1024,
    })
    expect(snapshot.providers.size).toBe(0)
  })

  it('refuses a reply that outgrows the ceiling', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x'.repeat(64), { status: 200 })))
    await expect(fetchModelsDevCatalog({
      url: 'https://catalog.example/api.json',
      timeoutMs: 1000,
      maxBytes: 8,
    })).rejects.toThrow(/exceeds 8 bytes/)
  })

  it('refuses a reply that declares a length over the ceiling', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', {
      status: 200,
      headers: { 'content-length': '4096' },
    })))
    await expect(fetchModelsDevCatalog({
      url: 'https://catalog.example/api.json',
      timeoutMs: 1000,
      maxBytes: 8,
    })).rejects.toThrow(/exceeds 8 bytes/)
  })

  it('reports an endpoint that cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await expect(fetchModelsDevCatalog({
      url: 'https://catalog.example/api.json',
      timeoutMs: 1000,
      maxBytes: 1024,
    })).rejects.toThrow(/could not reach https:\/\/catalog.example\/api.json/)
  })

  it('reports a reply that is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })))
    await expect(fetchModelsDevCatalog({
      url: 'https://catalog.example/api.json',
      timeoutMs: 1000,
      maxBytes: 1024,
    })).rejects.toThrow(/did not answer with JSON/)
  })

  it('reports an endpoint that answers a failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })))
    await expect(fetchModelsDevCatalog({
      url: 'https://catalog.example/api.json',
      timeoutMs: 1000,
      maxBytes: 1024,
    })).rejects.toThrow(/answered 503/)
  })
})
