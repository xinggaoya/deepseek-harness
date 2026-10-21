/**
 * Deployment-owned MCP servers: the settings namespace over the `mcp-client`
 * instances this deployment connects to.
 *
 * The namespace holds one entry per server, keyed by the server name that
 * becomes the tool namespace prefix. The manager reconciles the running
 * instances with that namespace: a new or changed entry starts a client, and a
 * removed or disabled entry stops its client.
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { Fiber, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
// Type-only: the Loader's volatile-configuration event declaration.
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { McpServer, sameConnection, toClientConfig } from './entry.ts'
import type { McpClientInput, McpServerConfig } from './entry.ts'
import type { McpServerEntry } from './types.ts'

/** The resolved configuration of the MCP servers namespace. */
export interface ResolvedConfig {
  /** The configured servers, keyed by server name. */
  readonly servers: Volatile<Record<string, McpServerConfig>>
}

/** One running client instance and the configuration it was started with. */
interface LiveServer {
  /** The instance's fiber; disposing it stops the connection and unregisters its tools. */
  readonly fiber: Fiber
  /** The configuration the instance was started with. */
  readonly config: McpClientInput
}

/**
 * The MCP servers a deployment connects to: one client instance per enabled
 * entry of the `mcp-servers` settings namespace.
 */
export class McpServers extends Service {
  /** Services the manager needs: the tool registry the clients publish into. */
  static inject = ['tools']

  /** The settings namespace: one entry per server, keyed by the server name. */
  static Config = z.object({
    /** The configured MCP servers, keyed by server name. */
    servers: z.dict(McpServer).default({}).volatile(),
  })

  /** The running client instances, keyed by server name. */
  private readonly live = new Map<string, LiveServer>()
  /** The context that owns the client instances. */
  private readonly owner: Context

  /**
   * @param ctx - the owning Cordis context.
   * @param config - the resolved namespace configuration.
   */
  constructor(ctx: Context, private readonly config: ResolvedConfig) {
    super(ctx, 'mcpServers')
    this.owner = ctx
    ctx.on('loader/volatile-update', (paths) => {
      if (!paths.some(path => path[0] === 'servers')) return
      this.reconcile()
    })
    ctx.effect(() => {
      this.reconcile()
      return () => { this.stopAll() }
    }, 'mcp-servers.manager')
  }

  /**
   * Bring the running instances in line with the namespace.
   */
  private reconcile(): void {
    const desired = this.config.servers.get()
    for (const [name, live] of [...this.live]) {
      const entry = desired[name]
      if (entry === undefined || !entry.enabled || !sameConnection(live.config, toClientConfig(name, entry))) {
        this.stop(name, live)
      }
    }
    for (const [name, entry] of Object.entries(desired)) {
      if (!entry.enabled) continue
      if (this.live.has(name)) continue
      this.start(name, entry)
    }
  }

  /**
   * Start the client for one server.
   * @param name - the server name.
   * @param entry - the configured entry.
   */
  private start(name: string, entry: McpServerEntry): void {
    const config = toClientConfig(name, entry)
    const fiber = this.owner.plugin(McpClient, config)
    this.live.set(name, { fiber, config })
  }

  /**
   * Stop the client for one server.
   * @param name - the server name.
   * @param live - the running instance.
   */
  private stop(name: string, live: LiveServer): void {
    this.live.delete(name)
    void live.fiber.dispose()
  }

  /** Stop every running client. */
  private stopAll(): void {
    for (const [name, live] of [...this.live]) this.stop(name, live)
  }
}

export default McpServers
