/**
 * Generic pi-ai-backed LLM adapter plugin. One plugin instance owns a dict of
 * provider routes; a route naming an installed pi-ai provider inherits that
 * provider's endpoint, protocol, and model catalog as defaults, and a route
 * pi-ai does not ship is declared outright. Profile facts resolve per request
 * over the optional `llm-pi-ai` user-settings section and the optional
 * credential seam, so a changed key, endpoint, model, or knob reaches the next
 * request without a restart; a changed *route set* (or a route's
 * registration-captured retry policy) re-registers the same adapter instance
 * in place.
 *
 * ```yaml
 * - id: llm
 *   name: '@deepseek-ai/dsh-llm-pi-ai'
 *   config:
 *     providers:
 *       # Catalog route: everything but the credential comes from pi-ai.
 *       openai:
 *         apiKeyEnv: OPENAI_API_KEY
 *         retryPolicy:
 *           mode: normal
 *           maxRetries: 2
 *       # Catalog route with the catalog narrowed and one capacity corrected.
 *       anthropic:
 *         apiKeyEnv: ANTHROPIC_API_KEY
 *         models:
 *           - id: claude-sonnet-4-5
 *             contextWindow: 200000
 *       # Hand-declared route: pi-ai ships nothing under this key.
 *       acme-gateway:
 *         displayName: Acme Gateway
 *         apiKeyEnv: ACME_GATEWAY_API_KEY
 *         api: openai-completions
 *         baseURL: https://gateway.acme.example/v1
 *         # Reasoning dialect for a URL pi-ai cannot recognize.
 *         compat:
 *           thinkingFormat: deepseek
 *         models:
 *           - id: acme-large
 *             name: Acme Large
 *             contextWindow: 65536
 *             maxTokens: 4096
 *           - id: acme-think
 *             name: Acme Think
 *             contextWindow: 262144
 *             maxTokens: 32768
 *             # key = selectable level, value = wire spelling; only off may
 *             # leave the value empty (supported, send nothing).
 *             reasoningEfforts:
 *               off:
 *               high: high
 *               max: ultra
 * ```
 *
 * @module @deepseek-ai/dsh-llm-pi-ai
 */
import type {} from '@deepseek-ai/dsh-settings'

import type {} from '@deepseek-ai/cordis-plugin-loader'

import type { Context } from '@deepseek-ai/cordis'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { assertUsableApiKey, LlmError, resolveImageAttachmentAccess } from '@deepseek-ai/dsh-llm'
import type { AdapterRegistrationHandle, DirectoryRegistrationHandle, LlmConfigurableProvider } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-llm-models-dev'
import type { ModelsDevSnapshot } from '@deepseek-ai/dsh-llm-models-dev'
import type {} from '@deepseek-ai/dsh-fs'
import { deepEqualJson } from '@deepseek-ai/dsh-util-values'
import { PiAiAdapter } from './adapter.ts'
import { authContextFrom, credentialStoreFrom } from './auth.ts'
import { catalogProvider, catalogProviderIds } from './catalog.ts'
import { assertServiceable, Config, resolveProfiles } from './config.ts'
import type { RemoteCatalogLookup, ResolvedPiAiProviderProfile } from './config.ts'
import { discoverModels } from './discovery.ts'
import type { StoredModelDiscoveryProfile } from './discovery.ts'
import { registerPiAiFlows } from './login.ts'
import { modelsDevCatalog, modelsDevProviders } from './models-dev-catalog.ts'
import type { ModelsDevProviderEntry } from './models-dev-catalog.ts'
import { providerDefaultsOf } from './provider-data.ts'
import type { PiAiRequestHeaderContext } from './types.ts'

export { PiAiAdapter } from './adapter.ts'
export type { PiAiAdapterOptions } from './adapter.ts'
export type { PiAiRequestHeaderContext } from './types.ts'
export { Config } from './config.ts'
export type {
  Options,
  PiAiCompatProfile,
  PiAiModality,
  PiAiModelOverride,
  PiAiModelProfile,
  PiAiProviderProfile,
  PiAiReasoningEfforts,
  PiAiThinkingFormat,
  ResolvedPiAiProviderProfile,
} from './config.ts'
export { recordKeyFor } from './auth.ts'
export { supportedProtocols } from './provider.ts'

