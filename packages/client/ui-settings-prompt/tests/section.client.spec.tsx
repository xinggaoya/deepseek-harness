// @vitest-environment jsdom
/** The Default prompt section: the persona editors, the switches, and the staged writes. */

import { useSyncExternalStore } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { allowAllAccess, contextMenuHook } from '@deepseek-ai/dsh-client-test-runtime'
import type { SettingsFormPathOp, SettingsFormScope, SettingsFormScopeSnapshot } from '@deepseek-ai/dsh-client-ui-primitives'
import { PromptSection } from '../src/client/PromptSection.tsx'
import type { PromptSectionProps } from '../src/client/PromptSection.tsx'
import { en } from '../src/client/locales.ts'
import { PromptCardController, type PromptCardState, type PromptSettings } from '../src/client/prompt-card-controller.ts'

afterEach(cleanup)

const translations: ReadonlyMap<string, string> = new Map(Object.entries(en))

/** The page reads no global slot source; a hook that throws proves it. */
function unusedHook(): never {
  throw new Error('This section does not read global slot sources')
}

function renderSection(state: Partial<{
  personaPrefix: string
  personaSuffix: string
  includeHarnessIdentity: boolean
  personaComplete: boolean
  overridden: boolean
}> = {}) {
  const overridden = state.overridden ?? false
  const field = (text: string) => ({ text, overridden, invalid: false })
  const snapshot: PromptCardState = {
    available: true,
    writable: true,
    dirty: false,
    invalid: false,
    saving: false,
    failed: false,
    personaPrefix: field(state.personaPrefix ?? 'You are a coding agent.'),
    personaSuffix: field(state.personaSuffix ?? ''),
    includeHarnessIdentity: field(state.includeHarnessIdentity ?? true ? 'true' : 'false'),
    personaComplete: field(state.personaComplete ?? false ? 'true' : 'false'),
  }
  const edit = vi.fn()
  const resetField = vi.fn()
  const save = vi.fn()
  const discard = vi.fn()
  const props: PromptSectionProps = {
    close: () => {},
    usePanelInfo: unusedHook,
    useSessions: unusedHook,
    useSessionStatus: unusedHook,
    useSessionRetainInfo: unusedHook,
    useWorkspaces: unusedHook,
    useResource: unusedHook,
    ...allowAllAccess,
    useContextMenu: contextMenuHook(),
    usePromptCard: selector => useSyncExternalStore(
      () => () => {},
      () => selector(snapshot),
      () => selector(snapshot),
    ),
    edit,
    resetField,
    save,
    discard,
    t: key => translations.get(key) ?? key,
  }
  render(<PromptSection {...props} />)
  return { edit, resetField, save, discard }
}

describe('PromptSection', () => {
  it('shows the deployment persona and the trailing prompt', () => {
    renderSection({ personaPrefix: 'You are a careful agent.', personaSuffix: 'Answer in Chinese.' })

    expect(screen.getByRole('heading', { name: en.title })).toBeTruthy()
    expect(screen.getByText(en.intro)).toBeTruthy()
    expect(screen.getByLabelText(en.persona)).toHaveProperty('value', 'You are a careful agent.')
    expect(screen.getByLabelText(en.suffix)).toHaveProperty('value', 'Answer in Chinese.')
  })

  it('keeps the persona draft verbatim', () => {
    const { edit } = renderSection()

    const persona = screen.getByLabelText(en.persona)
    fireEvent.change(persona, { target: { value: 'Line one.\n\nLine two.' } })

    expect(edit).toHaveBeenCalledWith('personaPrefix', 'Line one.\n\nLine two.')
  })

  it('stages the two switches as states', () => {
    const { edit } = renderSection({ includeHarnessIdentity: true, personaComplete: false })

    fireEvent.click(screen.getByRole('switch', { name: en.identity }))
    fireEvent.click(screen.getByRole('switch', { name: en.complete }))

    expect(edit).toHaveBeenCalledWith('includeHarnessIdentity', 'false')
    expect(edit).toHaveBeenCalledWith('personaComplete', 'true')
  })

  it('resets a field to the deployment default', () => {
    const { resetField } = renderSection({ overridden: true })

    fireEvent.click(screen.getAllByRole('button', { name: en.reset })[0]!)

    expect(resetField).toHaveBeenCalledWith('personaPrefix')
  })
})

/** A settings scope that records the writes a save performs. */
function fakeScope(values: PromptSettings, user?: PromptSettings): { scope: SettingsFormScope<PromptSettings>; ops: SettingsFormPathOp[] } {
  const ops: SettingsFormPathOp[] = []
  const snapshot: SettingsFormScopeSnapshot<PromptSettings> = {
    status: 'ready',
    value: values,
    base: values,
    user,
    writable: true,
    revision: 3,
  }
  return {
    ops,
    scope: {
      getSnapshot: () => snapshot,
      subscribe: () => () => {},
      mutate: async (next) => { ops.push(...next); return true },
    },
  }
}

describe('PromptCardController', () => {
  it('writes the persona verbatim and the switches as states', async () => {
    const { scope, ops } = fakeScope({
      personaPrefix: 'You are a coding agent.',
      includeHarnessIdentity: true,
      personaComplete: false,
    })
    const controller = new PromptCardController(scope)

    controller.inject().edit('personaPrefix', 'Line one.\n\nLine two.')
    controller.inject().edit('personaComplete', 'true')
    controller.inject().save()
    await vi.waitFor(() => { expect(ops).toHaveLength(2) })

    expect(ops).toEqual([
      { op: 'set', path: ['personaPrefix'], value: 'Line one.\n\nLine two.' },
      { op: 'set', path: ['personaComplete'], value: true },
    ])
  })

  it('clears a field back to the composition layer', async () => {
    const { scope, ops } = fakeScope(
      { personaPrefix: 'You are a coding agent.' },
      { personaPrefix: 'You are a coding agent.' },
    )
    const controller = new PromptCardController(scope)

    controller.inject().resetField('personaPrefix')
    controller.inject().save()
    await vi.waitFor(() => { expect(ops).toHaveLength(1) })

    expect(ops).toEqual([{ op: 'unset', path: ['personaPrefix'] }])
  })
})
