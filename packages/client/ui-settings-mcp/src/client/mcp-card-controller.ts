/** The MCP page's staged model over the `mcp-servers` settings namespace. */

import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'

/**
 * Namespace of the MCP servers manager's settings. Spelled here rather than
 * imported: a client package must not depend on a Host package.
 */
export const MCP_SERVERS_NS = 'mcp-servers'

/** The transport one server speaks. */
export type McpTransport = 'stdio' | 'streamable-http'

/** One environment variable or header the user typed. */
export interface McpPairDraft {
  /** The variable or header name. */
  key: string
  /** The value the user typed; never read back from the Host. */
  value: string
}

/** One server the page edits. */
export interface McpServerDraft {
  /** The server name; the key the Host stores it under. */
  name: string
  /** The transport the server speaks. */
  transport: McpTransport
  /** The command that starts a stdio server. */
  command: string
  /** The arguments of a stdio server, one per line. */
  args: string
  /** The working directory of a stdio server. */
  cwd: string
  /** The endpoint of a streamable-http server. */
  url: string
  /** Whether the deployment connects to the server. */
  enabled: boolean
  /** The environment variables of a stdio server. */
  env: McpPairDraft[]
  /** The headers of a streamable-http server. */
  headers: McpPairDraft[]
}

/** The namespace as the Host serves it. */
export interface McpNamespaceValue {
  /** The configured servers, keyed by server name. */
  servers?: Record<string, McpServerValue>
}

/** One configured server as the Host serves it. */
export interface McpServerValue {
  /** The transport the server speaks. */
  transport?: McpTransport
  /** The command that starts a stdio server. */
  command?: string
  /** The arguments of a stdio server. */
  args?: string[]
  /** The working directory of a stdio server. */
  cwd?: string
  /** The endpoint of a streamable-http server. */
  url?: string
  /** Whether the deployment connects to the server. */
  enabled?: boolean
}

/** What the MCP page renders. */
export interface McpCardState {
  /** False while the namespace is not served to this client. */
  available: boolean
  /** Whether the Host document accepts writes. */
  writable: boolean
  /** Whether the page holds edits a save would write. */
  dirty: boolean
  /** Whether a staged draft is not a value the Host accepts, which blocks the save. */
  invalid: boolean
  /** Whether a save is crossing the wire. */
  saving: boolean
  /** Whether the last save did not land. */
  failed: boolean
  /** The servers the page shows, in name order. */
  servers: McpServerDraft[]
}

/** The registration-side face the MCP page's slot entry injects. */
export interface McpCardFace {
  hooks: {
    /** Page snapshot bound by the renderer as useMcpCard. */
    mcpCard: SnapshotStore<McpCardState>
  }
  /** Replace the page's draft with the given servers. */
  setServers: (servers: McpServerDraft[]) => void
  /** Write the page's draft to the Host. */
  save: () => void
  /** Drop the page's draft. */
  discard: () => void
}

/**
 * Project the Host's servers onto the page's draft shape.
 * @param servers - the namespace's servers, keyed by name.
 * @returns one draft per server, in name order.
 */
function toDrafts(servers: Record<string, McpServerValue>): McpServerDraft[] {
  return Object.entries(servers)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => ({
      name,
      transport: value.transport ?? 'stdio',
      command: value.command ?? '',
      args: (value.args ?? []).join('\n'),
      cwd: value.cwd ?? '',
      url: value.url ?? '',
      enabled: value.enabled ?? true,
      env: [],
      headers: [],
    }))
}

/**
 * Build the writes that turn the Host's servers into the page's draft.
 * @param servers - the page's draft servers.
 * @returns the ordered path operations.
 */
function toOps(servers: McpServerDraft[]): SettingsPathOpView[] {
  const ops: SettingsPathOpView[] = []
  for (const server of servers) {
    const path = ['servers', server.name]
    ops.push({ op: 'set', path: [...path, 'transport'], value: server.transport })
    if (server.transport === 'stdio') {
      ops.push({ op: 'set', path: [...path, 'command'], value: server.command })
      ops.push({
        op: 'set',
        path: [...path, 'args'],
        value: server.args.split('\n').map(line => line.trim()).filter(line => line !== ''),
      })
      ops.push({ op: 'set', path: [...path, 'cwd'], value: server.cwd })
    } else {
      ops.push({ op: 'set', path: [...path, 'url'], value: server.url })
    }
    ops.push({ op: 'set', path: [...path, 'enabled'], value: server.enabled })
    for (const pair of server.env) {
      if (pair.key === '') continue
      ops.push({ op: 'set', path: [...path, 'env', pair.key], value: pair.value })
    }
    for (const pair of server.headers) {
      if (pair.key === '') continue
      ops.push({ op: 'set', path: [...path, 'headers', pair.key], value: pair.value })
    }
  }
  return ops
}

/** Bridges the `mcp-servers` scope onto the page's staged servers. */
export class McpCardController {
  private readonly form: ConfigForm<McpNamespaceValue>
  private readonly store: SnapshotStore<McpCardState>
  private readonly unsubscribe: () => void
  private draft: McpServerDraft[] | undefined
  private saving = false
  private failed = false

  /** @param form - the bound settings form for the `mcp-servers` namespace. */
  constructor(form: ConfigForm<McpNamespaceValue>) {
    this.form = form
    this.store = createSnapshotStore(this.projection())
    this.unsubscribe = this.form.subscribe(() => { this.publish() })
  }

  private projection(): McpCardState {
    const snapshot = this.form.getSnapshot()
    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable,
      dirty: this.draft !== undefined,
      invalid: false,
      saving: this.saving,
      failed: this.failed,
      servers: this.draft ?? toDrafts(snapshot.value?.servers ?? {}),
    }
  }

  private publish(): void {
    this.store.set(this.projection())
  }

  /**
   * Build the face the page's slot registration injects.
   * @returns the page's snapshot and its actions.
   */
  inject(): McpCardFace {
    return {
      hooks: { mcpCard: this.store },
      setServers: (servers) => {
        this.draft = servers
        this.failed = false
        this.publish()
      },
      save: () => { void this.save() },
      discard: () => {
        this.draft = undefined
        this.failed = false
        this.publish()
      },
    }
  }

  private async save(): Promise<void> {
    if (this.draft === undefined || this.saving) return
    const snapshot = this.form.getSnapshot()
    if (!snapshot.writable) return
    this.saving = true
    this.failed = false
    this.publish()
    try {
      const ops = toOps(this.draft)
      for (const name of Object.keys(snapshot.value?.servers ?? {})) {
        if (!this.draft.some(server => server.name === name)) {
          ops.push({ op: 'unset', path: ['servers', name] })
        }
      }
      const landed = await this.form.mutate(ops)
      if (landed) this.draft = undefined
      else this.failed = true
    } catch {
      this.failed = true
    } finally {
      this.saving = false
      this.publish()
    }
  }

  /** Release the accepted-value subscription. */
  dispose(): void { this.unsubscribe() }
}
