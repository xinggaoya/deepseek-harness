/** The manager's reconciliation of the namespace and the client instances it owns. */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Volatile } from '@deepseek-ai/cordis'
import { createVolatile, updateVolatile } from '@deepseek-ai/cosmokit'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import McpServers from '../src/index.ts'
import type { McpServerConfig } from '../src/entry.ts'

/** One http server entry that points at a port nothing listens on. */
function unreachable(url = 'http://127.0.0.1:1/mcp', enabled = true): McpServerConfig {
  return { transport: 'streamable-http', url, headers: {}, enabled }
}

/** The client instances the manager owns, counted through the plugin registry. */
function clientCount(ctx: Context): number {
  const runtime = ctx.registry.get(McpClient)
  return runtime?.fibers.length ?? 0
}

/** The endpoint every running client instance was started with. */
function clientEndpoints(ctx: Context): string[] {
  const runtime = ctx.registry.get(McpClient)
  return [...(runtime?.fibers ?? [])].map(fiber => (fiber.config as { url?: string }).url ?? '')
}

/** Mount the manager over one namespace. */
async function bench(servers: Record<string, McpServerConfig>) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const fiber = ctx.plugin(McpServers, { servers })
  await fiber.await()
  const resolved = fiber.config as { servers: Volatile<Record<string, McpServerConfig>> }
  const serversRef = resolved.servers
  return {
    ctx,
    /** Commit a new namespace value the way the Loader's volatile commit does. */
    commit: (next: Record<string, McpServerConfig>) => {
      updateVolatile(serversRef, createVolatile(next))
      ctx.emit('loader/volatile-update', [['servers']])
    },
  }
}

describe('McpServers', () => {
  it('connects to an enabled server', async () => {
    const { ctx } = await bench({ live: unreachable() })

    await vi.waitFor(() => { expect(clientCount(ctx)).toBe(1) })

    await ctx.fiber.dispose()
  })

  it('does not connect to a disabled server', async () => {
    const { ctx } = await bench({ off: unreachable('http://127.0.0.1:1/mcp', false) })

    await vi.waitFor(() => { expect(clientCount(ctx)).toBe(0) })

    await ctx.fiber.dispose()
  })

  it('stops the client when the namespace drops the server', async () => {
    const { ctx, commit } = await bench({ live: unreachable() })
    await vi.waitFor(() => { expect(clientCount(ctx)).toBe(1) })

    commit({})

    await vi.waitFor(() => { expect(clientCount(ctx)).toBe(0) })

    await ctx.fiber.dispose()
  })

  it('restarts the client when the connection changed', async () => {
    const { ctx, commit } = await bench({ live: unreachable() })
    await vi.waitFor(() => { expect(clientCount(ctx)).toBe(1) })

    commit({ live: unreachable('http://127.0.0.1:2/mcp') })

    await vi.waitFor(() => { expect(clientEndpoints(ctx)).toEqual(['http://127.0.0.1:2/mcp']) })

    await ctx.fiber.dispose()
  })

  it('stops every client when the manager is disposed', async () => {
    const { ctx } = await bench({ live: unreachable() })
    await vi.waitFor(() => { expect(clientCount(ctx)).toBe(1) })

    await ctx.fiber.dispose()

    await vi.waitFor(() => { expect(clientCount(ctx)).toBe(0) })
  })
})
