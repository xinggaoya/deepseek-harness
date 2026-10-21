/**
 * Default prompt settings section, browser half: the deployment persona the
 * system prompt registry owns, edited over the `system-prompt` settings
 * namespace. The page registers while the Host serves that namespace, so a
 * deployment without a system prompt registry shows no trace of it.
 */

// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the ctx.configForms Context merge. Cross-plugin collaboration
// goes through the service, never a value import (client bundle purity gate).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { PromptSection } from './PromptSection.tsx'
import { PromptCardController, SYSTEM_PROMPT_NS } from './prompt-card-controller.ts'
import { en, zh, type PromptSettingsLocaleKey } from './locales.ts'

export type { PromptSectionInjected, PromptSectionProps } from './PromptSection.tsx'
export type { PromptCardFace, PromptCardState, PromptSettings } from './prompt-card-controller.ts'
export type { PromptSettingsLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Default prompt settings page copy. */
    'settings.prompt': PromptSettingsLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.prompt'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'configForms']

/**
 * Mount the default prompt settings page while the Host serves its namespace.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-prompt: dictionaries')
  const card = new PromptCardController(ctx.configForms.get(SYSTEM_PROMPT_NS))
  ctx.effect(() => () => { card.dispose() }, 'ui-settings-prompt: form subscription')
  ctx.effect(() => ctx.configForms.whileServed([SYSTEM_PROMPT_NS], () => ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'prompt', order: 35, label: () => t('nav'), locale: NS, inject: () => card.inject(),
  }, PromptSection))), 'ui-settings-prompt: page')
}
