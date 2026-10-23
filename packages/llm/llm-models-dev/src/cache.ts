/**
 * The catalog's durable cache.
 *
 * The models.dev catalog is a large public document — several megabytes — and
 * fetching it takes long enough that a composition which serves it from the
 * network alone answers "no such provider" for the first seconds of every
 * start, and for hours whenever a fetch fails. The cache keeps the last
 * successful catalog on disk: a start serves the providers it already had, and
 * the network only decides how current they are.
 *
 * The cached document holds the facts this service reads, not the payload
 * models.dev served, so the file stays a fraction of the document's size and
 * carries nothing the harness does not use.
 *
 * @module dsh-llm-models-dev/cache
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type {
  ModelsDevEffortValue,
  ModelsDevModelFacts,
  ModelsDevProviderFacts,
  ModelsDevReasoningOption,
  ModelsDevSnapshot,
} from './types.ts'

/** The version of the cached document this build reads and writes. */
export const CACHE_VERSION = 1

/** The cached document's own shape. */
interface CachedCatalog {
  version: number
  fetchedAt: number
  providers: Record<string, ModelsDevProviderFacts>
  skippedProviders: number
  skippedModels: number
}

/** The JSON image of one model's facts. */
function modelImage(model: ModelsDevModelFacts): ModelsDevModelFacts {
  return {
    id: model.id,
    name: model.name,
    ...model.description === undefined ? {} : { description: model.description },
    ...model.kind === undefined ? {} : { kind: model.kind },
    ...model.status === undefined ? {} : { status: model.status },
    reasoning: model.reasoning,
    reasoningOptions: model.reasoningOptions.map(option => ({ ...option })),
    ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
    ...model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens },
    inputModalities: [...model.inputModalities],
  }
}

/** The JSON image of one provider's facts. */
function providerImage(provider: ModelsDevProviderFacts): ModelsDevProviderFacts {
  return {
    id: provider.id,
    name: provider.name,
    npm: provider.npm,
    ...provider.api === undefined ? {} : { api: provider.api },
    env: [...provider.env],
    ...provider.doc === undefined ? {} : { doc: provider.doc },
    models: provider.models.map(modelImage),
  }
}

/** The JSON image of the catalog. */
function catalogImage(snapshot: ModelsDevSnapshot): CachedCatalog {
  const providers: Record<string, ModelsDevProviderFacts> = {}
  for (const [id, provider] of snapshot.providers) providers[id] = providerImage(provider)
  return {
    version: CACHE_VERSION,
    fetchedAt: snapshot.fetchedAt,
    providers,
    skippedProviders: snapshot.skippedProviders,
    skippedModels: snapshot.skippedModels,
  }
}

/** A JSON object, or `undefined` for anything that is not one. */
function object(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
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
      (['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'default'] as readonly string[]).includes(entry))
    return { type: 'effort', values }
  }
  if (record.type === 'budget_tokens') {
    return {
      type: 'budget_tokens',
      ...typeof record.min === 'number' ? { min: record.min } : {},
      ...typeof record.max === 'number' ? { max: record.max } : {},
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

/** One model's facts, or `undefined` when the record does not carry them. */
function modelFacts(value: unknown): ModelsDevModelFacts | undefined {
  const record = object(value)
  if (record === undefined) return undefined
  if (typeof record.id !== 'string' || record.id.length === 0) return undefined
  if (typeof record.name !== 'string' || record.name.length === 0) return undefined
  const status = record.status
  return {
    id: record.id,
    name: record.name,
    ...typeof record.description === 'string' ? { description: record.description } : {},
    ...typeof record.kind === 'string' ? { kind: record.kind } : {},
    ...status === 'alpha' || status === 'beta' || status === 'deprecated'
      ? { status }
      : {},
    reasoning: record.reasoning === true,
    reasoningOptions: reasoningOptions(record.reasoningOptions),
    ...typeof record.contextWindow === 'number' ? { contextWindow: record.contextWindow } : {},
    ...typeof record.maxTokens === 'number' ? { maxTokens: record.maxTokens } : {},
    inputModalities: strings(record.inputModalities),
  }
}

/** One provider's facts, or `undefined` when the record does not carry them. */
function providerFacts(value: unknown): ModelsDevProviderFacts | undefined {
  const record = object(value)
  if (record === undefined) return undefined
  if (typeof record.id !== 'string' || record.id.length === 0) return undefined
  if (typeof record.name !== 'string' || record.name.length === 0) return undefined
  if (typeof record.npm !== 'string' || record.npm.length === 0) return undefined
  const models = Array.isArray(record.models)
    ? record.models.flatMap((entry) => {
      const facts = modelFacts(entry)
      return facts === undefined ? [] : [facts]
    })
    : []
  return {
    id: record.id,
    name: record.name,
    npm: record.npm,
    ...typeof record.api === 'string' ? { api: record.api } : {},
    env: strings(record.env),
    ...typeof record.doc === 'string' ? { doc: record.doc } : {},
    models,
  }
}

/**
 * Read the cached catalog.
 *
 * A file this build did not write, or one that was cut short by a crash, is
 * not a catalog: the read reports absence rather than a partial one, so the
 * service fetches a fresh document instead of serving half of a cache.
 * @param path - the cache file.
 * @returns the cached catalog, or `undefined` when there is none to serve.
 */
export async function readCatalogCache(path: string): Promise<ModelsDevSnapshot | undefined> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch {
    return undefined
  }
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    return undefined
  }
  const record = object(payload)
  if (record === undefined || record.version !== CACHE_VERSION) return undefined
  if (typeof record.fetchedAt !== 'number') return undefined
  const providers = new Map<string, ModelsDevProviderFacts>()
  for (const [id, value] of Object.entries(object(record.providers) ?? {})) {
    const facts = providerFacts(value)
    if (facts !== undefined) providers.set(id, facts)
  }
  return {
    fetchedAt: record.fetchedAt,
    providers,
    skippedProviders: typeof record.skippedProviders === 'number' ? record.skippedProviders : 0,
    skippedModels: typeof record.skippedModels === 'number' ? record.skippedModels : 0,
  }
}

/**
 * Write the catalog to the cache.
 *
 * The document is written beside the cache and moved onto it, so a crash
 * during the write leaves the previous cache in place instead of a half-written
 * one.
 * @param path - the cache file.
 * @param snapshot - the catalog to keep.
 */
export async function writeCatalogCache(path: string, snapshot: ModelsDevSnapshot): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp`
  await writeFile(temporary, JSON.stringify(catalogImage(snapshot)), 'utf8')
  await rename(temporary, path)
}
