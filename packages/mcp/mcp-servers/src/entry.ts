/** The configuration of one MCP server this deployment connects to. */

import z from '@deepseek-ai/schemastery'
import type { McpServerEntry } from './types.ts'

/** One server the deployment starts as a child process. */
export const StdioServer = z.object({
  /** The transport this server speaks. */
  transport: z.const('stdio'),
  /** The command that starts the server. */
  command: z.string().min(1),
  /** Arguments passed to the command. */
  args: z.array(z.string()).default([]),
  /** Environment variables the server reads; never returned to a client. */
  env: z.dict(z.string().role('secret')).default({}),
  /** Working directory of the spawned server. */
  cwd: z.string().default(''),
  /** Whether the deployment connects to this server. */
  enabled: z.boolean().default(true),
})

/** One server the deployment reaches over HTTP. */
export const StreamableHttpServer = z.object({
  /** The transport this server speaks. */
  transport: z.const('streamable-http'),
  /** The server's endpoint. */
  url: z.string().min(1),
  /** Headers the endpoint requires; never returned to a client. */
  headers: z.dict(z.string().role('secret')).default({}),
  /** Whether the deployment connects to this server. */
  enabled: z.boolean().default(true),
})

/** One configured MCP server, in either transport. */
export const McpServer = z.union([StdioServer, StreamableHttpServer]) as z<McpServerInput, McpServerConfig>

/** One configured server before the schema fills its defaults. */
export type McpServerInput =
  | {
    /** Transport the server speaks. */
    readonly transport: 'stdio'
    /** The command that starts the server. */
    readonly command: string
    /** Arguments passed to the command. */
    readonly args?: readonly string[]
    /** Environment variables the server reads. */
    readonly env?: Readonly<Record<string, string>>
    /** Working directory of the spawned server. */
    readonly cwd?: string
    /** Whether the deployment connects to this server. */
    readonly enabled?: boolean
  }
  | {
    /** Transport the server speaks. */
    readonly transport: 'streamable-http'
    /** The server's endpoint. */
    readonly url: string
    /** Headers the endpoint requires. */
    readonly headers?: Readonly<Record<string, string>>
    /** Whether the deployment connects to this server. */
    readonly enabled?: boolean
  }

/** One configured server as the namespace stores it. */
export type McpServerConfig =
  | {
    /** Transport the server speaks. */
    readonly transport: 'stdio'
    /** The command that starts the server. */
    readonly command: string
    /** Arguments passed to the command. */
    readonly args: string[]
    /** Environment variables the server reads. */
    readonly env: Record<string, string>
    /** Working directory of the spawned server. */
    readonly cwd: string
    /** Whether the deployment connects to this server. */
    readonly enabled: boolean
  }
  | {
    /** Transport the server speaks. */
    readonly transport: 'streamable-http'
    /** The server's endpoint. */
    readonly url: string
    /** Headers the endpoint requires. */
    readonly headers: Record<string, string>
    /** Whether the deployment connects to this server. */
    readonly enabled: boolean
  }

/** The client configuration the manager builds, before the client's schema fills its defaults. */
export type McpClientInput =
  | {
    readonly transport: 'stdio'
    readonly serverName: string
    readonly command: string
    readonly args: string[]
    readonly env: Readonly<Record<string, string>>
    readonly cwd: string
    readonly failOnStartupError: boolean
  }
  | {
    readonly transport: 'streamable-http'
    readonly serverName: string
    readonly url: string
    readonly headers: Readonly<Record<string, string>>
    readonly failOnStartupError: boolean
  }

/**
 * Build the client configuration for one server entry.
 * @param name - the server name, which becomes the tool namespace prefix.
 * @param entry - the configured entry.
 * @returns the client configuration for one server.
 */
export function toClientConfig(name: string, entry: McpServerEntry): McpClientInput {
  if (entry.transport === 'stdio') {
    return {
      transport: 'stdio',
      serverName: name,
      command: entry.command ?? '',
      args: [...(entry.args ?? [])],
      env: { ...(entry.env ?? {}) },
      cwd: entry.cwd ?? '',
      // A server that is down at startup keeps its supervisor's reconnect loop;
      // the manager reports the failure instead of failing the deployment.
      failOnStartupError: false,
    }
  }
  return {
    transport: 'streamable-http',
    serverName: name,
    url: entry.url ?? '',
    headers: { ...(entry.headers ?? {}) },
    failOnStartupError: false,
  }
}

/**
 * Compare two client configurations by the fields a restart depends on.
 * @param left - the configuration a running instance was started with.
 * @param right - the configuration the namespace now holds.
 * @returns whether the two describe the same connection.
 */
export function sameConnection(left: McpClientInput, right: McpClientInput): boolean {
  if (left.transport !== right.transport) return false
  if (left.serverName !== right.serverName) return false
  if (left.transport === 'stdio' && right.transport === 'stdio') {
    return left.command === right.command
      && left.cwd === right.cwd
      && left.args.join('\u0000') === right.args.join('\u0000')
      && sameRecord(left.env, right.env)
  }
  if (left.transport === 'streamable-http' && right.transport === 'streamable-http') {
    return left.url === right.url && sameRecord(left.headers, right.headers)
  }
  return false
}

/**
 * Compare two key-value records by their entries.
 * @param left - the first record.
 * @param right - the second record.
 * @returns whether both hold the same entries.
 */
function sameRecord(left: Readonly<Record<string, string>>, right: Readonly<Record<string, string>>): boolean {
  const leftKeys = Object.keys(left)
  if (leftKeys.length !== Object.keys(right).length) return false
  return leftKeys.every(key => left[key] === right[key])
}
