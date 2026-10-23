/**
 * The vocabulary a route's catalog is materialized in: the request modalities
 * a model may accept, the thinking levels a route may offer, and the pricing
 * of a model no catalog describes.
 *
 * These live apart from the materialization itself so that a catalog source
 * outside the installed pi-ai registry can state a model's capabilities in
 * the same terms the materialization reads, without either module depending on
 * the other.
 *
 * @module dsh-llm-pi-ai/catalog-vocabulary
 */

import type {
  AnthropicMessagesCompat,
  Api,
  BedrockCompat,
  MistralConversationsCompat,
  Model,
  ModelCost,
  ModelThinkingLevel,
  OpenAICompletionsCompat,
  OpenAIResponsesCompat,
} from '@earendil-works/pi-ai'

/** One request modality a pi-ai model may accept. */
export type PiAiModality = Model<Api>['input'][number]

/**
 * Every pi-ai request modality. The `Record` key type is a drift gate: a
 * pi-ai upgrade that adds or removes a modality fails compilation here naming
 * the drifted key, instead of silently narrowing what a profile may declare.
 */
const MODALITY_GATE: Record<PiAiModality, true> = {
  text: true,
  image: true,
}

/** Every request modality a profile may declare. */
export const MODALITIES = Object.keys(MODALITY_GATE) as readonly PiAiModality[]

/**
 * Every pi-ai thinking level, in pi-ai's canonical escalation order. The
 * `Record` key type is a drift gate: a pi-ai upgrade that adds or removes a
 * level fails compilation here naming the drifted key, instead of silently
 * narrowing what a profile may declare.
 */
const THINKING_LEVEL_GATE: Record<ModelThinkingLevel, true> = {
  off: true,
  minimal: true,
  low: true,
  medium: true,
  high: true,
  xhigh: true,
  max: true,
}

/** Every pi-ai thinking level a profile may declare, in escalation order. */
export const THINKING_LEVELS = Object.keys(THINKING_LEVEL_GATE) as readonly ModelThinkingLevel[]

/**
 * Pricing for a model no catalog describes. The harness never reads pi-ai's
 * cost metadata — `replay.ts` zeroes it and no consumer reports spend — so
 * this is the absence of a fact, not a configurable rate.
 */
export const NO_COST: ModelCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

/** The compat block a materialized model carries, whichever protocol it speaks. */
export type ModelCompat =
  | OpenAICompletionsCompat
  | OpenAIResponsesCompat
  | AnthropicMessagesCompat
  | BedrockCompat
  | MistralConversationsCompat
