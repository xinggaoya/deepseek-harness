/** Locale bundles for the default prompt settings page. */

import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'

/** Locale keys the page renders. */
export type PromptSettingsLocaleKey =
  | 'nav' | 'title' | 'intro'
  | 'persona' | 'personaHint'
  | 'suffix' | 'suffixHint'
  | 'identity' | 'identityHint'
  | 'complete' | 'completeHint'
  | 'overridden' | 'reset' | 'readOnly' | 'unavailable'
  | 'save' | 'saving' | 'saveFailed' | 'invalidBoolean'

/** English copy. */
export const en: Record<PromptSettingsLocaleKey, string> = {
  nav: 'Default prompt',
  title: 'Default prompt',
  intro: 'The persona every session of this deployment starts from, unless a preset declares its own.',
  persona: 'Default prompt',
  personaHint: 'Written before the Harness identity line and the tool guidance. {{model}} and the other registered variables interpolate when the prompt is rendered.',
  suffix: 'Trailing prompt',
  suffixHint: 'Written after the tool guidance. Leave it empty to end the prompt with the guidance.',
  identity: 'Keep the Harness identity line',
  identityHint: 'The fixed "You are an AI agent powered by DeepSeek Harness." opener.',
  complete: 'Use my prompt as the complete system prompt',
  completeHint: 'Drops the identity line, the trailing prompt, the tool guidance, and every other section. A preset that declares its own persona keeps that one instead.',
  overridden: 'Overridden',
  reset: 'Reset to default',
  readOnly: 'This deployment stores settings read-only.',
  unavailable: 'This deployment exposes no system prompt settings.',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
  invalidBoolean: 'This control holds a state, not free text.',
}

/** Simplified Chinese copy. */
export const zh: Record<PromptSettingsLocaleKey, string> = {
  nav: '默认提示词',
  title: '默认提示词',
  intro: '本部署每个会话的起始人设，除非某个预设自带人设。',
  persona: '默认提示词',
  personaHint: '写在 Harness 身份行与工具指引之前。{{model}} 等已注册变量在渲染时插值。',
  suffix: '附加提示词',
  suffixHint: '写在工具指引之后。留空则以工具指引收尾。',
  identity: '保留 Harness 身份行',
  identityHint: '固定的「You are an AI agent powered by DeepSeek Harness.」开头。',
  complete: '用我的提示词作为完整系统提示词',
  completeHint: '去掉身份行、附加提示词、工具指引以及其余全部段落。自带人设的预设仍使用它自己的人设。',
  overridden: '已覆盖',
  reset: '恢复默认',
  readOnly: '本部署的设置为只读。',
  unavailable: '本部署没有开放系统提示词设置。',
  save: '保存',
  saving: '保存中…',
  saveFailed: '本部署没有接受这些值，已保留供你修改。',
  invalidBoolean: '该控件只保存状态，不接受自由文本。',
}

/**
 * The form frame's copy, read from this page's dictionary.
 * @param t - the page's locale reader.
 * @returns the labels the shared settings form renders.
 */
export function formLabels(t: (key: PromptSettingsLocaleKey) => string): SettingsFormLabels {
  return {
    unavailable: t('unavailable'),
    readOnly: t('readOnly'),
    saveFailed: t('saveFailed'),
    save: t('save'),
    saving: t('saving'),
  }
}
