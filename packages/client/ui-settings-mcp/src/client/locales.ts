/** Locale bundles for the MCP servers settings page. */

import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'

/** Locale keys the page renders. */
export type McpSettingsLocaleKey =
  | 'nav' | 'title' | 'intro' | 'empty'
  | 'add' | 'remove' | 'removeHint'
  | 'name' | 'nameHint'
  | 'transport' | 'transportStdio' | 'transportHttp'
  | 'command' | 'commandHint' | 'args' | 'argsHint' | 'cwd' | 'cwdHint'
  | 'url' | 'urlHint' | 'enabled' | 'enabledHint'
  | 'env' | 'envHint' | 'headers' | 'headersHint'
  | 'pairName' | 'pairValue' | 'addPair' | 'removePair'
  | 'save' | 'saving' | 'saveFailed' | 'readOnly' | 'unavailable' | 'discard'

/** English copy. */
export const en: Record<McpSettingsLocaleKey, string> = {
  nav: 'MCP servers',
  title: 'MCP servers',
  intro: 'The Model Context Protocol servers this deployment connects to. Their tools are available to every session.',
  empty: 'No MCP server is configured yet.',
  add: 'Add a server',
  remove: 'Remove',
  removeHint: 'The server is disconnected and its tools are unregistered.',
  name: 'Name',
  nameHint: 'The server name; its tools are published as mcp__<name>__<tool>.',
  transport: 'Transport',
  transportStdio: 'Local process (stdio)',
  transportHttp: 'Remote endpoint (streamable HTTP)',
  command: 'Command',
  commandHint: 'The program that starts the server.',
  args: 'Arguments',
  argsHint: 'One argument per line.',
  cwd: 'Working directory',
  cwdHint: 'Where the server process starts; empty uses the deployment directory.',
  url: 'Endpoint URL',
  urlHint: 'The streamable HTTP endpoint of the server.',
  enabled: 'Connect to this server',
  enabledHint: 'A disabled server keeps its configuration and stays disconnected.',
  env: 'Environment variables',
  envHint: 'Written to the server process. The values never travel back from the deployment.',
  headers: 'Headers',
  headersHint: 'Sent with every request to the endpoint. The values never travel back from the deployment.',
  pairName: 'Name',
  pairValue: 'Value',
  addPair: 'Add',
  removePair: 'Remove',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The deployment did not accept these servers; they were left for you to correct.',
  readOnly: 'This deployment stores settings read-only.',
  unavailable: 'This deployment exposes no MCP server settings.',
  discard: 'Discard',
}

/** Simplified Chinese copy. */
export const zh: Record<McpSettingsLocaleKey, string> = {
  nav: 'MCP 服务器',
  title: 'MCP 服务器',
  intro: '本部署连接的 Model Context Protocol 服务器，其工具对每个会话可用。',
  empty: '尚未配置任何 MCP 服务器。',
  add: '添加服务器',
  remove: '移除',
  removeHint: '该服务器会断开连接，其工具会被注销。',
  name: '名称',
  nameHint: '服务器名称，其工具以 mcp__<名称>__<工具> 的形式发布。',
  transport: '传输方式',
  transportStdio: '本地进程（stdio）',
  transportHttp: '远程端点（streamable HTTP）',
  command: '命令',
  commandHint: '启动该服务器的程序。',
  args: '参数',
  argsHint: '每行一个参数。',
  cwd: '工作目录',
  cwdHint: '服务器进程的启动目录；留空则使用部署目录。',
  url: '端点地址',
  urlHint: '服务器的 streamable HTTP 端点。',
  enabled: '连接该服务器',
  enabledHint: '停用的服务器保留配置，但保持断开。',
  env: '环境变量',
  envHint: '写入服务器进程。这些值不会从部署回传。',
  headers: '请求头',
  headersHint: '随每次请求发送到端点。这些值不会从部署回传。',
  pairName: '名称',
  pairValue: '值',
  addPair: '添加',
  removePair: '移除',
  save: '保存',
  saving: '保存中…',
  saveFailed: '本部署没有接受这些服务器，已保留供你修改。',
  readOnly: '本部署的设置为只读。',
  unavailable: '本部署没有开放 MCP 服务器设置。',
  discard: '丢弃',
}

/**
 * The form frame's copy, read from this page's dictionary.
 * @param t - the page's locale reader.
 * @returns the labels the shared settings form renders.
 */
export function formLabels(t: (key: McpSettingsLocaleKey) => string): SettingsFormLabels {
  return {
    unavailable: t('unavailable'),
    readOnly: t('readOnly'),
    saveFailed: t('saveFailed'),
    save: t('save'),
    saving: t('saving'),
  }
}
