/** Profile patch edits and credential updates reach the next real adapter request. */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader, { type ModuleLoaderV2 } from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LlmRuntime, { createMessage, createUserMessage, userAgent } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import AuthorizationService from '@deepseek-ai/dsh-authorization'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import { profileComposition } from '../../../settings/settings/tests/profile-composition.ts'
import * as LlmPiAi from '@deepseek-ai/dsh-llm-pi-ai'
import ModelsDevCatalog from '@deepseek-ai/dsh-llm-models-dev'
import { recordKeyFor } from '../src/auth.ts'
import { assemble } from './assemble.ts'
import { closeMockServers, mockServer, textEvents } from './mock-server.ts'

/** One text block, then a tool call truncated by the output-token ceiling. */
const truncatedToolCallEvents = [
  '{"choices":[{"delta":{"role":"assistant","content":""},"index":0,"finish_reason":null}]}',
  '{"choices":[{"delta":{"content":"partial"},"index":0,"finish_reason":null}]}',
  '{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"echo","arguments":"{\\"text\\":"}}]},"index":0,"finish_reason":null}]}',
  '{"choices":[{"delta":{},"index":0,"finish_reason":"length"}],"usage":{"prompt_tokens":3,"completion_tokens":4}}',
  '[DONE]',
]

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  await closeMockServers()
  vi.unstubAllEnvs()
})

/** Boot the dormant composition: a bare `llm-pi-ai` row with no config at all. */
async function loadComposition(extraRows: readonly string[] = []): Promise<{ ctx: Context; settingsPath: string }> {
  root = await mkdtemp(join(tmpdir(), 'dsh-pi-composition-'))
  // The catalog service keeps its catalog in the harness home, so the
  // composition reads and writes the one this case owns.
  vi.stubEnv('DSH_HOME', root)
  await writeFile(join(root, '.credentials.yaml'), 'version: 1\nrefs:\n  PI_COMPOSITION_KEY: key-from-store\n', { mode: 0o600 })

  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    '- id: llm',
    "  name: 'test-llm-service'",
    '- id: credentials',
    "  name: '@deepseek-ai/dsh-credentials-local'",
    '  config:',
    `    path: ${JSON.stringify(join(root, '.credentials.yaml'))}`,
    '    debounceMs: 10',
    '- id: authorization',
    "  name: '@deepseek-ai/dsh-authorization'",
    '- id: llm-pi-ai',
    "  name: '@deepseek-ai/dsh-llm-pi-ai'",
    ...extraRows,
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['test-llm-service', LlmRuntime],
    ['@deepseek-ai/dsh-credentials-local', LocalCredentialProvider],
    ['@deepseek-ai/dsh-authorization', AuthorizationService],
    ['@deepseek-ai/dsh-llm-pi-ai', LlmPiAi],
    ['@deepseek-ai/dsh-llm-models-dev', ModelsDevCatalog],
  ])
  const internal: ModuleLoaderV2 = {
    version: 'v2',
    loadCache: new Map(),
    import: (specifier: string) => {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return Promise.resolve(modules.get(specifier))
    },
    register(): never { throw new Error('unexpected module hook registration') },
    getOrCreateModuleJob(): never { throw new Error('unexpected module job creation') },
    resolveSync(): never { throw new Error('unexpected synchronous module resolution') },
    load(): never { throw new Error('unexpected module load') },
  }
  ctx.loader.internal = internal
  const patchPath = await profileComposition(ctx, root, configPath)
  return { ctx, settingsPath: patchPath }
}

