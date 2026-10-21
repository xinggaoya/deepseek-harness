// @vitest-environment jsdom
/** The MCP servers section: the server list, its fields, and the staged writes. */

import { useSyncExternalStore } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { McpSection } from '../src/client/McpSection.tsx'
import type { McpSectionProps } from '../src/client/McpSection.tsx'
import { en } from '../src/client/locales.ts'
import type { McpServerDraft } from '../src/client/mcp-card-controller.ts'

afterEach(cleanup)

const t = (key: keyof typeof en) => en[key]

/** One server draft the page shows. */
function server(overrides: Partial<McpServerDraft> = {}): McpServerDraft {
  return {
    name: 'files',
    transport: 'stdio',
    command: 'npx',
    args: '-y\n@modelcontextprotocol/server-filesystem',
    cwd: '',
    url: '',
    enabled: true,
    env: [],
    headers: [],
    ...overrides,
  }
}

function renderSection(servers: McpServerDraft[] = []) {
  const setServers = vi.fn()
  const save = vi.fn()
  const discard = vi.fn()
  const snapshot = {
    available: true,
    writable: true,
    dirty: false,
    invalid: false,
    saving: false,
    failed: false,
    servers,
  }
  const props = {
    t,
    useMcpCard: (selector: (value: unknown) => unknown) => useSyncExternalStore(
      () => () => {},
      () => selector(snapshot),
      () => selector(snapshot),
    ),
    setServers,
    save,
    discard,
  } as unknown as McpSectionProps
  render(<McpSection {...props} />)
  return { setServers, save, discard }
}

describe('McpSection', () => {
  it('shows the page heading and the empty state without servers', () => {
    renderSection()

    expect(screen.getByRole('heading', { name: en.title })).toBeTruthy()
    expect(screen.getByText(en.intro)).toBeTruthy()
    expect(screen.getByText(en.empty)).toBeTruthy()
  })

  it('shows a server with its command and arguments', () => {
    renderSection([server()])

    expect(screen.getByLabelText(en.command)).toHaveProperty('value', 'npx')
    expect(screen.getByLabelText(en.args)).toHaveProperty('value', '-y\n@modelcontextprotocol/server-filesystem')
    expect(screen.getByRole('switch', { name: en.enabled })).toBeTruthy()
  })

  it('shows the endpoint of an http server instead of the process fields', () => {
    renderSection([server({ transport: 'streamable-http', url: 'https://example.test/mcp' })])

    expect(screen.getByLabelText(en.url)).toHaveProperty('value', 'https://example.test/mcp')
    expect(screen.queryByLabelText(en.command)).toBeNull()
  })

  it('edits a field of one server', () => {
    const { setServers } = renderSection([server()])

    fireEvent.change(screen.getByLabelText(en.command), { target: { value: 'node' } })

    expect(setServers).toHaveBeenCalledWith([expect.objectContaining({ name: 'files', command: 'node' })])
  })

  it('adds a server and removes one', () => {
    const { setServers } = renderSection([server()])

    fireEvent.click(screen.getByRole('button', { name: en.add }))
    expect(setServers).toHaveBeenCalledWith([server(), expect.objectContaining({ name: 'server-2' })])

    fireEvent.click(screen.getByRole('button', { name: en.remove }))
    expect(setServers).toHaveBeenCalledWith([])
  })

  it('adds an environment variable to a server', () => {
    const { setServers } = renderSection([server()])

    fireEvent.click(screen.getByRole('button', { name: en.addPair }))
    expect(setServers).toHaveBeenCalledWith([expect.objectContaining({
      env: [{ key: '', value: '' }],
    })])
  })
})
