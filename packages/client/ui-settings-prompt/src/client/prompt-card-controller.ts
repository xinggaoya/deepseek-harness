/** The default prompt page's staged form over the `system-prompt` settings namespace. */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  SettingsFormModel, settingsBooleanField, settingsTextAreaField,
  type SettingsFieldState, type SettingsFormActions, type SettingsFormScope, type SettingsFormShell,
} from '@deepseek-ai/dsh-client-ui-primitives'

/**
 * Namespace of the system prompt registry's user-owned settings. Spelled here
 * rather than imported: a client package must not depend on a Host package.
 */
export const SYSTEM_PROMPT_NS = 'system-prompt'

/** The deployment persona the page edits. */
export interface PromptSettings {
  /** The persona prefix every session starts from. */
  personaPrefix?: string
  /** The trailing persona section. */
  personaSuffix?: string
  /** Whether the fixed Harness identity line stays in the prompt. */
  includeHarnessIdentity?: boolean
  /** Whether the persona prefix is the complete system prompt. */
  personaComplete?: boolean
}

/** What the default prompt page renders. */
export interface PromptCardState extends SettingsFormShell {
  /** The persona prefix editor. */
  personaPrefix: SettingsFieldState
  /** The trailing persona editor. */
  personaSuffix: SettingsFieldState
  /** The Harness identity switch. */
  includeHarnessIdentity: SettingsFieldState
  /** The complete-prompt switch. */
  personaComplete: SettingsFieldState
}

/** The registration-side face the default prompt page's slot entry injects. */
export interface PromptCardFace extends SettingsFormActions {
  hooks: {
    /** Page snapshot bound by the renderer as usePromptCard. */
    promptCard: SnapshotStore<PromptCardState>
  }
}

/** Bridges the `system-prompt` scope onto the page's staged form. */
export class PromptCardController {
  private readonly form: SettingsFormModel<PromptSettings>
  private readonly store: SnapshotStore<PromptCardState>

  /** @param scope - the bound settings scope for the `system-prompt` namespace. */
  constructor(scope: SettingsFormScope<PromptSettings>) {
    this.form = new SettingsFormModel(scope, [
      settingsTextAreaField('personaPrefix'),
      settingsTextAreaField('personaSuffix'),
      settingsBooleanField('includeHarnessIdentity'),
      settingsBooleanField('personaComplete'),
    ])
    this.store = this.form.bind(() => this.projection())
  }

  private projection(): PromptCardState {
    return {
      ...this.form.shell(),
      personaPrefix: this.form.field('personaPrefix'),
      personaSuffix: this.form.field('personaSuffix'),
      includeHarnessIdentity: this.form.field('includeHarnessIdentity'),
      personaComplete: this.form.field('personaComplete'),
    }
  }

  /**
   * Build the face the page's slot registration injects.
   * @returns the page's snapshot and its form actions.
   */
  inject(): PromptCardFace {
    return { hooks: { promptCard: this.store }, ...this.form.actions() }
  }

  /** Release accepted-value subscriptions. */
  dispose(): void { this.form.dispose() }
}