describe('llm-pi-ai real dormant composition', () => {
  it('dispatches header contributors through the Loader-mounted adapter', async () => {
    const server = await mockServer([{ events: textEvents }])
    const { ctx, settingsPath } = await loadComposition()
    ctx.on('llm-pi-ai/request-headers', (request, headers, next) => {
      headers.set('x-request-session', String(request.sessionId))
      return next()
    })
    await writeFile(settingsPath, [
      '- id: llm-pi-ai', '  config:', '    providers:', '      deepseek:',
      '        apiKeyEnv: PI_COMPOSITION_KEY', `        baseURL: ${server.url}`, '',
    ].join('\n'))
    await vi.waitFor(() => {
      expect(ctx.llm.listProviders().map(provider => provider.id)).toEqual(['deepseek'])
    }, { timeout: 5000 })
    const result = await assemble(ctx, { model: 'deepseek-flash', messages: [], sessionId: SessionId('loader-session') })
    expect(result.finish).toEqual({ kind: 'stop' })
    expect(server.headers[0]?.['x-request-session']).toBe('loader-session')
  })

  it('boots with zero routes and registers one the moment settings supply a profile', async () => {
    vi.stubEnv('PI_COMPOSITION_KEY', '')
    const server = await mockServer([{ events: textEvents }])
    const { ctx, settingsPath } = await loadComposition()

    // The shipped posture: the adapter exists, no route does.
    expect(ctx.llm.listProviders()).toEqual([])
    const directory = ctx.llm.listConfigurableProviders()
    expect(directory.find(entry => entry.provider === 'azure')).toMatchObject({
      nativeAuth: { env: ['AZURE_OPENAI_API_KEY'], oauth: false },
      baseURLEnv: ['AZURE_OPENAI_BASE_URL', 'AZURE_OPENAI_RESOURCE_NAME'],
    })
    expect(directory.find(entry => entry.provider === 'radius')?.defaultBaseURL).toBe('https://radius.pi.dev/v1')
    expect(directory.find(entry => entry.provider === 'opencode')?.defaultBaseURL).toBeUndefined()

    // Exactly what the web Models page leaves on disk.
    await writeFile(settingsPath, [
      '- id: llm-pi-ai',
      '  config:',
      '    providers:',
      '      deepseek:',
      '        apiKeyEnv: PI_COMPOSITION_KEY',
      `        baseURL: ${server.url}`,
      '',
    ].join('\n'))
    await vi.waitFor(() => {
      expect(ctx.llm.listProviders().map(provider => provider.id)).toEqual(['deepseek'])
    }, { timeout: 5000 })

    const result = await assemble(ctx, { provider: 'deepseek', model: 'deepseek-flash', messages: [] })
    expect(result.message.content).toEqual([{ type: 'text', text: 'hello' }])
    expect(server.headers[0]?.authorization).toBe('Bearer key-from-store')
  })

  it('serves a route the models.dev catalog describes', async () => {
    vi.stubEnv('PI_COMPOSITION_KEY', '')
    const catalog = await mockServer([{ body: JSON.stringify({
      'minimax-cn': {
        id: 'minimax-cn',
        name: 'MiniMax (minimax.cn)',
        npm: '@ai-sdk/anthropic',
        api: 'https://api.minimax.cn/anthropic/v1',
        env: ['MINIMAX_API_KEY'],
        models: {
          'MiniMax-M3.1-Flash': {
            id: 'MiniMax-M3.1-Flash',
            name: 'MiniMax-M3.1-Flash',
            reasoning: true,
            reasoning_options: [{ type: 'effort', values: ['low', 'high'] }],
            modalities: { input: ['text'] },
            limit: { context: 1000000, output: 524288 },
          },
        },
      },
    }) }])
    const { ctx, settingsPath } = await loadComposition([
      '- id: llm-models-dev',
      "  name: '@deepseek-ai/dsh-llm-models-dev'",
      '  config:',
      `    url: ${JSON.stringify(`${catalog.url}/api.json`)}`,
    ])

    await writeFile(settingsPath, [
      '- id: llm-pi-ai',
      '  config:',
      '    providers:',
      '      minimax-cn:',
      '        apiKeyEnv: PI_COMPOSITION_KEY',
      '',
    ].join('\n'))
    await vi.waitFor(() => {
      expect(ctx.llm.listProviders().map(provider => provider.id)).toEqual(['minimax-cn'])
    }, { timeout: 5000 })

    const models = await ctx.llm.listModels('minimax-cn')
    expect(models.map(model => model.id)).toEqual(['MiniMax-M3.1-Flash'])
    expect(catalog.paths).toEqual(['/api.json'])

    // The configuration surface's own answer is the catalog's, not the route's
    // configured models: the surface is editing those.
    const discovered = await ctx.llm.discoverModels('llm-pi-ai', { provider: 'minimax-cn' })
    expect(discovered.map(model => model.id)).toEqual(['MiniMax-M3.1-Flash'])
    expect(discovered[0]?.contextWindow).toBe(1000000)
    expect(discovered[0]?.maxTokens).toBe(524288)
  })

  it('offers the providers the models.dev catalog describes to configuration surfaces', async () => {
    const catalog = await mockServer([{ body: JSON.stringify({
      'acme-cloud': {
        id: 'acme-cloud',
        name: 'Acme Cloud',
        npm: '@ai-sdk/openai-compatible',
        api: 'https://api.acme.example/v1',
        env: ['ACME_API_KEY'],
        models: {
          'acme-large': {
            id: 'acme-large',
            name: 'Acme Large',
            modalities: { input: ['text'] },
            limit: { context: 128000, output: 8192 },
          },
        },
      },
      'acme-unservable': {
        id: 'acme-unservable',
        name: 'Acme Unservable',
        npm: '@ai-sdk/google',
        api: 'https://generativelanguage.acme.example',
        env: ['ACME_GOOGLE_API_KEY'],
        models: {
          'acme-gemini': {
            id: 'acme-gemini',
            name: 'Acme Gemini',
            modalities: { input: ['text'] },
            limit: { context: 1000000, output: 8192 },
          },
        },
      },
      'acme-tenant': {
        id: 'acme-tenant',
        name: 'Acme Tenant',
        npm: '@ai-sdk/openai-compatible',
        api: 'https://${ACCOUNT}.acme.example/v1',
        env: ['ACME_API_KEY'],
        models: {
          'acme-tenant-large': {
            id: 'acme-tenant-large',
            name: 'Acme Tenant Large',
            modalities: { input: ['text'] },
            limit: { context: 128000, output: 8192 },
          },
        },
      },
    }) }])
    const { ctx } = await loadComposition([
      '- id: llm-models-dev',
      "  name: '@deepseek-ai/dsh-llm-models-dev'",
      '  config:',
      `    url: ${JSON.stringify(`${catalog.url}/api.json`)}`,
    ])

    await vi.waitFor(() => {
      expect(ctx.llm.listConfigurableProviders().map(entry => entry.provider)).toContain('acme-cloud')
    }, { timeout: 5000 })

    // The provider a configuration surface offers: its route key, the endpoint
    // its requests go to, the protocol its models speak, the environment its
    // credential is read from, and the fact that the adapter knows it.
    expect(ctx.llm.listConfigurableProviders().find(entry => entry.provider === 'acme-cloud')).toMatchObject({
      displayName: 'acme-cloud',
      declared: false,
      defaultBaseURL: 'https://api.acme.example/v1',
      defaultApi: 'openai-completions',
      nativeAuth: { env: ['ACME_API_KEY'], oauth: false },
      settingsPath: ['providers', 'acme-cloud'],
    })
    // A provider whose AI SDK package names a protocol this build cannot
    // construct is not offered: a route may still be declared by hand.
    expect(ctx.llm.listConfigurableProviders().map(entry => entry.provider)).not.toContain('acme-unservable')
    // A provider whose endpoint is a deployment placeholder states none: the
    // route's own `baseURL` is the only answer it has.
    expect(ctx.llm.listConfigurableProviders().find(entry => entry.provider === 'acme-tenant')?.defaultBaseURL)
      .toBeUndefined()
  })

  it('keeps a route the catalog describes first class once a profile names it', async () => {
    vi.stubEnv('PI_COMPOSITION_KEY', '')
    const catalog = await mockServer([{ body: JSON.stringify({
      'acme-cloud': {
        id: 'acme-cloud',
        name: 'Acme Cloud',
        npm: '@ai-sdk/openai-compatible',
        api: 'https://api.acme.example/v1',
        env: ['ACME_API_KEY'],
        models: {
          'acme-large': {
            id: 'acme-large',
            name: 'Acme Large',
            modalities: { input: ['text'] },
            limit: { context: 128000, output: 8192 },
          },
        },
      },
    }) }])
    const { ctx, settingsPath } = await loadComposition([
      '- id: llm-models-dev',
      "  name: '@deepseek-ai/dsh-llm-models-dev'",
      '  config:',
      `    url: ${JSON.stringify(`${catalog.url}/api.json`)}`,
    ])

    await writeFile(settingsPath, [
      '- id: llm-pi-ai',
      '  config:',
      '    providers:',
      '      acme-cloud:',
      '        apiKeyEnv: PI_COMPOSITION_KEY',
      '',
    ].join('\n'))
    await vi.waitFor(() => {
      expect(ctx.llm.listProviders().map(provider => provider.id)).toEqual(['acme-cloud'])
    }, { timeout: 5000 })

    // A profile beside a catalog route changes what the route serves, never
    // whether the adapter knows it: the route keeps the endpoint, the
    // protocol, and the credential environment the catalog states.
    expect(ctx.llm.listConfigurableProviders().find(entry => entry.provider === 'acme-cloud')).toMatchObject({
      declared: false,
      defaultBaseURL: 'https://api.acme.example/v1',
      defaultApi: 'openai-completions',
      nativeAuth: { env: ['ACME_API_KEY'], oauth: false },
    })
  })

  it('offers OpenAI sign-in by API key only, while other subscription logins stay', async () => {    const { ctx } = await loadComposition()
    const methods = (provider: string): string[] | undefined => ctx.authorization.list()
      .find(entry => entry.key === recordKeyFor(provider))?.methods.map(method => method.id)

    // pi-ai's Sign in with ChatGPT needs an installation ID the harness does
    // not supply, so the route offers only its key login.
    expect(methods('openai')).toEqual(['api-key'])
    expect(methods('anthropic')).toEqual(['oauth', 'api-key'])
  })

  it('uses settings-only route headers for model discovery', async () => {
    vi.stubEnv('PI_COMPOSITION_KEY', '')
    const server = await mockServer([{ body: JSON.stringify({ data: [{ id: 'acme-private' }] }) }])
    const { ctx, settingsPath } = await loadComposition()

    await writeFile(settingsPath, [
      '- id: llm-pi-ai',
      '  config:',
      '    providers:',
      '      acme-gateway:',
      '        apiKeyEnv: PI_COMPOSITION_KEY',
      '        api: openai-completions',
      `        baseURL: ${server.url}`,
      '        headers:',
      '          X-Company-Code: private-tenant',
      '          Accept: text/plain',
      '          User-Agent: deployment-owned',
      '        models:',
      '          - id: acme-bootstrap',
      '',
    ].join('\n'))
    await vi.waitFor(() => {
      expect(ctx.llm.listProviders().map(provider => provider.id)).toEqual(['acme-gateway'])
    }, { timeout: 5000 })

    await expect(ctx.llm.discoverModels('llm-pi-ai', {
      provider: 'acme-gateway',
      baseURL: server.url,
      api: 'openai-completions',
    })).resolves.toEqual([{ id: 'acme-private', name: 'acme-private' }])
    expect(server.paths).toEqual(['/models'])
    expect(server.headers[0]?.['x-company-code']).toBe('private-tenant')
    expect(server.headers[0]?.authorization).toBe('Bearer key-from-store')
    expect(server.headers[0]?.accept).toBe('application/json')
    expect(server.headers[0]?.['user-agent']).toBe(userAgent())
  })

  it('continues natively after max-token assembly drops a tool call, with pruned replay metadata', async () => {
    vi.stubEnv('PI_COMPOSITION_KEY', '')
    const server = await mockServer([
      { events: truncatedToolCallEvents },
      { events: textEvents },
    ])
    const { ctx, settingsPath } = await loadComposition()
    await writeFile(settingsPath, [
      '- id: llm-pi-ai',
      '  config:',
      '    providers:',
      '      deepseek:',
      '        apiKeyEnv: PI_COMPOSITION_KEY',
      `        baseURL: ${server.url}`,
      '',
    ].join('\n'))
    await vi.waitFor(() => {
      expect(ctx.llm.listProviders().map(provider => provider.id)).toEqual(['deepseek'])
    }, { timeout: 5000 })

    const truncated = await assemble(ctx, {
      provider: 'deepseek',
      model: 'deepseek-flash',
      messages: [],
    })
    expect(truncated.finish).toEqual({ kind: 'max-tokens' })
    expect(truncated.message.content).toEqual([{ type: 'text', text: 'partial' }])
    expect(truncated.message.source).toEqual({
      kind: 'model',
      provider: 'deepseek',
      model: 'deepseek-flash',
      replayState: {
        response: {
          kind: 'pi-ai',
          version: 2,
          api: 'openai-completions',
          provider: 'deepseek',
          model: 'deepseek-flash',
          stopReason: 'length',
        },
        blocks: [{ type: 'text' }],
      },
    })

    const continued = await assemble(ctx, {
      provider: 'deepseek',
      model: 'deepseek-flash',
      messages: [
        truncated.message,
        createUserMessage({ content: [{ type: 'text', text: 'continue' }], source: { kind: 'user' } }),
      ],
    })
    expect(continued.message.content).toEqual([{ type: 'text', text: 'hello' }])
    expect(server.requests).toHaveLength(2)
    expect(server.requests[1]).toMatchObject({
      messages: [
        { role: 'assistant', content: 'partial' },
        { role: 'user', content: 'continue' },
      ],
    })
    const followup = server.requests[1] as { messages?: unknown[] }
    expect(followup.messages?.[0]).not.toHaveProperty('tool_calls')
  })

  it('continues a legacy session whose stored replay state no longer matches its content', async () => {
    vi.stubEnv('PI_COMPOSITION_KEY', '')
    const server = await mockServer([{ events: textEvents }])
    const { ctx, settingsPath } = await loadComposition()
    await writeFile(settingsPath, [
      '- id: llm-pi-ai',
      '  config:',
      '    providers:',
      '      deepseek:',
      '        apiKeyEnv: PI_COMPOSITION_KEY',
      `        baseURL: ${server.url}`,
      '',
    ].join('\n'))
    await vi.waitFor(() => {
      expect(ctx.llm.listProviders().map(provider => provider.id)).toEqual(['deepseek'])
    }, { timeout: 5000 })

    // A pre-envelope session log entry: max-token assembly dropped the tool
    // call from content while the flat v1 state still describes both blocks.
    const poisoned = createMessage({
      role: 'assistant',
      content: [{ type: 'text', text: 'partial' }],
      source: {
        kind: 'model',
        ...{
          provider: 'deepseek',
          model: 'deepseek-flash',
          replayState: {
            kind: 'pi-ai',
            version: 1,
            api: 'openai-completions',
            provider: 'deepseek',
            model: 'deepseek-flash',
            stopReason: 'length',
            blocks: [{ type: 'text' }, { type: 'tool-call' }],
          },
        },
      },
    })
    const continued = await assemble(ctx, {
      provider: 'deepseek',
      model: 'deepseek-flash',
      messages: [
        poisoned,
        createUserMessage({ content: [{ type: 'text', text: 'continue' }], source: { kind: 'user' } }),
      ],
    })
    expect(continued.finish).toEqual({ kind: 'stop' })
    expect(continued.message.content).toEqual([{ type: 'text', text: 'hello' }])
    expect(server.requests[0]).toMatchObject({
      messages: [
        { role: 'assistant', content: 'partial' },
        { role: 'user', content: 'continue' },
      ],
    })
  })
})
