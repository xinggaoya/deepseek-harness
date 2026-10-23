/**
 * A model catalog source outside the installed pi-ai registry.
 *
 * A source states what a provider's models can do: how large their context
 * is, how many tokens they may answer with, which input types they accept,
 * and which thinking levels they offer. The installed pi-ai registry stays
 * the authority on how to talk to a model it describes — the wire protocol,
 * the compatibility switches, the input limits — because those are dialects
 * rather than capabilities, and a list of capabilities does not carry them.
 *
 * So a source decides *which* models a route serves and *what each model can
 * do*, while the installed registry decides *how to reach* the models both
 * describe. A model only the source describes inherits the protocol and the
 * endpoint the source publishes.
 *
 * @module dsh-llm-pi-ai/remote-catalog
 */

import type { Api, Model, ThinkingLevelMap } from '@earendil-works/pi-ai'
import { NO_COST } from './catalog-vocabulary.ts'
import type { ModelCompat, PiAiModality } from './catalog-vocabulary.ts'

/** One model's facts, as a catalog source states them. */
export interface RemoteModelFacts {
  /** Model id the provider accepts on a request. */
  readonly id: string
  /** Human-readable model name for selectors. */
  readonly name: string
  /** Maximum combined request and response context, in tokens. */
  readonly contextWindow?: number
  /** Maximum output tokens. */
  readonly maxTokens?: number
  /** Request modalities the model accepts. */
  readonly input: readonly PiAiModality[]
  /** Whether the model reasons at all. */
  readonly reasoning: boolean
  /**
   * The thinking levels the model offers.
   *
   * Absent leaves the installed catalog's own levels in place, which is what a
   * source that records no reasoning control means: it describes capabilities,
   * not the dialect a provider speaks its levels in.
   */
  readonly thinkingLevelMap?: ThinkingLevelMap
  /**
   * Whether the model's thinking travels as an effort level rather than a
   * token budget.
   */
  readonly forceAdaptiveThinking?: boolean
}

/** One provider's catalog, as a source outside the installed registry states it. */
export interface RemoteCatalog {
  /** Provider id the source records the provider under. */
  readonly id: string
  /** The wire protocol the provider speaks, when the source names one. */
  readonly api?: Api
  /** The endpoint the provider serves, when the source names one. */
  readonly baseUrl?: string
  /**
   * Environment variables the provider's credential is read from.
   *
   * A route whose profile names no credential reference authenticates from
   * them, the way an installed catalog provider authenticates from its own
   * environment. Absent when the source names none.
   */
  readonly env?: readonly string[]
  /** The models the provider offers. */
  readonly models: readonly RemoteModelFacts[]
}

/** The route-level facts a merge reads. */
export interface RemoteCatalogMergeOptions {
  /** The wire protocol the route's profile declares, when it declares one. */
  api?: Api
  /** The endpoint the route's profile declares, when it declares one. */
  baseUrl?: string
  /** The endpoint the installed catalog's provider serves, when it ships one. */
  providerBaseUrl?: string
  /** Context capacity for a model neither the source nor the installed catalog sizes. */
  defaultContextWindow: number
  /** Output capability for a model neither the source nor the installed catalog sizes. */
  defaultMaxTokens: number
}

/**
 * The catalog one route serves when a source outside the installed registry
 * describes it.
 *
 * The source's models are the ones the route serves; the installed registry
 * still supplies the protocol, the endpoint, and the compatibility switches
 * of a model it describes. A model only the source describes takes the
 * protocol and endpoint the source publishes, and the route's own fallbacks
 * for the capacities neither states.
 * @param provider - provider route key, stamped onto every model.
 * @param source - the provider's catalog as the source states it.
 * @param installed - the installed registry's models for this route.
 * @param options - the route's declared protocol, endpoint, and capacity fallbacks.
 * @returns the served catalog, by model id.
 */
export function mergeRemoteCatalog(
  provider: string,
  source: RemoteCatalog,
  installed: ReadonlyMap<string, Model<Api>>,
  options: RemoteCatalogMergeOptions,
): Map<string, Model<Api>> {
  const merged = new Map<string, Model<Api>>()
  for (const facts of source.models) {
    const base = installed.get(facts.id)
    const api = base?.api ?? source.api ?? options.api
    // Every model on a route reaches the same endpoint: the route's own
    // choice first, then the installed catalog's per-model and per-provider
    // endpoints, and the source's endpoint only for a route the installed
    // catalog does not ship.
    const baseUrl = options.baseUrl ?? base?.baseUrl ?? options.providerBaseUrl ?? source.baseUrl
    // A model with no reachable endpoint or protocol cannot serve a request;
    // the route's own diagnostics report the route it left unserved.
    if (api === undefined || baseUrl === undefined) continue
    const compat = remoteCompat(facts, base, api)
    merged.set(facts.id, {
      // The installed entry lays the floor: enumerating instead would drop
      // every field this package does not model.
      ...base,
      id: facts.id,
      name: facts.name,
      api,
      provider,
      baseUrl,
      input: [...facts.input],
      cost: base?.cost ?? NO_COST,
      contextWindow: facts.contextWindow ?? base?.contextWindow ?? options.defaultContextWindow,
      maxTokens: facts.maxTokens ?? base?.maxTokens ?? options.defaultMaxTokens,
      reasoning: facts.reasoning,
      ...facts.thinkingLevelMap === undefined ? {} : { thinkingLevelMap: facts.thinkingLevelMap },
      ...compat === undefined ? {} : { compat },
    })
  }
  return merged
}

/**
 * The compat block one merged model carries.
 *
 * The installed entry's switches are the floor. The one switch a source can
 * add is the effort dialect: a model whose thinking travels as an effort level
 * cannot have that level sent on a protocol that only expresses thinking as a
 * token budget, so the Anthropic Messages protocol's adaptive mode is what
 * carries it.
 * @param facts - the model's facts as the source states them.
 * @param base - the installed entry of the same id, when one exists.
 * @param api - the model's resolved wire protocol.
 * @returns the compat block, or nothing when no switch applies.
 */
function remoteCompat(
  facts: RemoteModelFacts,
  base: Model<Api> | undefined,
  api: Api,
): ModelCompat | undefined {
  const inherited = base?.compat
  if (facts.forceAdaptiveThinking !== true || api !== 'anthropic-messages') return inherited
  return { ...inherited, forceAdaptiveThinking: true }
}