export const name = 'llm-pi-ai'
export const inject = ['llm']

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Prepare headers for one pi-ai inference call, excluding model discovery.
     * Listeners run synchronously and must call next(); they may edit only the
     * request-owned headers and must not retain them. Throws fail the call with
     * REQUEST_HEADERS before inference I/O. Harness attribution wins afterward.
     * Non-TypeError messages are user-visible and must exclude secrets. TypeError
     * details and non-Error values are replaced with safe guidance.
     * @mode waterfall
     * @param request - immutable routing metadata from the exact prepared call.
     * @param headers - fresh profile headers, shared only within this dispatch.
     * @param next - continue header preparation through the remaining listeners.
     * @returns headers passed to pi-ai after Harness attribution is applied.
     */
    'llm-pi-ai/request-headers'(request: PiAiRequestHeaderContext, headers: Headers, next: () => Headers): Headers
  }
}

const NS = 'llm-pi-ai'

/**
 * The registry captures these per route; a change here must re-register.
 * Sorted by provider so a settings document that merely reorders its keys is
 * not mistaken for a route change.
 */
function registrationFacts(profiles: ReadonlyMap<string, ResolvedPiAiProviderProfile>): unknown {
  return [...profiles.entries()]
    // `displayName` rides along because the registry hands it to every selector
    // through `providerInfo()`: a rename that did not re-register would leave
    // the old label showing until some unrelated fact happened to change.
    .map(([provider, profile]) => ({
      provider,
      displayName: profile.displayName,
      retryPolicy: profile.retryPolicy,
    }))
    .sort((left, right) => left.provider.localeCompare(right.provider))
}

/**
 * The configurable-provider directory: every installed catalog route, every
 * route a catalog source describes, plus every route the current profiles
 * declare. A hand-declared route has no catalog entry, so without this union
 * it would have no settings address and configuration surfaces could neither
 * show nor edit it. A catalog route also carries its catalog endpoint, its
 * wire protocol, and its native authentication, which a settings editor shows
 * while the profile leaves the endpoint, the protocol, or the credential
 * reference unset.
 *
 * A route a catalog source describes is one the adapter knows: the source is
 * the catalog that route draws its models from, so a profile beside it changes
 * what the route serves, never whether the adapter knows it.
 * @param profiles - the currently resolved provider profiles.
 * @param settingsNs - the namespace whose section configures these routes.
 * @param catalogProviders - the providers a catalog source describes, with the
 *   endpoint, protocol, and credential environment each one carries.
 * @returns the directory entries in catalog order, declared routes last.
 */
function directoryEntries(
  profiles: ReadonlyMap<string, ResolvedPiAiProviderProfile>,
  settingsNs: string,
  catalogProviders: readonly ModelsDevProviderEntry[] = [],
): LlmConfigurableProvider[] {
  const entries = new Map<string, LlmConfigurableProvider>()
  const address = (provider: string): Pick<LlmConfigurableProvider, 'settingsNs' | 'settingsPath'> => ({
    settingsNs,
    settingsPath: ['providers', provider],
  })
  for (const provider of catalogProviderIds()) {
    const installed = catalogProvider(provider)
    /* v8 ignore next -- the ids come from the catalog itself, so each names a provider it returns */
    if (installed === undefined) continue
    entries.set(provider, {
      provider,
      displayName: provider,
      ...address(provider),
      // Membership of the installed catalog, not of the settings document:
      // narrowing a shipped provider's models stores a profile too, and that
      // route is still one pi-ai knows.
      declared: false,
      ...providerDefaultsOf(installed),
    })
  }
  for (const entry of catalogProviders) {
    if (entries.has(entry.provider)) continue
    entries.set(entry.provider, {
      provider: entry.provider,
      // The route key, like every other catalog route's: the directory has
      // always shown route keys.
      displayName: entry.provider,
      ...address(entry.provider),
      // A route a catalog source describes is one the adapter knows: the
      // source is the catalog this route draws its models from.
      declared: false,
      ...entry.defaultBaseURL === undefined ? {} : { defaultBaseURL: entry.defaultBaseURL },
      ...entry.api === undefined ? {} : { defaultApi: entry.api },
      ...entry.env.length === 0 ? {} : { nativeAuth: { env: entry.env, oauth: false } },
    })
  }
  for (const [provider, profile] of profiles) {
    const known = entries.get(provider)
    entries.set(provider, {
      ...known,
      provider,
      displayName: profile.displayName,
      ...address(provider),
      // A route no catalog describes is one configuration declared by itself:
      // the adapter ships nothing about it, so its profile names its protocol
      // and its endpoint.
      ...known === undefined ? { declared: true } : {},
      ...profile.catalogError === undefined ? {} : { error: profile.catalogError },
    })
  }
  return [...entries.values()]
}

