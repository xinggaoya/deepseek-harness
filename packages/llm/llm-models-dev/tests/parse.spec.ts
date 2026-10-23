import { describe, expect, it } from 'vitest'
import { parseModelsDevCatalog } from '../src/parse.ts'

/** A payload with one provider and one model, as models.dev serves it. */
function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    'acme-ai': {
      id: 'acme-ai',
      name: 'Acme AI',
      npm: '@ai-sdk/openai-compatible',
      api: 'https://api.acme.example/v1',
      env: ['ACME_API_KEY'],
      doc: 'https://acme.example/docs',
      models: {
        'acme-large': {
          id: 'acme-large',
          name: 'Acme Large',
          description: 'A large model',
          reasoning: true,
          reasoning_options: [{ type: 'effort', values: ['low', 'high'] }],
          tool_call: true,
          release_date: '2026-01-01',
          last_updated: '2026-01-02',
          modalities: { input: ['text', 'image'], output: ['text'] },
          open_weights: false,
          limit: { context: 128000, output: 8192 },
          cost: { input: 1, output: 2 },
        },
      },
      ...overrides,
    },
  }
}

describe('parseModelsDevCatalog', () => {
  it('reads the provider and model facts a consumer needs', () => {
    const snapshot = parseModelsDevCatalog(payload(), 1234)
    expect(snapshot.fetchedAt).toBe(1234)
    expect(snapshot.skippedProviders).toBe(0)
    expect(snapshot.skippedModels).toBe(0)
    const provider = snapshot.providers.get('acme-ai')
    expect(provider).toBeDefined()
    expect(provider?.name).toBe('Acme AI')
    expect(provider?.npm).toBe('@ai-sdk/openai-compatible')
    expect(provider?.api).toBe('https://api.acme.example/v1')
    expect(provider?.env).toEqual(['ACME_API_KEY'])
    expect(provider?.doc).toBe('https://acme.example/docs')
    const model = provider?.models[0]
    expect(model?.id).toBe('acme-large')
    expect(model?.name).toBe('Acme Large')
    expect(model?.description).toBe('A large model')
    expect(model?.reasoning).toBe(true)
    expect(model?.reasoningOptions).toEqual([{ type: 'effort', values: ['low', 'high'] }])
    expect(model?.contextWindow).toBe(128000)
    expect(model?.maxTokens).toBe(8192)
    expect(model?.inputModalities).toEqual(['text', 'image'])
    expect(model?.status).toBeUndefined()
    expect(model?.kind).toBeUndefined()
  })

  it('falls back to the record keys when a record states no identity', () => {
    const snapshot = parseModelsDevCatalog({
      'acme-ai': {
        npm: '@ai-sdk/openai-compatible',
        models: { 'acme-small': { name: '' } },
      },
    }, 0)
    const provider = snapshot.providers.get('acme-ai')
    expect(provider?.id).toBe('acme-ai')
    expect(provider?.name).toBe('acme-ai')
    expect(provider?.api).toBeUndefined()
    expect(provider?.env).toEqual([])
    expect(provider?.doc).toBeUndefined()
    const model = provider?.models[0]
    expect(model?.id).toBe('acme-small')
    expect(model?.name).toBe('acme-small')
    expect(model?.description).toBeUndefined()
    expect(model?.reasoning).toBe(false)
    expect(model?.reasoningOptions).toEqual([])
    expect(model?.contextWindow).toBeUndefined()
    expect(model?.maxTokens).toBeUndefined()
    expect(model?.inputModalities).toEqual([])
  })

  it('skips a provider record that names no implementation', () => {
    const snapshot = parseModelsDevCatalog({
      'acme-ai': { name: 'Acme AI' },
      'acme-ai-2': { name: 'Acme AI 2', npm: '@ai-sdk/anthropic' },
      'acme-ai-3': 'not-a-record',
    }, 0)
    expect(snapshot.providers.has('acme-ai')).toBe(false)
    expect(snapshot.providers.has('acme-ai-2')).toBe(true)
    expect(snapshot.skippedProviders).toBe(2)
  })

  it('counts a model record that carries no identity at all', () => {
    const snapshot = parseModelsDevCatalog({
      'acme-ai': {
        npm: '@ai-sdk/anthropic',
        models: { broken: 'not-a-record', good: { id: 'good' } },
      },
    }, 0)
    expect(snapshot.providers.get('acme-ai')?.models.map(model => model.id)).toEqual(['good'])
    expect(snapshot.skippedModels).toBe(1)
  })

  it('reads every reasoning control a model offers', () => {
    const snapshot = parseModelsDevCatalog({
      acme: {
        npm: '@ai-sdk/anthropic',
        models: {
          m: {
            reasoning_options: [
              { type: 'toggle' },
              { type: 'effort', values: ['none', 'minimal', 'default', 'unknown', 42] },
              { type: 'budget_tokens', min: 1024, max: 8192 },
              { type: 'budget_tokens' },
              { type: 'unknown-kind' },
              'not-a-record',
            ],
          },
        },
      },
    }, 0)
    expect(snapshot.providers.get('acme')?.models[0]?.reasoningOptions).toEqual([
      { type: 'toggle' },
      { type: 'effort', values: ['none', 'minimal', 'default'] },
      { type: 'budget_tokens', min: 1024, max: 8192 },
      { type: 'budget_tokens' },
    ])
  })

  it('reads the model kind and lifecycle state a record states', () => {
    const snapshot = parseModelsDevCatalog({
      acme: {
        npm: '@ai-sdk/anthropic',
        models: {
          a: { type: 'chat' },
          b: { type: 'embedding' },
          c: { status: 'deprecated' },
          d: { status: 'beta' },
          e: { status: 'unknown' },
        },
      },
    }, 0)
    const models = snapshot.providers.get('acme')?.models ?? []
    expect(models.find(model => model.id === 'a')?.kind).toBe('chat')
    expect(models.find(model => model.id === 'b')?.kind).toBe('embedding')
    expect(models.find(model => model.id === 'c')?.status).toBe('deprecated')
    expect(models.find(model => model.id === 'd')?.status).toBe('beta')
    expect(models.find(model => model.id === 'e')?.status).toBeUndefined()
  })

  it('ignores capacities that are not positive integers', () => {
    const snapshot = parseModelsDevCatalog({
      acme: {
        npm: '@ai-sdk/anthropic',
        models: {
          a: { limit: { context: 0, output: 4096.5 } },
          b: { limit: 'not-a-record' },
          c: { limit: { context: 'many', output: 2048 } },
        },
      },
    }, 0)
    const models = snapshot.providers.get('acme')?.models ?? []
    expect(models.find(model => model.id === 'a')?.contextWindow).toBeUndefined()
    expect(models.find(model => model.id === 'a')?.maxTokens).toBeUndefined()
    expect(models.find(model => model.id === 'b')?.contextWindow).toBeUndefined()
    expect(models.find(model => model.id === 'c')?.contextWindow).toBeUndefined()
    expect(models.find(model => model.id === 'c')?.maxTokens).toBe(2048)
  })

  it('reads only the string input types a record lists', () => {
    const snapshot = parseModelsDevCatalog({
      acme: {
        npm: '@ai-sdk/anthropic',
        models: {
          a: { modalities: { input: ['text', 'image/png', 7, ''] } },
          b: { modalities: 'not-a-record' },
          c: { modalities: { input: 'text' } },
        },
      },
    }, 0)
    const models = snapshot.providers.get('acme')?.models ?? []
    expect(models.find(model => model.id === 'a')?.inputModalities).toEqual(['text', 'image/png'])
    expect(models.find(model => model.id === 'b')?.inputModalities).toEqual([])
    expect(models.find(model => model.id === 'c')?.inputModalities).toEqual([])
  })

  it('reads a provider whose model map is not a record', () => {
    const snapshot = parseModelsDevCatalog({ acme: { npm: '@ai-sdk/anthropic', models: 'none' } }, 0)
    expect(snapshot.providers.get('acme')?.models).toEqual([])
    expect(snapshot.skippedModels).toBe(0)
  })

  it('reads an empty catalog from a payload that is not a record', () => {
    for (const payload of [null, 'text', 42, [1, 2]]) {
      const snapshot = parseModelsDevCatalog(payload, 0)
      expect(snapshot.providers.size).toBe(0)
      expect(snapshot.skippedProviders).toBe(0)
    }
  })
})
