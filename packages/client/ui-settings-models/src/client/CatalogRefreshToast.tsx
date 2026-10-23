/**
 * The catalog refresh outcome, hosted outside the Models page.
 *
 * A catalog fetch runs on the Host and takes long enough that the user may
 * leave the Models section while it runs, so its outcome is announced here
 * rather than in the page that asked for it.
 */

import type { ReactNode } from 'react'
import { IconWarningOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelsSettingsStore } from './store.ts'
import type { en } from './locales.ts'

/** Injected dependencies of {@link CatalogRefreshToast} (slot `inject`). */
export interface CatalogRefreshToastInjected {
  hooks: {
    /** Page snapshot bound by the UI renderer as useSnapshot. */
    snapshot: ModelsSettingsStore['store']
  }
  /** Dismiss the notice. */
  dismiss: () => void
  /** Section copy. */
  t: (key: keyof typeof en) => string
}

/**
 * Announce one catalog refresh, whether it re-read the catalog or the Host
 * refused.
 * @param props - the page snapshot, the dismissal, and the section copy.
 * @returns the notice banner, or nothing while there is no notice.
 */
export function CatalogRefreshToast(
  props: PropsRuntime<'shell.overlay'> & InjectFace<CatalogRefreshToastInjected>,
): ReactNode {
  const { useSnapshot, dismiss, t } = props
  const notice = useSnapshot(state => state.catalogNotice)
  if (notice === null) return null
  const failed = notice.kind === 'failed'
  return (
    <Toast
      key={notice.seq}
      text={t(failed ? 'catalogRefreshFailed' : 'catalogRefreshed')}
      {...failed ? { icon: <IconWarningOutlineRegular /> } : {}}
      {...failed ? {} : { tone: 'success' as const }}
      onDone={dismiss}
    />
  )
}