/** Register one generic pi-ai adapter for all configured provider routes. */
export function apply(ctx: Context, config: Config): void {
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
  const settingsNs = ctx.fiber.entry?.options.id ?? NS
  let lastRaw: ReturnType<Config['providers']['get']> | undefined
  let lastCatalog: ModelsDevSnapshot | undefined
  let memoized: ReadonlyMap<string, ResolvedPiAiProviderProfile> | undefined
  /**
   * The catalog source each route may draw its models from.
   *
   * The source is read per resolution rather than captured once, because the
   * service that owns it may mount after this plugin and replaces its catalog
   * on every refresh. A route the source does not describe serves the
   * installed pi-ai catalog unchanged.
   */
  const remoteLookup: RemoteCatalogLookup = (provider) => {
    const facts = ctx.get('llmModelsDev')?.provider(provider)
    return facts === undefined ? undefined : modelsDevCatalog(facts)
  }
  /**
   * The resolved profiles for the current configuration, memoized by the raw
   * snapshot's identity — which is also what makes the adapter's own snapshot
   * stable across operations that observe no change. The catalog source's
   * snapshot is part of that identity, so a refreshed catalog reaches the next
   * request without a restart.
   *
   * Catalog diagnostics stay in the snapshot beside serviceable models, so
   * stored configuration remains visible after an installed catalog changes.
   * Scalar configuration errors still reject resolution.
   */
  const profiles = (): ReadonlyMap<string, ResolvedPiAiProviderProfile> => {
    const raw = config.providers.get()
    const catalog = ctx.get('llmModelsDev')?.snapshot()
    if (raw === lastRaw && catalog === lastCatalog && memoized !== undefined) return memoized
    const next = resolveProfiles(
      structuredClone(raw) as import('./config.ts').Options['providers'],
      'deferred',
      remoteLookup,
    )
    lastRaw = raw
    lastCatalog = catalog
    memoized = next
    return next
  }
  profiles()
  ctx.on('internal/config', (fiber, next) => {
    const raw: unknown = next()
    if (fiber !== ctx.fiber) return raw
    const candidate = Config(raw as import('./config.ts').Options)
    assertServiceable(
      { providers: structuredClone(candidate.providers.get()) } as import('./config.ts').Options,
      { providers: structuredClone(config.providers.get()) } as import('./config.ts').Options,
      remoteLookup,
    )
    return raw
  })

  const resolveApiKey = async (
    provider: string,
    profile: ResolvedPiAiProviderProfile,
  ): Promise<string | undefined> => {
    const ref = profile.apiKeyEnv
    // Only a profile that names no credential at all defers to pi-ai's
    // provider-native discovery. Once one is named, a miss must fail loud:
    // handing pi-ai `undefined` would let it pick up an unrelated ambient key
    // (OPENAI_API_KEY and friends), billing another tenant for a request the
    // deployment meant to authenticate differently.
    if (ref === undefined) return undefined
    const credentials = ctx.get('credentials')
    const hit = credentials !== undefined
      ? (await credentials.resolve(ref))?.value
      // Without the seam the environment is the whole credential plane.
      : launchEnvironmentOf(ctx).get(ref)?.value
    if (hit !== undefined && hit.length > 0) return assertUsableApiKey(hit, 'llm-pi-ai', ref)
    throw new LlmError(
      `llm-pi-ai: no credential for provider route "${provider}"; its profile resolves ${ref}, which is not`
      + ` set — store ${ref} through the credentials service (the web Models page writes it) or export it,`
      + ' and remove apiKeyEnv only if this provider should authenticate from pi-ai\'s own environment discovery',
      'MISSING_CREDENTIAL',
    )
  }

  // One store and one ambient context for the whole plugin instance: both read
  // through `ctx` per call, so they stay correct across the collection rebuilds
  // a configuration change causes, and a sign-in survives one.
  const auth = { credentials: credentialStoreFrom(ctx), authContext: authContextFrom(ctx) }
  const adapter = new PiAiAdapter({
    profiles,
    resolveApiKey,
    auth,
    // A route that draws its models from the catalog does not know them until
    // the catalog reports them, so an operation that names one waits for the
    // first attempt rather than reporting an unknown model.
    awaitCatalog: async () => { await ctx.get('llmModelsDev')?.ready() },
    prepareHeaders: (request, headers) => ctx.waterfall('llm-pi-ai/request-headers', request, headers, () => headers),
    resolveAttachments: () => ctx.get('attachments'),
    resolveImageAccess: (attachments, ref) => resolveImageAttachmentAccess(
      attachments,
      hostPath => ctx.get('fs')?.processPathFromHostPath(hostPath),
      ref,
    ),
    onReplayDegrade: ({ provider, model, reason }) => {
      ctx.logger.warn(
        `llm-pi-ai: unusable replay state on assistant history for route "${provider}/${model}";`
        + ` sending that message as provider-neutral content (${reason})`,
      )
    },
  })
  // Independent of the route set: signing in is what makes a route worth
  // adding, so the flows are offered before any profile names their provider.
  // Scoped to the authorization seam rather than injected outright, because a
  // composition without it (headless, ACP) simply has no surface to sign in
  // from, while everything else this plugin does still works.
  ctx.inject(['authorization'], (authorized) => { registerPiAiFlows(authorized, auth) })
  // The full installed catalog is configurable from the moment the plugin
  // mounts — dormant or not — so configuration surfaces can offer every
  // pi-ai provider before any route exists. Hand-declared routes join it as
  // profiles appear, and leave with them.
  let directory: DirectoryRegistrationHandle | undefined
  let directoryFacts: unknown
  /**
   * The providers a catalog source describes, as directory entries.
   *
   * The source is read per call rather than captured once, because the
   * service that owns it may mount after this plugin and replaces its catalog
   * on every refresh.
   */
  const catalogProviders = (): ModelsDevProviderEntry[] => {
    const snapshot = ctx.get('llmModelsDev')?.snapshot()
    return snapshot === undefined ? [] : modelsDevProviders(snapshot.providers.values())
  }
  const ensureDirectory = (): void => {
    const entries = directoryEntries(profiles(), settingsNs, catalogProviders())
    if (deepEqualJson(entries, directoryFacts)) return
    // Atomic replace, never dispose-then-register: a route another adapter
    // family already declares (a profile keyed `deepseek-official`) would
    // otherwise leave this plugin's whole directory withdrawn and the Models
    // page empty. The candidate set is validated first, so a collision keeps
    // the previous entries serving and only costs a diagnostic.
    if (directory === undefined) {
      directory = ctx.llm.registerConfigurableProviders(entries)
    } else {
      directory.replace(entries)
    }
    directoryFacts = entries
  }
  ensureDirectory()
  // A replaced catalog changes which providers the directory offers, so the
  // directory is rebuilt when the catalog service publishes one.
  ctx.on('llmModelsDev/refresh', () => { ensureDirectory() })
  /** Host-owned request inputs for discovery of one configured route. */
  const storedDiscoveryProfile = (
    provider: string | undefined,
  ): StoredModelDiscoveryProfile | undefined => {
    if (provider === undefined) return undefined
    const profile = profiles().get(provider)
    if (profile === undefined) return undefined
    return {
      headers: profile.headers,
      resolveApiKey: () => resolveApiKey(provider, profile),
    }
  }
  // Interrogating an endpoint is a configuration-time action over a draft, so
  // it is offered for the whole namespace rather than per route: the provider
  // a surface is adding does not exist yet. The draft is the whole request
  // except the stored credential and deployment-owned headers: the curated UI
  // accepts neither, so an already-configured route supplies both inside the
  // Host rather than widening the discovery request.
  ctx.llm.registerModelDiscovery(settingsNs, (request, signal) => discoverModels(
    { ...request, ...signal === undefined ? {} : { signal } },
    () => storedDiscoveryProfile(request.provider),
    // The models the named route's catalog source offers, so the list a
    // configuration surface offers is the list that catalog carries — not the
    // route's own configured models, which are what the surface is editing.
    async (provider) => {
      await ctx.get('llmModelsDev')?.ready()
      return remoteLookup(provider)?.models
    },
  ))
  // Route effects bind to this apply fiber via the stable `ctx` reference,
  // even when a swap runs inside the scoped settings callback below. A bare
  // mount (zero routes) is the dormant posture: nothing registers until a
  // settings section supplies profiles, and routes drop when it empties.
  let registration: AdapterRegistrationHandle | undefined
  let registeredFacts: unknown
  const ensureRegistrationFacts = (): void => {
    const facts = registrationFacts(profiles())
    if (deepEqualJson(facts, registeredFacts)) return
    // The registry captures the route set and each route's retry policy at
    // registration, so a change to either must re-register. The swap is
    // atomic (same adapter instance, validated before anything moves): a
    // conflicting route leaves the previous routes serving requests, and
    // `registeredFacts` only advances once the registry actually holds the
    // new set — so returning to a working configuration always re-applies.
    const routes = [...profiles().keys()]
    if (registration === undefined) {
      // Dormant bare mount: nothing is registered until a section supplies
      // profiles, and an empty section keeps it that way.
      if (routes.length === 0) {
        registeredFacts = facts
        return
      }
      registration = ctx.llm.registerAdapter(routes, adapter)
    } else {
      registration.replace(routes)
    }
    registeredFacts = facts
  }
  ensureRegistrationFacts()

  ctx.on('loader/volatile-update', () => {
    try { ensureRegistrationFacts(); ensureDirectory() }
    catch (error) {
      ctx.logger.error('llm-pi-ai: configuration conflicts with an existing provider route')
      ctx.logger.error(error)
    }
  })
}
