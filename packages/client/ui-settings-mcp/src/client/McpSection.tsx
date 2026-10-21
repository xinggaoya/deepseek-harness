/**
 * MCP servers settings section: the servers this deployment connects to, each
 * with its transport, its command or endpoint, and the values the deployment
 * keeps for it. The edits are staged and written on save.
 */

import { SettingsForm, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { formLabels } from './locales.ts'
import type { McpCardState, McpPairDraft, McpServerDraft } from './mcp-card-controller.ts'
import css from './McpSection.module.css'

/** The registration-side face the MCP page's slot entry injects. */
export interface McpSectionInjected {
  hooks: {
    /** Page snapshot bound by the renderer as useMcpCard. */
    mcpCard: SnapshotStore<McpCardState>
  }
  /** Replace the page's draft with the given servers. */
  setServers: (servers: McpServerDraft[]) => void
  /** Write the page's draft to the Host. */
  save: () => void
  /** Drop the page's draft. */
  discard: () => void
}

/** Props assembled by the settings renderer. */
export type McpSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.mcp'>
  & InjectFace<McpSectionInjected>

/** The name a new server draft carries until the user renames it. */
function nextName(servers: McpServerDraft[]): string {
  let index = servers.length + 1
  while (servers.some(server => server.name === `server-${String(index)}`)) index += 1
  return `server-${String(index)}`
}

/** One empty server draft. */
function emptyServer(name: string): McpServerDraft {
  return {
    name,
    transport: 'stdio',
    command: '',
    args: '',
    cwd: '',
    url: '',
    enabled: true,
    env: [],
    headers: [],
  }
}

/**
 * Render the MCP servers editor.
 * @param props - the page's locale copy, its snapshot, and the draft actions.
 * @returns the MCP servers settings section.
 */
export function McpSection({ t, useMcpCard, setServers, save, discard }: McpSectionProps) {
  const state = useMcpCard(value => value)
  const disabled = !state.writable || state.saving
  const servers = state.servers

  const update = (name: string, patch: Partial<McpServerDraft>): void => {
    setServers(servers.map(server => (server.name === name ? { ...server, ...patch } : server)))
  }

  return (
    <section className={css.section}>
      <h2 className={css.heading}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>
      <SettingsForm labels={formLabels(t)} state={state} onSave={save} onDiscard={discard}>
        {servers.length === 0
          ? <p className={css.empty}>{t('empty')}</p>
          : null}
        {servers.map((server, index) => (
          <article key={server.name} className={css.server}>
            <div className={css.serverHead}>
              <span className={css.serverName}>{server.name}</span>
              <button
                type="button"
                className={css.remove}
                disabled={disabled}
                onClick={() => { setServers(servers.filter(entry => entry.name !== server.name)) }}
              >
                {t('remove')}
              </button>
            </div>
            <div className={css.field}>
              <label className={css.label} htmlFor={`mcp-server-${String(index)}-name`}>{t('name')}</label>
              <input
                id={`mcp-server-${String(index)}-name`}
                className={css.input}
                value={server.name}
                disabled={disabled}
                onChange={(event) => {
                  const name = event.target.value
                  setServers(servers.map(entry => (entry.name === server.name ? { ...entry, name } : entry)))
                }}
              />
              <span className={css.hint}>{t('nameHint')}</span>
            </div>
            <div className={css.field}>
              <label className={css.label} htmlFor={`mcp-server-${String(index)}-transport`}>{t('transport')}</label>
              <select
                id={`mcp-server-${String(index)}-transport`}
                className={css.input}
                value={server.transport}
                disabled={disabled}
                onChange={(event) => {
                  update(server.name, { transport: event.target.value === 'streamable-http' ? 'streamable-http' : 'stdio' })
                }}
              >
                <option value="stdio">{t('transportStdio')}</option>
                <option value="streamable-http">{t('transportHttp')}</option>
              </select>
            </div>
            {server.transport === 'stdio'
              ? (
                <>
                  <div className={css.field}>
                    <label className={css.label} htmlFor={`mcp-server-${String(index)}-command`}>{t('command')}</label>
                    <input
                      id={`mcp-server-${String(index)}-command`}
                      className={css.input}
                      value={server.command}
                      disabled={disabled}
                      onChange={(event) => { update(server.name, { command: event.target.value }) }}
                    />
                    <span className={css.hint}>{t('commandHint')}</span>
                  </div>
                  <div className={css.field}>
                    <label className={css.label} htmlFor={`mcp-server-${String(index)}-args`}>{t('args')}</label>
                    <textarea
                      id={`mcp-server-${String(index)}-args`}
                      className={css.textArea}
                      value={server.args}
                      disabled={disabled}
                      onChange={(event) => { update(server.name, { args: event.target.value }) }}
                    />
                    <span className={css.hint}>{t('argsHint')}</span>
                  </div>
                  <div className={css.field}>
                    <label className={css.label} htmlFor={`mcp-server-${String(index)}-cwd`}>{t('cwd')}</label>
                    <input
                      id={`mcp-server-${String(index)}-cwd`}
                      className={css.input}
                      value={server.cwd}
                      disabled={disabled}
                      onChange={(event) => { update(server.name, { cwd: event.target.value }) }}
                    />
                    <span className={css.hint}>{t('cwdHint')}</span>
                  </div>
                  <PairList
                    id={`mcp-server-${String(index)}-env`}
                    title={t('env')}
                    hint={t('envHint')}
                    nameLabel={t('pairName')}
                    valueLabel={t('pairValue')}
                    addLabel={t('addPair')}
                    removeLabel={t('removePair')}
                    pairs={server.env}
                    disabled={disabled}
                    onChange={(pairs) => { update(server.name, { env: pairs }) }}
                  />
                </>
              )
              : (
                <>
                  <div className={css.field}>
                    <label className={css.label} htmlFor={`mcp-server-${String(index)}-url`}>{t('url')}</label>
                    <input
                      id={`mcp-server-${String(index)}-url`}
                      className={css.input}
                      value={server.url}
                      disabled={disabled}
                      onChange={(event) => { update(server.name, { url: event.target.value }) }}
                    />
                    <span className={css.hint}>{t('urlHint')}</span>
                  </div>
                  <PairList
                    id={`mcp-server-${String(index)}-headers`}
                    title={t('headers')}
                    hint={t('headersHint')}
                    nameLabel={t('pairName')}
                    valueLabel={t('pairValue')}
                    addLabel={t('addPair')}
                    removeLabel={t('removePair')}
                    pairs={server.headers}
                    disabled={disabled}
                    onChange={(pairs) => { update(server.name, { headers: pairs }) }}
                  />
                </>
              )}
            <div className={css.toggle}>
              <label className={css.toggleRow}>
                <span>{t('enabled')}</span>
                <Switch
                  checked={server.enabled}
                  label={t('enabled')}
                  disabled={disabled}
                  onChange={(checked) => { update(server.name, { enabled: checked }) }}
                />
              </label>
              <p className={css.hint}>{t('enabledHint')}</p>
            </div>
          </article>
        ))}
        <button
          type="button"
          className={css.add}
          disabled={disabled}
          onClick={() => { setServers([...servers, emptyServer(nextName(servers))]) }}
        >
          {t('add')}
        </button>
      </SettingsForm>
    </section>
  )
}

/** One list of name/value pairs: environment variables or request headers. */
function PairList(props: {
  id: string
  title: string
  hint: string
  nameLabel: string
  valueLabel: string
  addLabel: string
  removeLabel: string
  pairs: McpPairDraft[]
  disabled: boolean
  onChange: (pairs: McpPairDraft[]) => void
}) {
  return (
    <div className={css.pairs}>
      <span className={css.label}>{props.title}</span>
      <span className={css.hint}>{props.hint}</span>
      {props.pairs.map((pair, index) => (
        <div key={String(index)} className={css.pairRow}>
          <input
            id={`${props.id}-name-${String(index)}`}
            className={css.input}
            aria-label={props.nameLabel}
            value={pair.key}
            disabled={props.disabled}
            onChange={(event) => {
              const next = props.pairs.map((entry, position) => (
                position === index ? { ...entry, key: event.target.value } : entry
              ))
              props.onChange(next)
            }}
          />
          <input
            id={`${props.id}-value-${String(index)}`}
            className={css.input}
            aria-label={props.valueLabel}
            value={pair.value}
            disabled={props.disabled}
            onChange={(event) => {
              const next = props.pairs.map((entry, position) => (
                position === index ? { ...entry, value: event.target.value } : entry
              ))
              props.onChange(next)
            }}
          />
          <button
            type="button"
            className={css.remove}
            disabled={props.disabled}
            onClick={() => { props.onChange(props.pairs.filter((_entry, position) => position !== index)) }}
          >
            {props.removeLabel}
          </button>
        </div>
      ))}
      <button
        type="button"
        className={css.add}
        disabled={props.disabled}
        onClick={() => { props.onChange([...props.pairs, { key: '', value: '' }]) }}
      >
        {props.addLabel}
      </button>
    </div>
  )
}
