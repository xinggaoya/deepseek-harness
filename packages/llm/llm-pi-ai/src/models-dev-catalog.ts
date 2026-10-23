/**
 * The models.dev catalog as a route's model catalog.
 *
 * models.dev publishes one document covering every AI SDK provider package:
 * which providers exist, which models each offers, and what each model can do
 * — its context window, its output cap, the input types it accepts, and the
 * thinking levels it offers. This module reads that document's provider
 * record and states what it means for a pi-ai route.
 *
 * The AI SDK package a provider names is the one fact a capability list
 * cannot carry: the package is the implementation of that provider, and it
 * speaks one wire protocol. A provider whose package this build cannot serve
 * states no protocol, and its route must name one in configuration.
 *
 * @module dsh-llm-pi-ai/models-dev-catalog
 */

import type { Api, ModelThinkingLevel, ThinkingLevelMap } from '@earendil-works/pi-ai'
import type {
  ModelsDevEffortValue,
  ModelsDevModelFacts,
  ModelsDevProviderFacts,
} from '@deepseek-ai/dsh-llm-models-dev'
import { THINKING_LEVELS } from './catalog-vocabulary.ts'
import type { PiAiModality } from './catalog-vocabulary.ts'
import type { RemoteCatalog, RemoteModelFacts } from './remote-catalog.ts'

/**
 * The pi-ai wire protocol each AI SDK provider package speaks.
 *
 * Only the packages whose protocol this build can serve are named: a package
 * that is absent speaks a protocol the adapter cannot construct, so a route
 * drawing its catalog from such a provider states its protocol in
 * configuration instead.
 */
const NPM_PROTOCOLS: Readonly<Record<string, Api>> = {
  '@ai-sdk/anthropic': 'anthropic-messages',
  '@ai-sdk/openai-compatible': 'openai-completions',
  '@ai-sdk/openai': 'openai-responses',
}

/** The pi-ai thinking level a models.dev effort value names. */
const EFFORT_LEVELS: Readonly<Partial<Record<ModelsDevEffortValue, ModelThinkingLevel>>> = {
  none: 'off',
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  max: 'max',
}

/**
 * The request modalities one models.dev model accepts.
 *
 * models.dev names input types in its own vocabulary, which is finer than
 * pi-ai's: an image type may be named `image/png`. Every image type is one
 * modality to pi-ai, and a type pi-ai has no modality for — a video, an
 * audio track — is not offered at all, because the request path could not
 * carry it.
 * @param facts - the model's facts as models.dev records them.
 * @returns the modalities the model accepts; text alone when it records none.
 */
function modalitiesOf(facts: ModelsDevModelFacts): PiAiModality[] {
  const modalities = new Set<PiAiModality>()
  for (const name of facts.inputModalities) {
    if (name === 'text') modalities.add('text')
    else if (name === 'image' || name.startsWith('image/')) modalities.add('image')
  }
  // Text is the floor every chat model carries, so an unrecorded modality
  // list states no answer rather than an empty one.
  return modalities.size === 0 ? ['text'] : [...modalities]
}

/**
 * The thinking levels one models.dev model offers, as pi-ai's map states them.
 *
 * A level the source does not offer is pinned to `null`, which is how pi-ai
 * reads "not offered". The `off` level is the exception: an absent key is how
 * pi-ai reads "offered", so a model whose reasoning can be turned off leaves
 * the key out entirely.
 *
 * A model that records no effort levels states no level at all, and the
 * installed catalog's own levels stand: what a provider calls its effort
 * levels is a dialect, and a capability list does not describe dialects.
 * @param facts - the model's facts as models.dev records them.
 * @returns the model's thinking levels, or nothing when it records none.
 */
function thinkingMapOf(facts: ModelsDevModelFacts): ThinkingLevelMap | undefined {
  const levels = new Set<ModelThinkingLevel>()
  let toggle = false
  let effort = false
  for (const option of facts.reasoningOptions) {
    if (option.type === 'toggle') {
      toggle = true
    } else if (option.type === 'effort') {
      effort = true
      for (const value of option.values) {
        const level = EFFORT_LEVELS[value]
        if (level !== undefined) levels.add(level)
      }
    }
  }
  if (!effort) return undefined
  const map: ThinkingLevelMap = {}
  for (const level of THINKING_LEVELS) {
    if (level === 'off') continue
    map[level] = null
  }
  for (const level of levels) {
    if (level === 'off') continue
    map[level] = level
  }
  if (!toggle && !levels.has('off')) map.off = null
  return map
}

