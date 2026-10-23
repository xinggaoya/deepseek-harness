/**
 * Fact types for the models.dev catalog.
 *
 * The wire payload carries one provider record per AI SDK provider package and
 * one model record per model that package offers. These types are the subset
 * the harness reads, detached from the payload's spelling so a consumer never
 * parses the wire itself.
 *
 * @module dsh-llm-models-dev/types
 */

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * The models.dev catalog was replaced by a newly available one.
     *
     * Consumers that project the catalog into a configuration surface re-read
     * the service's current snapshot when this fires; the event carries no
     * payload because the service owns the current one. Observer failures are
     * contained and cannot veto the replacement.
     * @mode emit
     */
    'llmModelsDev/refresh'(): void
  }
}

/** Lifecycle state models.dev records for a model. */
export type ModelsDevModelStatus = 'alpha' | 'beta' | 'deprecated'

/**
 * One effort level name models.dev records for a reasoning model.
 *
 * `none` is the level that turns reasoning off, and `default` names the
 * provider's own default effort rather than a level a caller selects.
 */
export type ModelsDevEffortValue =
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'
  | 'default'

/**
 * One reasoning control a model offers.
 *
 * A model may carry several: a `toggle` states that reasoning can be turned
 * off, an `effort` lists the selectable levels, and `budget_tokens` bounds a
 * thinking-token budget. The controls are independent facts about the same
 * model, not alternatives.
 */
export type ModelsDevReasoningOption =
  | { readonly type: 'toggle' }
  | { readonly type: 'effort'; readonly values: readonly ModelsDevEffortValue[] }
  | { readonly type: 'budget_tokens'; readonly min?: number; readonly max?: number }

/** One model's facts, as models.dev records them. */
export interface ModelsDevModelFacts {
  /** Model id the provider accepts on a request. */
  readonly id: string
  /** Human-readable model name. */
  readonly name: string
  /** One-line description of what the model is for. */
  readonly description?: string
  /**
   * What the model does; absent for a model models.dev records without a
   * kind, which is a chat model.
   */
  readonly kind?: string
  /** Lifecycle state; absent for a model models.dev records as current. */
  readonly status?: ModelsDevModelStatus
  /** Whether the model reasons at all. */
  readonly reasoning: boolean
  /** The reasoning controls the model offers. */
  readonly reasoningOptions: readonly ModelsDevReasoningOption[]
  /** Maximum combined request and response context, in tokens. */
  readonly contextWindow?: number
  /** Maximum output tokens. */
  readonly maxTokens?: number
  /** Input types the model accepts, in models.dev's own vocabulary. */
  readonly inputModalities: readonly string[]
}

/** One provider's facts, as models.dev records them. */
export interface ModelsDevProviderFacts {
  /** Provider id models.dev records it under. */
  readonly id: string
  /** Human-readable provider name. */
  readonly name: string
  /**
   * The AI SDK provider package that implements this provider.
   *
   * The package names the wire protocol the provider speaks, which is the one
   * fact models.dev carries that a catalog of model capabilities alone cannot.
   */
  readonly npm: string
  /** Endpoint the AI SDK provider package talks to. */
  readonly api?: string
  /** Environment variables the provider's credential is read from. */
  readonly env: readonly string[]
  /** Provider documentation. */
  readonly doc?: string
  /** The models the provider offers. */
  readonly models: readonly ModelsDevModelFacts[]
}

/** One fetched catalog, replaced whole by the next successful fetch. */
export interface ModelsDevSnapshot {
  /** When this snapshot was fetched, in epoch milliseconds. */
  readonly fetchedAt: number
  /** Providers by their models.dev id. */
  readonly providers: ReadonlyMap<string, ModelsDevProviderFacts>
  /** Provider records the payload did not carry in a usable form. */
  readonly skippedProviders: number
  /** Model records the payload did not carry in a usable form. */
  readonly skippedModels: number
}
