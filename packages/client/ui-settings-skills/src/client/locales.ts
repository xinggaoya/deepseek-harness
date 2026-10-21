/** Locale bundles for the skills settings page. */

/** Locale keys the page renders. */
export type SkillsSettingsLocaleKey =
  | 'nav' | 'title' | 'intro'
  | 'search' | 'searchPlaceholder'
  | 'loading' | 'empty' | 'failed'
  | 'sourceProject' | 'sourceUser' | 'sourceBundled' | 'sourceRuntime' | 'sourceOther'
  | 'modelTag' | 'userTag' | 'count'

/** English copy. */
export const en: Record<SkillsSettingsLocaleKey, string> = {
  nav: 'Skills',
  title: 'Skills',
  intro: 'The skills this project offers. Type a name to filter the list.',
  search: 'Filter skills',
  searchPlaceholder: 'Filter by name or description',
  loading: 'Loading skills…',
  empty: 'No skill matches this filter.',
  failed: 'The skills could not be read.',
  sourceProject: 'Project',
  sourceUser: 'User',
  sourceBundled: 'Bundled',
  sourceRuntime: 'Runtime',
  sourceOther: 'Other',
  modelTag: 'Model-invokable',
  userTag: 'User-invokable',
  count: '{count} skills',
}

/** Simplified Chinese copy. */
export const zh: Record<SkillsSettingsLocaleKey, string> = {
  nav: '技能',
  title: '技能',
  intro: '本项目可用的技能。输入名称可筛选列表。',
  search: '筛选技能',
  searchPlaceholder: '按名称或描述筛选',
  loading: '正在加载技能…',
  empty: '没有匹配该筛选条件的技能。',
  failed: '无法读取技能列表。',
  sourceProject: '项目',
  sourceUser: '用户',
  sourceBundled: '内置',
  sourceRuntime: '运行时',
  sourceOther: '其他',
  modelTag: '模型可调用',
  userTag: '用户可调用',
  count: '{count} 个技能',
}

/**
 * The discovery source of one skill, as this page labels it.
 * @param source - the source bucket the Host reported.
 * @param t - the page's locale reader.
 * @returns the localized label for that source.
 */
export function sourceLabel(source: string, t: (key: SkillsSettingsLocaleKey) => string): string {
  if (source === 'project-dsh' || source === 'project-agents') return t('sourceProject')
  if (source === 'user-dsh' || source === 'user-agents') return t('sourceUser')
  if (source === 'bundled') return t('sourceBundled')
  if (source === 'runtime') return t('sourceRuntime')
  return t('sourceOther')
}
