/** The catalog's durable cache: a round trip, an absent file, and a broken one. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readCatalogCache, writeCatalogCache } from '../src/cache.ts'
import type { ModelsDevSnapshot } from '../src/types.ts'

let home = ''
let path = ''

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'dsh-models-dev-cache-'))
  path = join(home, 'cache', 'models-dev.json')
  await mkdir(join(home, 'cache'), { recursive: true })
})

afterEach(async () => {
  if (home !== '') await rm(home, { recursive: true, force: true })
  home = ''
  path = ''
})

/** One catalog with two providers, a model, and a retired model. */
const SNAPSHOT: ModelsDevSnapshot = {
  fetchedAt: 1_700_000_000_000,
  providers: new Map([
    ['acme-ai', {
      id: 'acme-ai',
      name: 'Acme AI',
      npm: '@ai-sdk/openai-compatible',
      api: 'https://api.acme.example/v1',
      env: ['ACME_API_KEY'],
      doc: 'https://acme.example/docs',
      models: [
        {
          id: 'acme-large',
          name: 'Acme Large',
          description: 'The large one',
          kind: 'chat',
          reasoning: true,
          reasoningOptions: [{ type: 'effort', values: ['low', 'high'] }],
          contextWindow: 128_000,
          maxTokens: 8_192,
          inputModalities: ['text', 'image/png'],
        },
        {
          id: 'acme-old',
          name: 'Acme Old',
          status: 'deprecated',
          reasoning: false,
          reasoningOptions: [],
          inputModalities: ['text'],
        },
      ],
    }],
    ['acme-minimal', {
      id: 'acme-minimal',
      name: 'Acme Minimal',
      npm: '@ai-sdk/anthropic',
      env: [],
      models: [],
    }],
  ]),
  skippedProviders: 1,
  skippedModels: 2,
}

