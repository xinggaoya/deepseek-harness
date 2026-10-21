/**
 * Skills settings section, browser half: the skill catalog the current project
 * offers, read through the Host's `skills` Remote namespace. The section owns
 * the Settings navigation entry and the filter; the catalog itself belongs to
 * the Host, which answers either a Session's composer view or a project view.
 */

// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the settings shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: the ctx.remote Context merge.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: the ctx.sessions Context merge.
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { SkillsSection } from './SkillsSection.tsx'
import type { SkillsSectionInjected } from './SkillsSection.tsx'
import { SkillsSectionController } from './skills-store.ts'
import { en, zh, type SkillsSettingsLocaleKey } from './locales.ts'

export type { SkillsSectionInjected, SkillsSectionProps } from './SkillsSection.tsx'
export type { SkillsSectionState } from './skills-store.ts'
export type { SkillsSettingsLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Skills settings section copy. */
    'settings.skills': SkillsSettingsLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.skills'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'remote', 'remote.skills', 'sessions']

/**
 * Mount the skills settings section.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-skills: dictionaries')
  const controller = new SkillsSectionController(ctx)
  ctx.effect(() => () => { controller.dispose() }, 'ui-settings-skills: catalog reader')
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'skills',
    order: 25,
    label: () => t('nav'),
    locale: NS,
    inject: (): SkillsSectionInjected => ({
      hooks: { skillsSection: controller.store },
      load: () => controller.load(),
      setQuery: (query) => { controller.setQuery(query) },
    }),
  }, SkillsSection))
}
