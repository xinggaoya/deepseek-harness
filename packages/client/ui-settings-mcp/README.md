---
description: "The MCP servers settings section on the dsh web client: the servers this deployment connects to."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-mcp

English | [中文](README.zh.md)

## Summary

Open **Settings** in the sidebar and select **MCP servers** to change the Model Context Protocol servers this deployment connects to. The page edits each server's name, transport, command or endpoint, working directory, environment variables, headers, and whether the deployment connects to it. The edits are staged and written on save.

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

The **MCP servers** section writes the `mcp-servers` namespace the MCP servers manager owns. One card holds one server: **Name** is the key the deployment stores it under, **Transport** chooses a local process or a remote endpoint, and the fields below it match that transport. **Add a server** appends a new card; **Remove** drops the server from the namespace. Nothing is written until **Save**.

A stored environment variable or header is never sent back to the browser, so the page shows only the entries the user typed in this session; writing the same name again replaces the stored value.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host half is an empty `apply`, present only so the package holds a Loader row the client module system serves the browser half for. The browser half binds the `mcp-servers` namespace through `ctx.configForms.get`, keeps the edited servers in `McpCardController` as a draft, and registers `McpSection` into the settings shell's `settings.section` slot through `ctx.configForms.whileServed` — the page exists only while the Host serves that namespace. A save turns the draft into path operations and hands them to the namespace's form. The page's copy lives in this package's `settings.mcp` dictionary.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-settings](../ui-settings/README.md) — the settings scope and the served-namespace watch the page rides.
- [mcp-servers](../../mcp/mcp-servers/README.md) — the manager that owns the namespace this page edits.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the server configuration the page writes; the mcp client owns the tool schemas those servers contribute.

#### KV Cache effect

None by itself; the page writes configuration. A new server adds tool schemas to the request, which changes what a provider sends.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Stored secrets stay invisible** — the deployment never returns a stored environment variable or header, so the page cannot list or remove one; it can only write a value under a name.
- **The live connection state is not shown** — the page configures the servers; whether one is connected is visible in the deployment's logs.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
