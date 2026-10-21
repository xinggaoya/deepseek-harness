/**
 * MCP servers settings section, browser half: the servers this deployment
 * connects to, edited over the `mcp-servers` settings namespace. The page
 * registers while the Host serves that namespace, so a deployment without the
 * MCP servers manager shows no trace of it.
 */

// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the ctx.configForms Context merge. Cross-plugin collaboration
// goes through the service, never a value import (client bundle purity gate).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { McpSection } from './McpSection.tsx'
import { McpCardController, MCP_SERVERS_NS } from './mcp-card-controller.ts'
import { en, zh, type McpSettingsLocaleKey } from './locales.ts'

export type { McpSectionInjected, McpSectionProps } from './McpSection.tsx'
export type {
  McpCardFace, McpCardState, McpNamespaceValue, McpPairDraft, McpServerDraft, McpTransport,
} from './mcp-card-controller.ts'
export type { McpSettingsLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** MCP servers settings page copy. */
    'settings.mcp': McpSettingsLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.mcp'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'configForms']

/**
 * Mount the MCP servers settings page while the Host serves its namespace.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-mcp: dictionaries')
  const card = new McpCardController(ctx.configForms.get(MCP_SERVERS_NS))
  ctx.effect(() => () => { card.dispose() }, 'ui-settings-mcp: form subscription')
  ctx.effect(() => ctx.configForms.whileServed([MCP_SERVERS_NS], () => ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'mcp', order: 30, label: () => t('nav'), locale: NS, inject: () => card.inject(),
  }, McpSection))), 'ui-settings-mcp: page')
}
