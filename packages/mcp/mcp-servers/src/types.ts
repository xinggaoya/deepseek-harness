/** Client-safe view of one configured MCP server. */

/** The transport one MCP server speaks. */
export type McpServerTransport = 'stdio' | 'streamable-http'

/** One configured MCP server, as the settings namespace stores it. */
export interface McpServerEntry {
  /** Transport the server speaks. */
  readonly transport: McpServerTransport
  /** The command that starts a stdio server. */
  readonly command?: string
  /** Arguments passed to the command, without shell interpolation. */
  readonly args?: readonly string[]
  /** Environment variables a stdio server reads. */
  readonly env?: Readonly<Record<string, string>>
  /** Working directory of the spawned server. */
  readonly cwd?: string
  /** The URL of a streamable-http server. */
  readonly url?: string
  /** Headers an http server requires. */
  readonly headers?: Readonly<Record<string, string>>
  /** Whether the deployment connects to this server. */
  readonly enabled: boolean
}
