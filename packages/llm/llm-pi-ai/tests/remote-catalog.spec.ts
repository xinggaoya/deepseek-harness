import { describe, expect, it } from 'vitest'
import type { Api, Model } from '@earendil-works/pi-ai'
import type { ModelsDevProviderFacts } from '@deepseek-ai/dsh-llm-models-dev'
import { catalogModels } from '../src/catalog.ts'
import { resolveProfiles } from '../src/config.ts'
import { PiAiAdapter } from '../src/adapter.ts'
import { modelsDevCatalog, modelsDevProviders } from '../src/models-dev-catalog.ts'
import { mergeRemoteCatalog } from '../src/remote-catalog.ts'
import { getSupportedThinkingLevels } from '../src/models.ts'
import { memoryAuth } from './auth-double.ts'

/** The provider facts models.dev records for a MiniMax route. */
function minimaxFacts(overrides: Partial<ModelsDevProviderFacts> = {}): ModelsDevProviderFacts {
  return {
    id: 'minimax-cn',
    name: 'MiniMax (minimax.cn)',
    npm: '@ai-sdk/anthropic',
    api: 'https://api.minimax.cn/anthropic/v1',
    env: ['MINIMAX_API_KEY'],
    models: [
      {
        id: 'MiniMax-M3.1-Flash',
        name: 'MiniMax-M3.1-Flash',
        reasoning: true,
        reasoningOptions: [{ type: 'effort', values: ['low', 'medium', 'high', 'xhigh', 'max'] }],
        contextWindow: 1000000,
        maxTokens: 524288,
        inputModalities: ['text', 'image', 'video'],
      },
      {
        id: 'MiniMax-M2.7',
        name: 'MiniMax-M2.7',
        status: 'deprecated',
        reasoning: true,
        reasoningOptions: [],
        contextWindow: 204800,
        maxTokens: 131072,
        inputModalities: ['text'],
      },
    ],
    ...overrides,
  }
}

/** The provider facts of a provider that states no endpoint at all. */
function minimaxFactsWithoutEndpoint(overrides: Partial<ModelsDevProviderFacts> = {}): ModelsDevProviderFacts {
  const { api: _api, ...rest } = minimaxFacts(overrides)
  return rest
}

describe('modelsDevProviders', () => {
  it('offers a provider whose package names a protocol this build serves', () => {
    const entries = modelsDevProviders([minimaxFacts()])
    expect(entries).toEqual([{
      provider: 'minimax-cn',
      defaultBaseURL: 'https://api.minimax.cn/anthropic',
      api: 'anthropic-messages',
      env: ['MINIMAX_API_KEY'],
    }])
  })

  it('leaves out a provider whose package names a protocol this build cannot construct', () => {
    expect(modelsDevProviders([minimaxFacts({ npm: '@ai-sdk/google' })])).toEqual([])
  })

  it('leaves out a provider the source records no chat model for', () => {
    const facts = minimaxFacts({
      models: [{
        id: 'acme-embedding',
        name: 'Acme Embedding',
        kind: 'embedding',
        reasoning: false,
        reasoningOptions: [],
        inputModalities: ['text'],
      }],
    })
    expect(modelsDevProviders([facts])).toEqual([])
  })

  it('states no endpoint for a provider that publishes none', () => {
    expect(modelsDevProviders([minimaxFactsWithoutEndpoint()]))
      .toEqual([{ provider: 'minimax-cn', api: 'anthropic-messages', env: ['MINIMAX_API_KEY'] }])
  })
})

