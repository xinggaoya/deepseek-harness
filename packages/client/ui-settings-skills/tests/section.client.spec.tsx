// @vitest-environment jsdom
/** The Skills section: the catalog rows, the filter, and the empty and failed states. */

import { useSyncExternalStore } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { allowAllAccess, contextMenuHook } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { SkillsSection } from '../src/client/SkillsSection.tsx'
import type { SkillsSectionProps } from '../src/client/SkillsSection.tsx'
import { en } from '../src/client/locales.ts'
import type { SkillsSectionState } from '../src/client/skills-store.ts'

afterEach(cleanup)

const translations: ReadonlyMap<string, string> = new Map(Object.entries(en))

/** The page reads no global slot source; a hook that throws proves it. */
function unusedHook(): never {
  throw new Error('This section does not read global slot sources')
}

const SKILLS: SkillsSectionState['skills'] = [
  {
    name: 'code-review',
    description: 'Review the current change.',
    path: '/project/.agents/skills/code-review/SKILL.md',
    modelInvocable: true,
    userInvocable: true,
    source: 'project-agents',
  },
  {
    name: 'deploy',
    description: 'Ship the release.',
    modelInvocable: true,
    userInvocable: false,
    source: 'bundled',
  },
]

function renderSection(state: Partial<SkillsSectionState> = {}) {
  const store = createSnapshotStore<SkillsSectionState>({
    status: 'ready', error: null, skills: SKILLS, query: '', ...state,
  })
  const load = vi.fn(async () => {})
  const props: SkillsSectionProps = {
    close: () => {},
    usePanelInfo: unusedHook,
    useSessions: unusedHook,
    useSessionStatus: unusedHook,
    useSessionRetainInfo: unusedHook,
    useWorkspaces: unusedHook,
    useResource: unusedHook,
    ...allowAllAccess,
    useContextMenu: contextMenuHook(),
    useSkillsSection: selector => useSyncExternalStore(
      listener => store.subscribe(listener),
      () => selector(store.getSnapshot()),
      () => selector(store.getSnapshot()),
    ),
    load,
    setQuery: (query: string) => { store.set({ ...store.getSnapshot(), query }) },
    t: key => translations.get(key) ?? key,
  }
  render(<SkillsSection {...props} />)
  return { load, store }
}

describe('SkillsSection', () => {
  it('lists every skill with its description, source and invocation tags', () => {
    renderSection()

    expect(screen.getByRole('heading', { name: en.title })).toBeTruthy()
    expect(screen.getByText(en.intro)).toBeTruthy()
    expect(screen.getByText('code-review')).toBeTruthy()
    expect(screen.getByText('Review the current change.')).toBeTruthy()
    expect(screen.getByText('Ship the release.')).toBeTruthy()
    expect(screen.getByText(en.sourceProject)).toBeTruthy()
    expect(screen.getByText(en.sourceBundled)).toBeTruthy()
    expect(screen.getAllByText(en.modelTag)).toHaveLength(2)
    expect(screen.getAllByText(en.userTag)).toHaveLength(1)
  })

  it('reads the catalog when the page opens', () => {
    const { load } = renderSection()

    expect(load).toHaveBeenCalledOnce()
  })

  it('filters the list by name and by description', () => {
    renderSection()

    const filter = screen.getByRole('textbox', { name: en.search })
    fireEvent.change(filter, { target: { value: 'deploy' } })

    expect(screen.queryByText('code-review')).toBeNull()
    expect(screen.getByText('deploy')).toBeTruthy()

    fireEvent.change(filter, { target: { value: 'review' } })
    expect(screen.getByText('code-review')).toBeTruthy()
    expect(screen.queryByText('deploy')).toBeNull()
  })

  it('says so when nothing matches the filter', () => {
    renderSection()

    fireEvent.change(screen.getByRole('textbox', { name: en.search }), { target: { value: 'nothing' } })

    expect(screen.getByText(en.empty)).toBeTruthy()
  })

  it('reports a failed read', () => {
    renderSection({ status: 'error', error: 'catalog offline' })

    expect(screen.getByRole('alert').textContent).toBe('catalog offline')
  })

  it('says so while the catalog is loading', () => {
    renderSection({ status: 'loading', skills: [] })

    expect(screen.getByText(en.loading)).toBeTruthy()
  })
})