describe('the catalog cache', () => {
  it('keeps the facts a fetch carried', async () => {
    await writeCatalogCache(path, SNAPSHOT)
    const cached = await readCatalogCache(path)
    expect(cached?.fetchedAt).toBe(SNAPSHOT.fetchedAt)
    expect(cached?.skippedProviders).toBe(1)
    expect(cached?.skippedModels).toBe(2)
    const provider = cached?.providers.get('acme-ai')
    expect(provider?.name).toBe('Acme AI')
    expect(provider?.npm).toBe('@ai-sdk/openai-compatible')
    expect(provider?.api).toBe('https://api.acme.example/v1')
    expect(provider?.env).toEqual(['ACME_API_KEY'])
    expect(provider?.doc).toBe('https://acme.example/docs')
    expect(provider?.models[0]?.reasoningOptions).toEqual([{ type: 'effort', values: ['low', 'high'] }])
    expect(provider?.models[0]?.description).toBe('The large one')
    expect(provider?.models[0]?.kind).toBe('chat')
    expect(provider?.models[0]?.contextWindow).toBe(128_000)
    expect(provider?.models[0]?.inputModalities).toEqual(['text', 'image/png'])
    expect(provider?.models[1]?.status).toBe('deprecated')
    // A provider that states no endpoint or documentation keeps neither.
    const minimal = cached?.providers.get('acme-minimal')
    expect(minimal?.api).toBeUndefined()
    expect(minimal?.doc).toBeUndefined()
    expect(minimal?.models).toEqual([])
  })

  it('reports absence for a file there is none of', async () => {
    expect(await readCatalogCache(path)).toBeUndefined()
  })

  it('reports absence for a file that is not a catalog', async () => {
    await writeFile(path, 'not json at all', 'utf8')
    expect(await readCatalogCache(path)).toBeUndefined()
  })

  it('reports absence for a catalog another version wrote', async () => {
    await writeFile(path, JSON.stringify({ version: 99, fetchedAt: 1, providers: {} }), 'utf8')
    expect(await readCatalogCache(path)).toBeUndefined()
  })

  it('drops a record that does not carry the facts a provider needs', async () => {
    await writeFile(path, JSON.stringify({
      version: 1,
      fetchedAt: 1,
      providers: { 'acme-ai': { id: 'acme-ai', name: 'Acme AI' } },
      skippedProviders: 0,
      skippedModels: 0,
    }), 'utf8')
    const cached = await readCatalogCache(path)
    expect(cached?.providers.size).toBe(0)
  })

  it('reads a provider whose models and fields are missing', async () => {
    await writeFile(path, JSON.stringify({
      version: 1,
      fetchedAt: 1,
      providers: { 'acme-ai': { id: 'acme-ai', name: 'Acme AI', npm: '@ai-sdk/anthropic' } },
    }), 'utf8')
    const provider = (await readCatalogCache(path))?.providers.get('acme-ai')
    expect(provider?.models).toEqual([])
    expect(provider?.env).toEqual([])
    expect(provider?.api).toBeUndefined()
    expect(provider?.doc).toBeUndefined()
  })

  it('reads a provider whose id or name is missing', async () => {
    await writeFile(path, JSON.stringify({
      version: 1,
      fetchedAt: 1,
      providers: {
        'no-id': { name: 'No Id', npm: '@ai-sdk/anthropic' },
        'no-name': { id: 'no-name', npm: '@ai-sdk/anthropic' },
        'no-npm': { id: 'no-npm', name: 'No Npm' },
      },
    }), 'utf8')
    expect((await readCatalogCache(path))?.providers.size).toBe(0)
  })

  it('reads the reasoning controls a model record lists', async () => {
    await writeFile(path, JSON.stringify({
      version: 1,
      fetchedAt: 1,
      providers: {
        'acme-ai': {
          id: 'acme-ai',
          name: 'Acme AI',
          npm: '@ai-sdk/anthropic',
          models: [{
            id: 'acme-large',
            name: 'Acme Large',
            reasoningOptions: [
              { type: 'toggle' },
              { type: 'effort', values: ['low', 'unknown'] },
              { type: 'budget_tokens', min: 1024, max: 8192 },
              { type: 'unknown' },
              'not a record',
            ],
          }],
        },
      },
    }), 'utf8')
    const model = (await readCatalogCache(path))?.providers.get('acme-ai')?.models[0]
    expect(model?.reasoningOptions).toEqual([
      { type: 'toggle' },
      { type: 'effort', values: ['low'] },
      { type: 'budget_tokens', min: 1024, max: 8192 },
    ])
  })

  it('reads a model whose identifying fields are missing', async () => {
    await writeFile(path, JSON.stringify({
      version: 1,
      fetchedAt: 1,
      providers: {
        'acme-ai': {
          id: 'acme-ai',
          name: 'Acme AI',
          npm: '@ai-sdk/anthropic',
          models: [
            { name: 'No Id' },
            { id: 'no-name' },
            { id: 'acme-large', name: 'Acme Large' },
          ],
        },
      },
    }), 'utf8')
    const models = (await readCatalogCache(path))?.providers.get('acme-ai')?.models
    expect(models?.map(model => model.id)).toEqual(['acme-large'])
  })

  it('reads a model whose optional fields are absent or unusable', async () => {
    await writeFile(path, JSON.stringify({
      version: 1,
      fetchedAt: 1,
      providers: {
        'acme-ai': {
          id: 'acme-ai',
          name: 'Acme AI',
          npm: '@ai-sdk/anthropic',
          models: [{
            id: 'acme-large',
            name: 'Acme Large',
            description: 7,
            kind: 'chat',
            status: 'retired',
            reasoning: 'yes',
            contextWindow: 'lots',
            maxTokens: 4096,
            inputModalities: 'text',
          }],
        },
      },
    }), 'utf8')
    const model = (await readCatalogCache(path))?.providers.get('acme-ai')?.models[0]
    expect(model?.description).toBeUndefined()
    expect(model?.kind).toBe('chat')
    expect(model?.status).toBeUndefined()
    expect(model?.reasoning).toBe(false)
    expect(model?.contextWindow).toBeUndefined()
    expect(model?.maxTokens).toBe(4096)
    expect(model?.inputModalities).toEqual([])
  })

  it('reads a record that is not a record at all', async () => {
    await writeFile(path, JSON.stringify({
      version: 1,
      fetchedAt: 1,
      providers: { 'acme-ai': 'not a provider' },
    }), 'utf8')
    expect((await readCatalogCache(path))?.providers.size).toBe(0)
  })

  it('reads a provider whose model is not a record at all', async () => {
    await writeFile(path, JSON.stringify({
      version: 1,
      fetchedAt: 1,
      providers: {
        'acme-ai': {
          id: 'acme-ai',
          name: 'Acme AI',
          npm: '@ai-sdk/anthropic',
          models: ['not a model'],
        },
      },
    }), 'utf8')
    expect((await readCatalogCache(path))?.providers.get('acme-ai')?.models).toEqual([])
  })

  it('reads a document that names no provider at all', async () => {
    await writeFile(path, JSON.stringify({ version: 1, fetchedAt: 1 }), 'utf8')
    expect((await readCatalogCache(path))?.providers.size).toBe(0)
  })

  it('reads a reasoning budget that names no bound', async () => {
    await writeFile(path, JSON.stringify({
      version: 1,
      fetchedAt: 1,
      providers: {
        'acme-ai': {
          id: 'acme-ai',
          name: 'Acme AI',
          npm: '@ai-sdk/anthropic',
          models: [{
            id: 'acme-large',
            name: 'Acme Large',
            reasoningOptions: [{ type: 'budget_tokens' }],
          }],
        },
      },
    }), 'utf8')
    const model = (await readCatalogCache(path))?.providers.get('acme-ai')?.models[0]
    expect(model?.reasoningOptions).toEqual([{ type: 'budget_tokens' }])
  })

  it('reports absence for a document that is not a catalog at all', async () => {
    await writeFile(path, JSON.stringify({ version: 1, providers: {} }), 'utf8')
    expect(await readCatalogCache(path)).toBeUndefined()
  })

  it('counts no skipped record for a document that states none', async () => {
    await writeFile(path, JSON.stringify({ version: 1, fetchedAt: 1, providers: {} }), 'utf8')
    const cached = await readCatalogCache(path)
    expect(cached?.skippedProviders).toBe(0)
    expect(cached?.skippedModels).toBe(0)
  })
})