describe('modelsDevCatalog', () => {
  it('reads the protocol the provider AI SDK package speaks', () => {
    const catalog = modelsDevCatalog(minimaxFacts())
    expect(catalog.api).toBe('anthropic-messages')
    // The Anthropic endpoint is published with its `/v1` segment, which pi-ai's
    // Anthropic implementation appends itself.
    expect(catalog.baseUrl).toBe('https://api.minimax.cn/anthropic')
  })

  it('reads the environment the provider credential is read from', () => {
    expect(modelsDevCatalog(minimaxFacts()).env).toEqual(['MINIMAX_API_KEY'])
    expect(modelsDevCatalog(minimaxFacts({ env: [] })).env).toEqual([])
  })

  it('reads the protocol of an OpenAI-compatible provider and keeps its endpoint', () => {
    const catalog = modelsDevCatalog(minimaxFacts({
      id: 'acme-ai',
      npm: '@ai-sdk/openai-compatible',
      api: 'https://api.acme.example/v1',
    }))
    expect(catalog.api).toBe('openai-completions')
    expect(catalog.baseUrl).toBe('https://api.acme.example/v1')
  })

  it('states no protocol for a package this build cannot serve', () => {
    const catalog = modelsDevCatalog(minimaxFacts({ npm: '@ai-sdk/google' }))
    expect(catalog.api).toBeUndefined()
  })

  it('states no endpoint for one that publishes a placeholder or none', () => {
    expect(modelsDevCatalog(minimaxFacts({ api: 'https://${ACCOUNT}.acme.example/v1' })).baseUrl).toBeUndefined()
    expect(modelsDevCatalog(minimaxFacts({ api: '' })).baseUrl).toBeUndefined()
    expect(modelsDevCatalog(minimaxFactsWithoutEndpoint()).baseUrl).toBeUndefined()
  })

  it('reads the modalities a model accepts, dropping the ones pi-ai cannot carry', () => {
    const catalog = modelsDevCatalog(minimaxFacts())
    expect(catalog.models[0]?.input).toEqual(['text', 'image'])
  })

  it('falls back to text for a model that records no input type', () => {
    const catalog = modelsDevCatalog(minimaxFacts({
      models: [{ id: 'plain', name: 'Plain', reasoning: false, reasoningOptions: [], inputModalities: [] }],
    }))
    expect(catalog.models[0]?.input).toEqual(['text'])
  })

  it('keeps an Anthropic endpoint that does not carry its version segment', () => {
    const catalog = modelsDevCatalog(minimaxFacts({ api: 'https://api.acme.example/anthropic' }))
    expect(catalog.baseUrl).toBe('https://api.acme.example/anthropic')
  })

  it('keeps a model the catalog records as a chat model', () => {
    const catalog = modelsDevCatalog(minimaxFacts({
      models: [{ id: 'chatter', name: 'Chatter', kind: 'chat', reasoning: false, reasoningOptions: [], inputModalities: ['text'] }],
    }))
    expect(catalog.models.map(model => model.id)).toEqual(['chatter'])
  })

  it('reads the thinking levels a model offers', () => {
    const catalog = modelsDevCatalog(minimaxFacts())
    expect(catalog.models[0]?.thinkingLevelMap).toEqual({
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: 'xhigh',
      max: 'max',
      off: null,
    })
    expect(catalog.models[0]?.forceAdaptiveThinking).toBe(true)
  })

  it('leaves the levels alone for a model that records no effort control', () => {
    const catalog = modelsDevCatalog(minimaxFacts())
    expect(catalog.models[1]?.thinkingLevelMap).toBeUndefined()
    expect(catalog.models[1]?.forceAdaptiveThinking).toBeUndefined()
  })

  it('reads the levels of a model whose efforts include turning reasoning off', () => {
    const catalog = modelsDevCatalog(minimaxFacts({
      models: [{
        id: 'off-model',
        name: 'Off Model',
        reasoning: true,
        reasoningOptions: [{ type: 'effort', values: ['none', 'low', 'default'] }],
        inputModalities: ['text'],
      }],
    }))
    expect(catalog.models[0]?.thinkingLevelMap).toEqual({
      minimal: null,
      low: 'low',
      medium: null,
      high: null,
      xhigh: null,
      max: null,
    })
  })

  it('reads the levels of a model whose reasoning can be turned off and tuned', () => {
    const catalog = modelsDevCatalog(minimaxFacts({
      models: [{
        id: 'both-model',
        name: 'Both Model',
        reasoning: true,
        reasoningOptions: [{ type: 'toggle' }, { type: 'effort', values: ['low', 'high'] }],
        inputModalities: ['text'],
      }],
    }))
    expect(catalog.models[0]?.thinkingLevelMap).toEqual({
      minimal: null,
      low: 'low',
      medium: null,
      high: 'high',
      xhigh: null,
      max: null,
    })
  })

  it('reads a model whose reasoning is bounded by a token budget', () => {
    const catalog = modelsDevCatalog(minimaxFacts({
      models: [{
        id: 'budget-model',
        name: 'Budget Model',
        reasoning: true,
        reasoningOptions: [{ type: 'budget_tokens', min: 1024, max: 8192 }],
        inputModalities: ['text'],
      }],
    }))
    expect(catalog.models[0]?.thinkingLevelMap).toBeUndefined()
    expect(catalog.models[0]?.forceAdaptiveThinking).toBeUndefined()
  })

  it('reads the image types a model accepts as one modality', () => {
    const catalog = modelsDevCatalog(minimaxFacts({
      models: [{
        id: 'typed-image',
        name: 'Typed Image',
        reasoning: false,
        reasoningOptions: [],
        inputModalities: ['image/png'],
      }],
    }))
    expect(catalog.models[0]?.input).toEqual(['image'])
  })

  it('reads a model the catalog states no capacity for', () => {
    const catalog = modelsDevCatalog(minimaxFacts({
      models: [{
        id: 'plain',
        name: 'Plain',
        reasoning: false,
        reasoningOptions: [],
        inputModalities: ['text'],
      }],
    }))
    expect(catalog.models[0]?.contextWindow).toBeUndefined()
    expect(catalog.models[0]?.maxTokens).toBeUndefined()
  })

  it('offers the off level for a model whose reasoning can be turned off', () => {
    const catalog = modelsDevCatalog(minimaxFacts({
      models: [{
        id: 'toggle-model',
        name: 'Toggle Model',
        reasoning: true,
        reasoningOptions: [{ type: 'toggle' }],
        inputModalities: ['text'],
      }],
    }))
    expect(catalog.models[0]?.thinkingLevelMap).toBeUndefined()
  })

  it('leaves out a model that is not a chat model', () => {
    const catalog = modelsDevCatalog(minimaxFacts({
      models: [
        { id: 'embedder', name: 'Embedder', kind: 'embedding', reasoning: false, reasoningOptions: [], inputModalities: ['text'] },
        { id: 'chatter', name: 'Chatter', reasoning: false, reasoningOptions: [], inputModalities: ['text'] },
      ],
    }))
    expect(catalog.models.map(model => model.id)).toEqual(['chatter'])
  })
})

