// @vitest-environment jsdom
/** The catalog refresh notice, hosted outside the Models page. */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ComponentProps } from 'react'
import { CatalogRefreshToast } from '../src/client/CatalogRefreshToast.tsx'
import type { CatalogNotice, ModelsSettingsState } from '../src/client/store.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

/** Mount the toast over a snapshot carrying one notice. */
function mount(notice: CatalogNotice | null) {
  const dismiss = vi.fn()
  const store = createSnapshotStore<ModelsSettingsState>({
    status: 'ready', error: null, credentialError: null, writable: true, rows: [], namespaces: new Map(),
    catalog: { refreshable: true }, catalogNotice: notice,
  })
  const props = {
    useSnapshot: bindSnapshotSelector(store),
    dismiss,
    t: (key: keyof typeof en) => en[key],
  } as ComponentProps<typeof CatalogRefreshToast>
  const view = render(<CatalogRefreshToast {...props} />)
  return { view, dismiss }
}

describe('CatalogRefreshToast', () => {
  it('announces a re-read catalog', () => {
    mount({ kind: 'refreshed', seq: 1 })
    expect(screen.getByText(en.catalogRefreshed)).toBeTruthy()
  })

  it('announces a failed refresh', () => {
    mount({ kind: 'failed', seq: 1 })
    expect(screen.getByText(en.catalogRefreshFailed)).toBeTruthy()
  })

  it('shows nothing while there is no notice', () => {
    mount(null)
    expect(screen.queryByText(en.catalogRefreshed)).toBeNull()
    expect(screen.queryByText(en.catalogRefreshFailed)).toBeNull()
  })

  it('dismisses the notice when its banner finishes', () => {
    vi.useFakeTimers()
    try {
      const { dismiss } = mount({ kind: 'refreshed', seq: 1 })
      expect(dismiss).not.toHaveBeenCalled()
      vi.advanceTimersByTime(4000)
      expect(dismiss).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
