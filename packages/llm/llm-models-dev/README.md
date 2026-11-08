---
description: "The models.dev model catalog served to provider routes, for users and maintainers who want a route's model list to follow new provider releases."
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-models-dev

English | [中文](README.zh.md)

## Summary

Mount `@deepseek-ai/dsh-llm-models-dev` to serve the models.dev model catalog inside a composition. The service fetches the public catalog document on a schedule, keeps the last one on disk, and publishes each provider's models with their context window, output cap, input types, and reasoning levels. `dsh-llm-pi-ai` reads it, so a provider route's model list follows new provider releases without a hand-written profile. The catalog describes capabilities, not wire dialects: a model the installed pi-ai catalog also describes keeps that entry's protocol knowledge.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin when a composition's provider routes should take their model list from a live catalog rather than from the copy of pi-ai's catalog that the installed package ships. The plugin is the catalog service: it owns the fetch, the schedule, and the parsed facts. The route that serves a provider owns what those facts mean, which is `dsh-llm-pi-ai`'s work.

### When to choose it

Choose it when a provider ships models faster than a packaged dependency can list them: a new flagship, a renamed preview, a model that only a coding plan exposes. Skip it when the installed catalog already lists every model a route serves, and when a deployment must not reach the public internet at runtime.

The catalog document is models.dev's own. This fork fetches it from its own proxy at `models.moncn.cn`, because models.dev is unreachable from the deployments the fork targets; a deployment that can reach models.dev directly names its own endpoint in `url`.

### Minimal configuration

```yaml
- id: llm-models-dev
  name: '@deepseek-ai/dsh-llm-models-dev'

- id: llm-pi-ai
  name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers:
      minimax-cn:
        apiKeyEnv: MINIMAX_CN_API_KEY
```

| Field | Default | Meaning |
|---|---|---|
| `url` | `https://models.moncn.cn/api.json` | Catalog endpoint |
| `refreshIntervalMs` | `21600000` | How often the catalog is refetched, in milliseconds |
| `timeoutMs` | `30000` | How long one catalog request may take, in milliseconds |
| `maxBytes` | `16777216` | The largest catalog reply accepted, in bytes |
| `includeDeprecated` | `false` | Whether the catalog keeps the models models.dev records as deprecated |
| `cachePath` | `~/.dsh/cache/models-dev.json` | Where the fetched catalog is kept for the next start |
| `retryIntervalMs` | `30000` | How long a failed attempt waits before the next one, in milliseconds |
| `dshHome` | `$DSH_HOME` or `~/.dsh` | Harness home the default cache location is resolved against |

### What a route serves

A route's key is the provider id the catalog records that provider under, so a route named `minimax-cn` draws the models models.dev lists for `minimax-cn`. The catalog decides which models the route serves and what each model can do; the installed pi-ai catalog still decides how to talk to a model it describes, so a model both catalogs list keeps pi-ai's protocol, its compatibility switches, and its input limits. A model only the catalog lists takes the wire protocol the provider's AI SDK package speaks and the endpoint the catalog publishes.

A route's `models` list still replaces the catalog outright, and `modelOverrides` still reshapes one model of it, so a deployment that must serve an exact set says so in its profile.

### What a configuration surface offers

A provider the catalog records is a route a configuration surface can offer, so the Models page lists it beside the providers the installed catalog ships. The offered entry names the route key, the endpoint that provider serves, the protocol its models speak, and the environment its credential is read from; the route's models and capacities come from the catalog once the route is configured. A provider whose AI SDK package names a protocol this build cannot construct is not offered — a route may still be declared by hand with a protocol of its own — and a provider the catalog records no chat model for is not offered either, because there would be nothing for the route to serve.

The list is as current as the catalog behind it: a composition that has never fetched one offers the installed catalog's providers until the first document arrives, and a composition that has one offers the catalog's providers at once. A configuration surface can ask the service to fetch the catalog again; the fetch replaces the current one, updates the cache, and announces the replacement like any other, so the projected provider list follows it.

### Failures and recovery

A fetch that fails leaves the previous catalog in place, is retried after `retryIntervalMs`, and never stops the composition from serving; the service logs the failure and keeps the composition serving. A record the catalog does not carry in a usable form is skipped and counted, so one broken entry does not cost a deployment every other provider's models. A configuration that cannot be honored — a relative endpoint, a non-positive interval — fails when the plugin mounts.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the design behind the catalog service; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

