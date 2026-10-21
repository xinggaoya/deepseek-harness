# Agent Note: Own the deployment's skills, default prompt, and MCP servers in the Settings shell

Status: implemented

English | [中文](2026-10-21-deployment-settings-pages.zh.md)

## Problem

The Web client could not show what a deployment offers, could not change the prompt its sessions start from, and could not configure the MCP servers it connects to. Three surfaces were wanted: a page that lists the skills, a page that edits the default prompt — including replacing it wholesale — and a page that configures MCP servers visually.

Each surface raises the same ownership question. The skills a session sees come from the providers that registered them; the prompt comes from the prompt registry and the presets that shadow it; the MCP servers come from the `mcp-client` instances a deployment states in its configuration. A page that edits any of them has to pick one owner, and the settings shell is the only place a user looks for such a change.

## Decision

### The skills page lists; it does not edit

`@deepseek-ai/dsh-client-ui-settings-skills` registers a `settings.section` row and reads the catalog through the `skills` Remote namespace. The `skills.list` request gained a preset-scoped form: a session id lists the skills of that session, and a preset id lists every skill the preset's scope offers, each with its source and whether a user may invoke it. A skill's invocation policy belongs to the provider that contributed it, so the page states the policy instead of editing it.

### The default prompt page edits the deployment persona

`@deepseek-ai/dsh-client-ui-settings-prompt` edits the `system-prompt` namespace. The `system-prompt` plugin now exposes `personaPrefix`, `personaSuffix`, and `includeHarnessIdentity` as volatile fields and re-registers its prompt sections when the Loader commits a new value, so an edit takes effect without a restart. A new `personaComplete` field makes the persona prefix the complete system prompt: the identity line, the trailing prompt, and every other section drop out.

The shipped Web presets declared a `persona` row with the same text the deployment persona carries, and a preset-scoped section shadows the deployment one. Those rows are removed, so the deployment persona is the persona every preset session starts from and the page edits what the user actually sees. The `minimal` preset keeps its own persona and continues to shadow the deployment's.

### The MCP servers page configures the deployment's servers

`@deepseek-ai/dsh-mcp-servers` owns a `mcp-servers` settings namespace: one entry per server, keyed by the name that becomes its tool namespace prefix. Each entry names a transport — a local process with its command, arguments, environment, and working directory, or a remote endpoint with its headers — and whether the deployment connects to it. The manager reconciles the running `mcp-client` instances with that namespace: a new or changed entry starts a client, a removed or disabled entry stops its client. The servers are deployment-level, so every session sees their tools.

`@deepseek-ai/dsh-client-ui-settings-mcp` edits that namespace over path operations, because a server list is a dictionary of entries rather than a flat set of fields. The environment and header values are secrets: the settings service keeps them out of every response, so the page writes them without reading them back.

## Alternatives considered

**Let the default prompt page edit each preset's persona.** A preset's persona is part of its composition, and the presets page already shows a composition read-only. Editing one preset's persona would leave the other presets on the deployment's text, so the "default prompt" would differ per preset — the opposite of a default.

**Keep the presets' persona rows and give the deployment persona a different section name.** The prompt registry would then render two persona sections for a preset session, one of them empty, and the deployment persona's `complete` flag would have to win over the preset's own — a rule no reader of the prompt would expect.

**Give the MCP page its own Host service and a bespoke persistence format.** The settings domain already stores, redacts, versions, and hot-reloads a namespace, and its dictionary keys can be added and removed by path operation. A second store would duplicate that machinery for one list.

**Scope the MCP servers to a session.** A session-scoped server list would need one client per session and would give every session a different tool set, which no deployment wants.

## Consequences

The settings shell offers three new pages. The skills page is read-only. The default prompt page changes the prompt of every session of the deployment that does not declare a persona of its own. The MCP page changes which servers the deployment connects to; a server that cannot be reached keeps its supervisor's reconnect loop, and the deployment's log carries the failure.

Two limits are visible to the user. A preset that declares a persona of its own still wins over the deployment persona, and the page edits the deployment's. The MCP page cannot list a stored environment variable or header, because the deployment never returns one.

## Testing

- [system-prompt.spec.ts](../../../../packages/core/system-prompt/tests/system-prompt.spec.ts) pins the volatile re-registration, the identity toggle, and the complete persona.
- [session-skills.host.spec.ts](../../../../packages/api/session-controller/tests/session-skills.host.spec.ts) pins the session and preset views of the skills catalog.
- [mcp-servers.spec.ts](../../../../packages/mcp/mcp-servers/tests/mcp-servers.spec.ts) pins the reconciliation of the namespace with the running clients.
- [apply.client.spec.ts](../../../../packages/client/ui-settings-prompt/tests/apply.client.spec.ts), [section.client.spec.tsx](../../../../packages/client/ui-settings-prompt/tests/section.client.spec.tsx), and the matching files under [ui-settings-skills](../../../../packages/client/ui-settings-skills/tests) and [ui-settings-mcp](../../../../packages/client/ui-settings-mcp/tests) pin each page's registration and its rendered behavior.
