/** Skill catalog Remote owner: the Session composition view and the preset project view. */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: the agent-preset registry's Context merge (ctx.agentPresets).
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-agent-preset-registry/types'
import { SessionQueryError } from '@deepseek-ai/dsh-session-query'
import { isUserInvocable } from '@deepseek-ai/dsh-skill'
import type { SkillSummary } from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-working-directory'
import type { ScopeKey } from '@deepseek-ai/dsh-scope'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { SkillEntry, SkillListRequest, SkillListValue, SkillPresetListRequest } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `skills` Remote namespace. */
    skillCatalog: SkillCatalog
  }
}

/** Project one discovered skill onto its wire entry. */
function toEntry(skill: SkillSummary): SkillEntry {
  return {
    name: skill.name,
    ...skill.path === undefined ? {} : { path: skill.path },
    description: skill.description,
    ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
    modelInvocable: skill.invocation.modelInvocable,
    userInvocable: skill.invocation.userInvocable,
    source: skill.source,
  }
}

/** Host service backing `ctx.remote.skills` without activating a cold Agent. */
export class SkillCatalog extends TypertRemoteService {
  static inject = ['agents', 'sessionQuery', 'typert', 'workingDirectory']

  /** @param ctx - Host context carrying Session reads and optional skill/preset services. */
  constructor(ctx: Context) {
    super(ctx, 'skillCatalog', { namespace: 'skills' })
  }

  /**
   * List the skills one composition offers.
   *
   * A Session request answers the human-facing composer: the Session's cwd
   * and preset select the view, and only user-invocable skills are listed. A
   * preset request answers a configuration surface: the preset's standing
   * scope and the requested project directory select the view, and every
   * discovered skill is listed with its invocation policy.
   * @param request - Session identity or preset scope and project directory.
   * @param signal - caller lifetime carried by the Remote transport; admitted catalog reads retain their existing completion semantics.
   * @returns skill metadata without loading skill bodies.
   * @throws RemoteError when the Session cannot be inspected, the preset is unknown, or no registry can serve the view.
   */
  @Remote
  async list(request: SkillListRequest, signal: AbortSignal): Promise<SkillListValue> {
    if ('sessionId' in request) return this.listForSession(request.sessionId, signal)
    return this.listForPreset(request)
  }

  /** List the user-invocable skills visible to one Session composition. */
  private async listForSession(sessionId: SessionId, signal: AbortSignal): Promise<SkillListValue> {
    let cwd: string
    let agentPreset: string | undefined
    try {
      using observation = await this.ctx.sessionQuery.observeSession(sessionId)
      if (observation.projections === undefined) {
        throw new Error('skill catalog requires a projected Session observation')
      }
      cwd = observation.projections.values.workingDirectory
        ?? observation.header.cwd
        ?? this.ctx.workingDirectory.defaultDirectory
      agentPreset = observation.projections.values.agentPreset ?? undefined
      const live = this.ctx.agents.get(sessionId)
      if (live !== undefined) cwd = await this.ctx.workingDirectory.ensure(live, signal)
    } catch (error: unknown) {
      if (error instanceof SessionQueryError
        && error.code === 'SESSION_QUERY_SESSION_NOT_FOUND') {
        throw new RemoteError('session/not-found', `session "${sessionId}" not found`, { sessionId })
      }
      throw new RemoteError(
        'gateway/internal',
        `session "${sessionId}" could not be inspected: ${String(error)}`,
        {},
      )
    }

    const live = this.ctx.agents.get(sessionId)
    const presets = this.ctx.get('agentPresets')
    const scoped = live === undefined ? undefined : presets?.serviceFor(live, 'skills')
    const skillRegistry = scoped ?? this.ctx.get('skills')
    if (skillRegistry === undefined) {
      throw new RemoteError(
        'gateway/internal',
        'skill registry is absent: neither this session\'s agent preset nor the host composition mounts @deepseek-ai/dsh-skill',
        {},
      )
    }

    await using lease = live === undefined ? await this.scopeFor(agentPreset) : undefined
    const scope = live ?? lease?.key
    try {
      const skills = (await skillRegistry.list({ cwd, scope })).filter(isUserInvocable)
      return { skills: skills.map(toEntry) }
    } catch (error: unknown) {
      throw new RemoteError('gateway/internal', `skill listing failed: ${String(error)}`, {})
    }
  }

  /** List every skill one preset's project scope offers. */
  private async listForPreset(request: SkillPresetListRequest): Promise<SkillListValue> {
    const presets = this.ctx.get('agentPresets')
    if (presets === undefined) {
      throw new RemoteError(
        'gateway/internal',
        'agent preset registry is absent: mount @deepseek-ai/dsh-agent-preset-registry to read a project skill catalog',
        {},
      )
    }
    const skillRegistry = this.ctx.get('skills')
    if (skillRegistry === undefined) {
      throw new RemoteError(
        'gateway/internal',
        'skill registry is absent: mount @deepseek-ai/dsh-skill to read a project skill catalog',
        {},
      )
    }
    const presetId = request.presetId ?? presets.defaultId
    const cwd = request.cwd ?? this.ctx.workingDirectory.defaultDirectory
    let lease: ({ key: ScopeKey } & AsyncDisposable)
    try {
      lease = await presets.acquireScope(presetId)
    } catch (error: unknown) {
      throw new RemoteError('gateway/bad-request', `agent preset "${presetId}" is unknown: ${String(error)}`, {})
    }
    await using owned = lease
    try {
      const skills = await skillRegistry.list({ cwd, scope: owned.key })
      return { skills: skills.map(toEntry) }
    } catch (error: unknown) {
      throw new RemoteError('gateway/internal', `skill listing failed: ${String(error)}`, {})
    }
  }

  /** Resolve a live or standing preset scope without creating an Agent. */
  private async scopeFor(
    agentPreset: string | undefined,
  ): Promise<({ key: ScopeKey } & AsyncDisposable) | undefined> {
    const presets = this.ctx.get('agentPresets')
    if (presets === undefined) return undefined
    try {
      return await presets.acquireScope(agentPreset)
    } catch {
      // An unknown or unusable recorded preset falls back to the global registry.
      return undefined
    }
  }
}

export default SkillCatalog