describe('mergeRemoteCatalog', () => {
  it('keeps the installed entry protocol knowledge and takes the source facts', () => {
    const installed = catalogModels('minimax-cn')
    const merged = mergeRemoteCatalog('minimax-cn', modelsDevCatalog(minimaxFacts()), installed, {
      providerBaseUrl: 'https://api.minimaxi.com/anthropic',
      defaultContextWindow: 262144,
      defaultMaxTokens: 32768,
    })
    const flash = merged.get('MiniMax-M3.1-Flash')
    expect(flash?.api).toBe('anthropic-messages')
    expect(flash?.baseUrl).toBe('https://api.minimaxi.com/anthropic')
    expect(flash?.contextWindow).toBe(1000000)
    expect(flash?.maxTokens).toBe(524288)
    expect(flash?.input).toEqual(['text', 'image'])
    expect(flash?.reasoning).toBe(true)
    expect(getSupportedThinkingLevels(flash as Model<Api>)).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
  })

  it('gives a model only the source describes the source protocol and endpoint', () => {
    const merged = mergeRemoteCatalog('acme-ai', modelsDevCatalog(minimaxFacts({
      id: 'acme-ai',
      npm: '@ai-sdk/openai-compatible',
      api: 'https://api.acme.example/v1',
    })), new Map(), {
      defaultContextWindow: 262144,
      defaultMaxTokens: 32768,
    })
    const flash = merged.get('MiniMax-M3.1-Flash')
    expect(flash?.api).toBe('openai-completions')
    expect(flash?.baseUrl).toBe('https://api.acme.example/v1')
    expect(flash?.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
  })

  it('leaves out a model that has neither a protocol nor an endpoint to reach', () => {
    const merged = mergeRemoteCatalog('acme-ai', modelsDevCatalog(minimaxFactsWithoutEndpoint({
      id: 'acme-ai',
      npm: '@ai-sdk/google',
    })), new Map(), {
      defaultContextWindow: 262144,
      defaultMaxTokens: 32768,
    })
    expect(merged.size).toBe(0)
  })

  it('falls back to the route fallbacks for a model neither catalog sizes', () => {
    const merged = mergeRemoteCatalog('acme-ai', modelsDevCatalog(minimaxFacts({
      id: 'acme-ai',
      npm: '@ai-sdk/openai-compatible',
      api: 'https://api.acme.example/v1',
      models: [{ id: 'plain', name: 'Plain', reasoning: false, reasoningOptions: [], inputModalities: ['text'] }],
    })), new Map(), {
      defaultContextWindow: 262144,
      defaultMaxTokens: 32768,
    })
    expect(merged.get('plain')?.contextWindow).toBe(262144)
    expect(merged.get('plain')?.maxTokens).toBe(32768)
  })
})

describe('resolveProfiles with a catalog source', () => {
  it('serves the models the source describes', () => {
    const source = modelsDevCatalog(minimaxFacts())
    const profiles = resolveProfiles({
      'minimax-cn': { apiKeyEnv: 'MINIMAX_CN_API_KEY' },
    }, 'strict', provider => (provider === 'minimax-cn' ? source : undefined))
    const route = profiles.get('minimax-cn')
    expect(route?.piProvider?.getModels().map(model => model.id)).toEqual(['MiniMax-M3.1-Flash', 'MiniMax-M2.7'])
    expect(route?.modelErrors.size).toBe(0)
  })

  it('serves the installed catalog for a route the source does not describe', () => {
    const profiles = resolveProfiles({
      'minimax-cn': { apiKeyEnv: 'MINIMAX_CN_API_KEY' },
    }, 'strict', () => undefined)
    expect(profiles.get('minimax-cn')?.piProvider?.getModels().map(model => model.id))
      .toEqual(['MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'MiniMax-M3'])
  })

  it('lets an explicit model list replace the source', () => {
    const source = modelsDevCatalog(minimaxFacts())
    const profiles = resolveProfiles({
      'minimax-cn': {
        apiKeyEnv: 'MINIMAX_CN_API_KEY',
        models: [{ id: 'only-this', contextWindow: 4096 }],
      },
    }, 'strict', provider => (provider === 'minimax-cn' ? source : undefined))
    expect(profiles.get('minimax-cn')?.piProvider?.getModels().map(model => model.id)).toEqual(['only-this'])
  })

  it('lets a model override reshape a model the source describes', () => {
    const source = modelsDevCatalog(minimaxFacts())
    const profiles = resolveProfiles({
      'minimax-cn': {
        apiKeyEnv: 'MINIMAX_CN_API_KEY',
        modelOverrides: { 'MiniMax-M3.1-Flash': { contextWindow: 200000 } },
      },
    }, 'strict', provider => (provider === 'minimax-cn' ? source : undefined))
    const model = profiles.get('minimax-cn')?.piProvider?.getModels()[0]
    expect(model?.contextWindow).toBe(200000)
  })

  it('serves a route that declares its own protocol and endpoint', () => {
    const source = modelsDevCatalog(minimaxFacts({
      id: 'acme-ai',
      npm: '@ai-sdk/openai-compatible',
      api: 'https://api.acme.example/v1',
    }))
    const profiles = resolveProfiles({
      'acme-ai': {
        apiKeyEnv: 'MINIMAX_CN_API_KEY',
        api: 'openai-completions',
        baseURL: 'https://gateway.acme.example/v1',
      },
    }, 'strict', provider => (provider === 'acme-ai' ? source : undefined))
    const model = profiles.get('acme-ai')?.piProvider?.getModels()[0]
    expect(model?.api).toBe('openai-completions')
    expect(model?.baseUrl).toBe('https://gateway.acme.example/v1')
  })

  it('reports a route whose source names neither a protocol nor an endpoint', () => {
    const source = modelsDevCatalog(minimaxFactsWithoutEndpoint({
      id: 'acme-ai',
      npm: '@ai-sdk/google',
    }))
    const profiles = resolveProfiles({
      'acme-ai': { apiKeyEnv: 'MINIMAX_CN_API_KEY' },
    }, 'deferred', provider => (provider === 'acme-ai' ? source : undefined))
    const route = profiles.get('acme-ai')
    expect(route?.piProvider).toBeUndefined()
    expect(route?.catalogError).toMatch(/describes no model this route can reach/)
  })

  it('refuses an override naming a model the source does not describe', () => {
    const source = modelsDevCatalog(minimaxFacts())
    expect(() => resolveProfiles({
      'minimax-cn': {
        apiKeyEnv: 'MINIMAX_CN_API_KEY',
        modelOverrides: { 'absent-model': { contextWindow: 200000 } },
      },
    }, 'strict', provider => (provider === 'minimax-cn' ? source : undefined))).toThrow(/does not describe/)
  })

  it('carries the environment the source records for the route', () => {
    const source = modelsDevCatalog(minimaxFacts())
    const profiles = resolveProfiles({
      'minimax-cn': { apiKeyEnv: 'MINIMAX_CN_API_KEY' },
    }, 'strict', provider => (provider === 'minimax-cn' ? source : undefined))
    expect(profiles.get('minimax-cn')?.nativeEnv).toEqual(['MINIMAX_API_KEY'])
  })

  it('authenticates a route that names no reference from the source environment', async () => {
    const source = modelsDevCatalog(minimaxFacts({
      id: 'acme-ai',
      npm: '@ai-sdk/openai-compatible',
      api: 'https://api.acme.example/v1',
    }))
    const profiles = resolveProfiles({
      'acme-ai': {},
    }, 'strict', provider => (provider === 'acme-ai' ? source : undefined))
    const auth = profiles.get('acme-ai')?.piProvider?.auth.apiKey
    const resolved = await auth?.resolve({
      ctx: {
        env: (name: string) => Promise.resolve(name === 'MINIMAX_API_KEY' ? 'env-key' : undefined),
        fileExists: () => Promise.resolve(false),
      },
      signal: new AbortController().signal,
    })
    expect(resolved?.auth.apiKey).toBe('env-key')
    expect(resolved?.source).toBe('MINIMAX_API_KEY')
  })

  it('prefers the request key over the source environment', async () => {
    const source = modelsDevCatalog(minimaxFacts({
      id: 'acme-ai',
      npm: '@ai-sdk/openai-compatible',
      api: 'https://api.acme.example/v1',
    }))
    const profiles = resolveProfiles({
      'acme-ai': {},
    }, 'strict', provider => (provider === 'acme-ai' ? source : undefined))
    const auth = profiles.get('acme-ai')?.piProvider?.auth.apiKey
    const resolved = await auth?.resolve({
      ctx: {
        env: (name: string) => Promise.resolve(name === 'MINIMAX_API_KEY' ? 'env-key' : undefined),
        fileExists: () => Promise.resolve(false),
      },
      credential: { type: 'api_key', key: 'request-key' },
      signal: new AbortController().signal,
    })
    expect(resolved?.auth.apiKey).toBe('request-key')
  })

  it('waits for the catalog before it reports the model it names', async () => {
    const source = modelsDevCatalog(minimaxFacts())
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    const adapter = new PiAiAdapter({
      profiles: () => resolveProfiles({
        'minimax-cn': { apiKeyEnv: 'MINIMAX_CN_API_KEY' },
      }, 'strict', provider => (provider === 'minimax-cn' ? source : undefined)),
      resolveApiKey: () => Promise.resolve('test-key'),
      auth: memoryAuth(),
      awaitCatalog: () => gate,
    })
    const pending = adapter.resolveModel('minimax-cn', 'MiniMax-M3.1-Flash')
    let settled = false
    void pending.then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    release?.()
    expect((await pending).id).toBe('MiniMax-M3.1-Flash')
  })
})