/**
 * The endpoint one models.dev provider serves, as pi-ai's base URL.
 *
 * An Anthropic endpoint is published with its `/v1` segment, and pi-ai's
 * Anthropic implementation appends `/v1/messages` to the base URL, so the
 * segment is removed. An endpoint carrying an unresolved placeholder — a
 * provider whose host is a deployment variable — states no endpoint, which
 * leaves the route's own `baseURL` as the only answer.
 * @param facts - the provider's facts as models.dev records them.
 * @param api - the protocol the provider speaks.
 * @returns the endpoint to route requests to, or nothing when the source states none.
 */
function baseUrlOf(facts: ModelsDevProviderFacts, api: Api | undefined): string | undefined {
  const endpoint = facts.api
  if (endpoint === undefined || endpoint.length === 0) return undefined
  if (endpoint.includes('${')) return undefined
  if (api === 'anthropic-messages' && endpoint.endsWith('/v1')) return endpoint.slice(0, -3)
  return endpoint
}

/**
 * One models.dev model's facts, as a route's catalog states them.
 * @param facts - the model's facts as models.dev records them.
 * @returns the model's facts in the harness's catalog vocabulary.
 */
function modelFactsOf(facts: ModelsDevModelFacts): RemoteModelFacts {
  const thinkingLevelMap = thinkingMapOf(facts)
  return {
    id: facts.id,
    name: facts.name,
    ...facts.contextWindow === undefined ? {} : { contextWindow: facts.contextWindow },
    ...facts.maxTokens === undefined ? {} : { maxTokens: facts.maxTokens },
    input: modalitiesOf(facts),
    reasoning: facts.reasoning,
    ...thinkingLevelMap === undefined ? {} : { thinkingLevelMap },
    ...thinkingLevelMap === undefined ? {} : { forceAdaptiveThinking: true },
  }
}

/**
 * One models.dev provider, as a route this build can serve.
 *
 * The entry names the route a configuration surface creates, the endpoint its
 * requests go to, the protocol its models speak, and the environment its
 * credential is read from. The protocol is not asked of the user: the
 * provider's AI SDK package names it, and the catalog source states it here.
 */
export interface ModelsDevProviderEntry {
  /** The provider's models.dev id, which is also the route key. */
  readonly provider: string
  /** The endpoint its requests go to; absent when the source states none. */
  readonly defaultBaseURL?: string
  /** The protocol its models speak; absent when the source names no package this build serves. */
  readonly api?: Api
  /** Environment variables the provider's credential is read from, in the source's order. */
  readonly env: readonly string[]
}

/**
 * The models.dev providers this build can serve as routes.
 *
 * A provider whose AI SDK package names a protocol this build cannot construct
 * is left out: a route may still be declared by hand with a protocol of its
 * own, but offering it as a catalog route would promise an endpoint the
 * adapter cannot speak to. A provider the source records no chat model for is
 * left out for the same reason — there is nothing for the route to serve.
 * @param providers - the provider records as models.dev records them.
 * @returns the provider entries, in the order the catalog lists them.
 */
export function modelsDevProviders(providers: Iterable<ModelsDevProviderFacts>): ModelsDevProviderEntry[] {
  const entries: ModelsDevProviderEntry[] = []
  for (const facts of providers) {
    const api = NPM_PROTOCOLS[facts.npm]
    if (api === undefined) continue
    if (!facts.models.some(model => model.kind === undefined || model.kind === 'chat')) continue
    const baseUrl = baseUrlOf(facts, api)
    entries.push({
      provider: facts.id,
      ...baseUrl === undefined ? {} : { defaultBaseURL: baseUrl },
      api,
      env: facts.env,
    })
  }
  return entries
}

/**
 * One models.dev provider's catalog, as a route's catalog states it.
 *
 * A model models.dev records as something other than a chat model is left
 * out: this adapter dispatches chat requests, and an image or embedding model
 * is not one.
 * @param facts - the provider's facts as models.dev records them.
 * @returns the provider's catalog in the harness's vocabulary.
 */
export function modelsDevCatalog(facts: ModelsDevProviderFacts): RemoteCatalog {
  const api = NPM_PROTOCOLS[facts.npm]
  const baseUrl = baseUrlOf(facts, api)
  return {
    id: facts.id,
    ...api === undefined ? {} : { api },
    ...baseUrl === undefined ? {} : { baseUrl },
    // The provider's own credential environment: a route the profile names no
    // reference for authenticates from it, the way an installed catalog
    // provider authenticates from its own.
    env: facts.env,
    models: facts.models
      .filter(model => model.kind === undefined || model.kind === 'chat')
      .map(modelFactsOf),
  }
}
