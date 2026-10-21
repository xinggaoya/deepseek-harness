/** The skill catalog the settings page shows, with the query that filters it. */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: the ctx.remote Context merge.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: the ctx.sessions Context merge.
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only: the `mainView` session reference source.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { SkillEntry } from '@deepseek-ai/dsh-api-session-controller/types'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

/** The page's state. */
export interface SkillsSectionState {
  /** Read phase of the catalog. */
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** The failure the last read reported. */
  error: string | null
  /** The skills the Host reported. */
  skills: readonly SkillEntry[]
  /** The filter text the user typed. */
  query: string
}

const INITIAL: SkillsSectionState = { status: 'idle', error: null, skills: [], query: '' }

const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

/** Reads the skill catalog of the project the main view works in. */
export class SkillsSectionController {
  /** Observable catalog and filter text. */
  readonly store: SnapshotStore<SkillsSectionState> = createSnapshotStore(INITIAL)
  private loading: Promise<void> | undefined
  private pending: AbortController | undefined

  /** @param ctx - the browser plugin context. */
  constructor(private readonly ctx: Context) {}

  /**
   * Read the catalog; concurrent calls share one read.
   * @returns Once the catalog read settles.
   */
  load(): Promise<void> {
    return this.loading ??= this.read().finally(() => { this.loading = undefined })
  }

  /**
   * Set the filter text.
   * @param query - the text the user typed.
   */
  setQuery(query: string): void {
    this.store.set({ ...this.store.getSnapshot(), query })
  }

  /** Stop the read in flight, if any. */
  dispose(): void {
    this.pending?.abort()
    this.pending = undefined
  }

  private async read(): Promise<void> {
    this.pending?.abort()
    const abort = new AbortController()
    this.pending = abort
    this.store.set({ ...this.store.getSnapshot(), status: 'loading', error: null })
    try {
      const result = await this.ctx.remote.skills.list(this.request(), abort.signal)
      if (abort.signal.aborted) return
      if (!result.ok) throw new Error(result.error.message)
      this.store.set({ ...this.store.getSnapshot(), status: 'ready', error: null, skills: result.value.skills })
    } catch (error) {
      if (abort.signal.aborted) return
      this.store.set({ ...this.store.getSnapshot(), status: 'error', error: message(error) })
    } finally {
      if (this.pending === abort) this.pending = undefined
    }
  }

  /** The catalog request for the project the main view works in. */
  private request(): { cwd?: string } {
    const cwd = this.currentDirectory()
    return cwd === undefined ? {} : { cwd }
  }

  /** The directory of the retained main-view session, when one is open. */
  private currentDirectory(): string | undefined {
    const rows = Object.values(this.ctx.sessions.list.getSnapshot().byId)
    const main = rows.find(row => (row.retainedBy.mainView ?? 0) > 0)
    return main?.cwd
  }
}