The service owns one catalog and the schedule that keeps it current, and a consumer reads it by identity: a refreshed catalog is a new object, so a consumer that memoizes on that identity notices the change without subscribing to an event. A failed fetch keeps the previous catalog, because a catalog that was current a minute ago is better than none.

The catalog describes capabilities, not dialects. What a model *is* — its context window, its output cap, its input types, its thinking levels — comes from models.dev. How to *talk* to it comes from pi-ai's installed catalog. models.dev carries the wire protocol in the one place a capabilities list cannot: the AI SDK provider package that implements the provider, and that package speaks one protocol.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | The service: configuration, fetch schedule, and the published snapshot |
| [`src/client.ts`](src/client.ts) | The bounded catalog fetch and its reply reader |
| [`src/cache.ts`](src/cache.ts) | The catalog kept on disk for the next start |
| [`src/parse.ts`](src/parse.ts) | Reading the catalog payload into provider and model facts |
| [`src/types.ts`](src/types.ts) | The fact types a consumer reads |

### Reading the catalog

The payload is one JSON document holding a record per provider and a record per model. Every record is read through a narrow reader that accepts the fields the harness uses and ignores the rest, so a field models.dev adds later never fails a fetch. A record whose identifying fields are missing or malformed is counted as skipped rather than failing the whole catalog.

### Refresh schedule

The catalog is kept on disk, so a start serves the providers it already had while the network decides how current they are: the cached catalog is read when the plugin mounts, and the network is consulted when that catalog has grown older than the refresh interval. A start with no cache fetches one at once. A successful fetch is written to the cache, so the next start has one; a failed attempt keeps the previous catalog and is retried long before the next scheduled refresh, because an empty catalog reads as a missing provider.

The reply is read under a byte ceiling rather than by its declared length, because a server that under-declares its size tells the reader nothing up front. A pending refresh never keeps the process alive on its own, and disposing the plugin cancels a fetch in flight. A replaced catalog is announced as `llmModelsDev/refresh`, so a consumer that projects the catalog into a configuration surface rebuilds that projection; the announcement carries no payload, because the service owns the current catalog and a consumer reads it from the service.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough. They move from the catalog to the adapter that consumes it.

- [dsh-llm service](../llm/README.md) — the provider-neutral service the adapter registers on.
- [llm-pi-ai adapter](../llm-pi-ai/README.md) — the adapter that draws a route's models from this catalog.
- [LLM streaming subsystem](../../../docs/subsystems/llm-streaming.md) — the `StreamChunk` protocol and adapter contract.

-----

<a id="model-experience"></a>
## Model Experience

### Provider route catalog

#### What the model sees

Nothing. The catalog decides which models a route offers and what each model's `contextWindow`, `maxTokens`, input modalities, and thinking levels are; the request that reaches the provider is built by the route's adapter, and the model sees the same content it would see with a hand-written model list.

#### Token effect

The catalog states a model's `contextWindow` and `maxTokens`, which the route uses to size its requests. A catalog fact never adds tokens to a request, and a model the catalog lists but the route does not select is never requested.

#### KV Cache effect

None. The catalog is read before a request is assembled and never reaches a provider payload, so it cannot change a request's prefix or its cache identity.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define where the catalog service stops and future work begins. They are current package constraints, not a general comparison of model catalogs or a task backlog.

- **The catalog is a public document fetched over the network** — a deployment that cannot reach the catalog endpoint keeps the catalog it last fetched, and a deployment that never reaches it serves the installed pi-ai catalog unchanged.
- **A provider's identity is its models.dev id** — a route whose key is not a provider id the catalog records draws no models from it and serves the installed catalog instead.
- **The catalog states capabilities, not dialects** — a model only the catalog lists has no compatibility switches, so an endpoint that needs one must name it in the route's own configuration.
- **The reply is read whole** — the catalog is one document of several megabytes, and a service that must not hold it in memory has no streaming reader yet.
- **The cached catalog is one file for the whole harness home** — a deployment that runs several compositions against different catalogs shares one cache, and the last successful fetch wins.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is non-authoritative working context: notes for maintainers and open questions. Shipped behavior and accepted rationale live in the sections above, the package code, and the linked Agent Notes.

- The AI SDK package a provider names is mapped to a pi-ai protocol for the packages this build can serve. A package outside that mapping states no protocol, so a route drawing its models from such a provider names its protocol in configuration instead.

</details>
