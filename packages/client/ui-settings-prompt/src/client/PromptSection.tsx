/**
 * Default prompt settings section: the deployment persona every session starts
 * from, the trailing persona section, and the two switches that decide whether
 * the Harness identity line stays and whether the persona is the complete
 * system prompt. The edits are staged and written on save.
 */

import { SettingsForm, SettingsTextAreaField, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { formLabels } from './locales.ts'
import type { PromptCardState } from './prompt-card-controller.ts'
import css from './PromptSection.module.css'

/** The registration-side face the default prompt page's slot entry injects. */
export interface PromptSectionInjected {
  hooks: {
    /** Page snapshot bound by the renderer as usePromptCard. */
    promptCard: SnapshotStore<PromptCardState>
  }
  /** Stage draft text for one field. */
  edit: (field: string, text: string) => void
  /** Stage a clear, so saving lets the field re-inherit the composition layer. */
  resetField: (field: string) => void
  /** Write every staged edit. */
  save: () => void
  /** Drop every staged edit. */
  discard: () => void
}

/** Props assembled by the settings renderer. */
export type PromptSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.prompt'>
  & InjectFace<PromptSectionInjected>

/**
 * Render the deployment persona editor.
 * @param props - the page's locale copy, its snapshot, and the form actions.
 * @returns the default prompt settings section.
 */
export function PromptSection({ t, usePromptCard, edit, resetField, save, discard }: PromptSectionProps) {
  const state = usePromptCard(value => value)
  const disabled = !state.writable || state.saving
  return (
    <section className={css.section}>
      <h2 className={css.heading}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>
      <SettingsForm labels={formLabels(t)} state={state} onSave={save} onDiscard={discard}>
        <SettingsTextAreaField
          id="settings-prompt-persona"
          label={t('persona')}
          hint={t('personaHint')}
          text={state.personaPrefix.text}
          overridden={state.personaPrefix.overridden}
          invalid={state.personaPrefix.invalid}
          overriddenLabel={t('overridden')}
          resetLabel={t('reset')}
          invalidLabel={t('invalidBoolean')}
          disabled={disabled}
          onEdit={(text) => { edit('personaPrefix', text) }}
          onReset={() => { resetField('personaPrefix') }}
        />
        <SettingsTextAreaField
          id="settings-prompt-suffix"
          label={t('suffix')}
          hint={t('suffixHint')}
          text={state.personaSuffix.text}
          overridden={state.personaSuffix.overridden}
          invalid={state.personaSuffix.invalid}
          overriddenLabel={t('overridden')}
          resetLabel={t('reset')}
          invalidLabel={t('invalidBoolean')}
          disabled={disabled}
          onEdit={(text) => { edit('personaSuffix', text) }}
          onReset={() => { resetField('personaSuffix') }}
        />
        <div className={css.toggle}>
          <label className={css.toggleRow}>
            <span>{t('identity')}</span>
            <Switch
              checked={state.includeHarnessIdentity.text === 'true'}
              label={t('identity')}
              disabled={disabled}
              onChange={(checked) => { edit('includeHarnessIdentity', String(checked)) }}
            />
          </label>
          <p className={css.hint}>{t('identityHint')}</p>
        </div>
        <div className={css.toggle}>
          <label className={css.toggleRow}>
            <span>{t('complete')}</span>
            <Switch
              checked={state.personaComplete.text === 'true'}
              label={t('complete')}
              disabled={disabled}
              onChange={(checked) => { edit('personaComplete', String(checked)) }}
            />
          </label>
          <p className={css.hint}>{t('completeHint')}</p>
        </div>
      </SettingsForm>
    </section>
  )
}
