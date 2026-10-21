/**
 * Skills settings section: the skill catalog the current project offers, with
 * a filter over the names and descriptions. The list is read-only — a skill's
 * invocation policy belongs to the provider that contributed it.
 */

import { useEffect } from 'react'
import { Input, PathLabel, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SkillEntry } from '@deepseek-ai/dsh-api-session-controller/types'
import { sourceLabel } from './locales.ts'
import type { SkillsSectionState } from './skills-store.ts'
import css from './SkillsSection.module.css'

/** The registration-side face the skills section's slot entry injects. */
export interface SkillsSectionInjected {
  hooks: {
    /** Page snapshot bound by the renderer as useSkillsSection. */
    skillsSection: SnapshotStore<SkillsSectionState>
  }
  /** Read the catalog. */
  load: () => Promise<void>
  /** Set the filter text. */
  setQuery: (query: string) => void
}

/** Props assembled by the settings renderer. */
export type SkillsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.skills'>
  & InjectFace<SkillsSectionInjected>

/** Skills whose name or description carries the query. */
function filterSkills(skills: readonly SkillEntry[], query: string): readonly SkillEntry[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return skills
  return skills.filter(skill =>
    skill.name.toLowerCase().includes(needle)
    || skill.description.toLowerCase().includes(needle))
}

/**
 * Render the skill catalog of the current project.
 * @param props - the page's locale copy, its snapshot, and the read and filter actions.
 * @returns the skills settings section.
 */
export function SkillsSection({ t, useSkillsSection, load, setQuery }: SkillsSectionProps) {
  const state = useSkillsSection(value => value)
  useEffect(() => { void load() }, [load])
  const rows = filterSkills(state.skills, state.query)
  return (
    <section className={css.section}>
      <h2 className={css.heading}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>
      <div className={css.toolbar}>
        <Input
          className={css.search as string}
          aria-label={t('search')}
          placeholder={t('searchPlaceholder')}
          value={state.query}
          onChange={(event) => { setQuery(event.target.value) }}
        />
        <span className={css.count}>{t('count').replace('{count}', String(state.skills.length))}</span>
      </div>
      {state.status === 'loading' ? <p className={css.status}>{t('loading')}</p> : null}
      {state.error === null ? null : <p className={css.error} role="alert">{state.error}</p>}
      {rows.length === 0
        ? <p className={css.empty}>{t('empty')}</p>
        : (
          <ul className={css.list}>
            {rows.map(skill => (
              <li key={skill.name} className={css.item} data-skill-name={skill.name}>
                <div className={css.itemHead}>
                  <code className={css.name}>{skill.name}</code>
                  <Tag tone="neutral">{sourceLabel(skill.source, t)}</Tag>
                  {skill.modelInvocable ? <Tag tone="quiet">{t('modelTag')}</Tag> : null}
                  {skill.userInvocable ? <Tag tone="quiet">{t('userTag')}</Tag> : null}
                </div>
                <p className={css.description}>{skill.description}</p>
                {skill.path === undefined ? null : <PathLabel path={skill.path} className={css.path} />}
              </li>
            ))}
          </ul>
        )}
    </section>
  )
}
