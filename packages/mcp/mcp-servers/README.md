---
description: "Deployment-owned MCP servers: the settings namespace over the mcp-client instances a deployment connects to."
kind: "package-reference"
---

# @deepseek-ai/dsh-mcp-servers

English | [中文](README.zh.md)

## Summary

The `mcp-servers` settings namespace holds the MCP servers a deployment connects to, one entry per server, keyed by the server name that becomes its tool namespace prefix. The manager in this package reconciles the running `mcp-client` instances with that namespace: a new or changed entry starts a client, a removed or disabled entry stops its client, and the live state of every server is reported to whoever asks.

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

Mount `@deepseek-ai/dsh-mcp-servers` as a Loader entry and state the servers in its `servers` field, or leave it empty and let a user configure them in the Web settings. Each entry names a transport:

```yaml
- id: mcp-servers
  name: '@deepseek-ai/dsh-mcp-servers'
  config:
    servers:
      filesystem:
        transport: stdio
        command: npx
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/srv/data']
      remote:
        transport: streamable-http
        url: https://example.test/mcp
        headers:
          Authorization: 'Bearer …'
```

A stdio entry takes `command`, `args`, `env`, and `cwd`; a streamable-http entry takes `url` and `headers`. `env` and `headers` hold secrets: the settings service keeps them out of every response, so a configuration surface writes them without reading them back. `enabled: false` keeps a server configured and disconnected.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`McpServers` is a service registered under the service key `mcpServers`. Its `Config` declares one volatile `servers` dictionary, which is what makes the namespace editable in the settings surface; the Loader commits a changed dictionary in place and announces it with `loader/volatile-update`, and the manager reconciles on that announcement. Each server runs as its own `mcp-client` fiber under the manager's fiber, so disposing the manager stops every client and unregisters its tools. A server whose configuration changed is restarted; a server the namespace drops or disables is stopped.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [mcp-client](../mcp-client/README.md) — the connection supervisor this package owns one instance of per server.
- [settings](../../settings/settings/README.md) — the namespace this package writes into.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the client instances the manager owns; the mcp client owns the tool schemas those servers contribute.

#### KV Cache effect

None by itself; this package writes configuration and starts connections. Adding a server adds tools to the request, which changes the tool schemas a provider sends.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The configuration surface cannot read a stored secret** — the `env` and `headers` values never travel back to a client, so a surface that lists them can only write them.
- **One server name per deployment** — the `mcp-client` reserves the server name per scope, so two entries cannot share a name.
- **The live connection state is not published** — a server that cannot be reached reports the failure in the deployment's log.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The manager starts each client with `failOnStartupError: false`, so a server that is down keeps its supervisor's reconnect loop and the deployment stays up; the failure is reported as the server's state instead.

</details>
