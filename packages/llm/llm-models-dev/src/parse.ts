/**
 * Reading the models.dev catalog payload.
 *
 * The payload is a single JSON document holding one record per provider and
 * one per model. Every record is read through a narrow reader that accepts the
 * fields the harness uses and ignores the rest, so a field models.dev adds
 * later never fails a fetch. A record whose identifying fields are missing or
 * malformed is counted as skipped rather than failing the whole catalog: one
 * broken entry must not cost a deployment every other provider's models.
 *
 * @module dsh-llm-models-dev/parse
 */

import type {
  ModelsDevEffortValue,
  ModelsDevModelFacts,
  ModelsDevModelStatus,
  ModelsDevProviderFacts,
  ModelsDevReasoningOption,
  ModelsDevSnapshot,
} from './types.ts'

/** The effort level names models.dev records. */
const EFFORT_VALUES: readonly ModelsDevEffortValue[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'default',
]

/** The lifecycle states models.dev records. */
const MODEL_STATUSES: readonly ModelsDevModelStatus[] = ['alpha', 'beta', 'deprecated']

/** A JSON object, or `undefined` for anything that is not one. */
function object(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

/** A non-empty string field, or `undefined` when it is absent or blank. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** A positive integer field, or `undefined` when it is absent or unusable. */
function capacity(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

/** The strings of an array field, dropping every entry that is not one. */
function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
}

/** One reasoning control, or `undefined` when the record does not describe one. */
function reasoningOption(value: unknown): ModelsDevReasoningOption | undefined {
  const record = object(value)
  if (record === undefined) return undefined
  if (record.type === 'toggle') return { type: 'toggle' }
  if (record.type === 'effort') {
    const values = strings(record.values).filter((entry): entry is ModelsDevEffortValue =>
      (EFFORT_VALUES as readonly string[]).includes(entry))
    return { type: 'effort', values }
  }
  if (record.type === 'budget_tokens') {
    const min = typeof record.min === 'number' ? record.min : undefined
    const max = typeof record.max === 'number' ? record.max : undefined
    return {
      type: 'budget_tokens',
      ...min === undefined ? {} : { min },
      ...max === undefined ? {} : { max },
    }
  }
  return undefined
}

/** The reasoning controls a model record lists. */
function reasoningOptions(value: unknown): ModelsDevReasoningOption[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const option = reasoningOption(entry)
    return option === undefined ? [] : [option]
  })
}

/** The input types a model record lists. */
function inputModalities(record: Record<string, unknown>): string[] {
  const modalities = object(record.modalities)
  if (modalities === undefined) return []
  return strings(modalities.input)
}

/** The token limits a model record states. */
function limits(record: Record<string, unknown>): { contextWindow?: number; maxTokens?: number } {
  const limit = object(record.limit)
  if (limit === undefined) return {}
  const contextWindow = capacity(limit.context)
  const maxTokens = capacity(limit.output)
  return {
    ...contextWindow === undefined ? {} : { contextWindow },
    ...maxTokens === undefined ? {} : { maxTokens },
  }
}

/** The lifecycle state a model record states, when it states a known one. */
function status(value: unknown): ModelsDevModelStatus | undefined {
  const state = text(value)
  if (state === undefined) return undefined
  return (MODEL_STATUSES as readonly string[]).includes(state)
    ? state as ModelsDevModelStatus
    : undefined
}

/**
 * One model's facts, or `undefined` when the record lacks the identity a
 * request names it by.
 * @param key - the record's key in the payload's model map.
 * @param value - the record itself.
 * @returns the model's facts, or `undefined` for an unusable record.
 */
function modelFacts(key: string, value: unknown): ModelsDevModelFacts | undefined {
  const record = object(value)
  if (record === undefined) return undefined
  const id = text(record.id) ?? key
  const name = text(record.name) ?? id
  const description = text(record.description)
  const kind = text(record.type)
  const modelStatus = status(record.status)
  return {
    id,
    name,
    ...description === undefined ? {} : { description },
    ...kind === undefined ? {} : { kind },
    ...modelStatus === undefined ? {} : { status: modelStatus },
    reasoning: record.reasoning === true,
    reasoningOptions: reasoningOptions(record.reasoning_options),
    ...limits(record),
    inputModalities: inputModalities(record),
  }
}

/**
 * One provider's facts, or `undefined` when the record lacks the identity and
 * the implementation a request is routed by.
 * @param key - the record's key in the payload's provider map.
 * @param value - the record itself.
 * @returns the provider's facts, or `undefined` for an unusable record.
 */
function providerFacts(key: string, value: unknown): ModelsDevProviderFacts | undefined {
  const record = object(value)
  if (record === undefined) return undefined
  const id = text(record.id) ?? key
  const name = text(record.name) ?? id
  const npm = text(record.npm)
  // The AI SDK package is what names the provider's wire protocol; a record
  // without it describes a provider no route can be routed to.
  if (npm === undefined) return undefined
  const api = text(record.api)
  const doc = text(record.doc)
  const models = object(record.models)
  const entries = models === undefined ? [] : Object.entries(models)
  const modelList = entries.flatMap(([modelKey, modelValue]) => {
    const facts = modelFacts(modelKey, modelValue)
    return facts === undefined ? [] : [facts]
  })
  return {
    id,
    name,
    npm,
    ...api === undefined ? {} : { api },
    env: strings(record.env),
    ...doc === undefined ? {} : { doc },
    models: modelList,
  }
}

/**
 * Read one catalog payload.
 *
 * The provider map is the payload's own shape, so a payload that is not an
 * object of provider records yields an empty catalog rather than an error: a
 * deployment that cannot read the catalog keeps serving its installed one.
 * @param payload - the decoded JSON document.
 * @param fetchedAt - when the payload was fetched, in epoch milliseconds.
 * @returns the catalog facts, with the counts of records that were skipped.
 */
export function parseModelsDevCatalog(payload: unknown, fetchedAt: number): ModelsDevSnapshot {
  const root = object(payload)
  const providers = new Map<string, ModelsDevProviderFacts>()
  let skippedProviders = 0
  let skippedModels = 0
  if (root !== undefined) {
    for (const [key, value] of Object.entries(root)) {
      const facts = providerFacts(key, value)
      if (facts === undefined) {
        skippedProviders += 1
        continue
      }
      const models = object((value as Record<string, unknown>).models)
      if (models !== undefined) {
        skippedModels += Object.keys(models).length - facts.models.length
      }
      providers.set(facts.id, facts)
    }
  }
  return { fetchedAt, providers, skippedProviders, skippedModels }
}
