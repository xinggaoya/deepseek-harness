import { describe, expect, it, vi } from 'vitest'

describe('models.dev catalog guard', () => {
  it('keeps the catalog row unmounted in suites and in the processes they spawn', () => {
    expect(process.env.DSH_MODELS_DEV_CATALOG_DISABLED).toBe('1')
  })

  it('refuses the catalog endpoints and passes every other request through', async () => {
    const installed = globalThis.fetch
    const ambient = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', ambient)
    vi.resetModules()
    await import('./test-models-dev-catalog-guard.ts')
    await expect(globalThis.fetch('https://models.moncn.cn/api.json')).rejects.toThrow(/do not reach/)
    await expect(globalThis.fetch('https://models.dev/api.json')).rejects.toThrow(/do not reach/)
    await expect(globalThis.fetch('http://127.0.0.1:1/catalog.json')).resolves.toBeInstanceOf(Response)
    expect(ambient).toHaveBeenCalledTimes(1)
    globalThis.fetch = installed
    vi.unstubAllGlobals()
  })
})
