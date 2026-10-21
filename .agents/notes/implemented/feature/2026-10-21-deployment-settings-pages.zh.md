# Agent Note: 在设置外壳中拥有本部署的技能、默认提示词与 MCP 服务器

Status: implemented

[English](2026-10-21-deployment-settings-pages.md) | 中文

## Problem

Web 客户端无法展示部署提供了什么，无法修改会话的起始提示词，也无法可视化配置它连接的 MCP 服务器。需要三个界面：列出技能的页面、编辑默认提示词（可整体改写）的页面，以及可视化配置 MCP 服务器的页面。

每个界面都提出同一个归属问题。会话看到的技能来自注册它们的提供方；提示词来自提示词注册表以及遮蔽它的预设；MCP 服务器来自部署在配置中声明的 `mcp-client` 实例。要编辑其中任何一项的页面都必须选定一个归属，而设置外壳是用户查找此类改动的地方。

## Decision

### 技能页只展示，不编辑

`@deepseek-ai/dsh-client-ui-settings-skills` 注册一个 `settings.section` 行，并通过 `skills` Remote 命名空间读取目录。`skills.list` 请求新增了按预设的形式：会话 id 列出该会话的技能，预设 id 列出该预设作用域提供的全部技能，每项都带来源与用户是否可调用。技能的调用策略属于贡献它的提供方，因此该页陈述策略而不编辑它。

### 默认提示词页编辑部署人设

`@deepseek-ai/dsh-client-ui-settings-prompt` 编辑 `system-prompt` 命名空间。`system-prompt` 插件现在把 `personaPrefix`、`personaSuffix` 与 `includeHarnessIdentity` 暴露为易失字段，并在 Loader 提交新值时重新注册其提示词段落，因此编辑无需重启即可生效。新的 `personaComplete` 字段让人设前缀成为完整系统提示词：身份行、附加提示词以及其余全部段落都退出。

随附的 Web 预设声明了一行 `persona`，其文本与部署人设相同，而预设作用域的段落会遮蔽部署的那个。这些行已移除，因此部署人设就是每个预设会话的起始人设，该页编辑的正是用户看到的内容。`minimal` 预设保留自己的人设，继续遮蔽部署人设。

### MCP 服务器页配置本部署的服务器

`@deepseek-ai/dsh-mcp-servers` 拥有 `mcp-servers` 设置命名空间：每个服务器一个条目，以成为其工具命名空间前缀的名称为键。每个条目声明一种传输方式——带命令、参数、环境与工作目录的本地进程，或带请求头的远程端点——以及部署是否连接它。管理器把运行中的 `mcp-client` 实例与该命名空间对齐：新增或变更的条目启动一个客户端，移除或停用的条目停掉它的客户端。这些服务器属于部署级，因此每个会话都能看到它们的工具。

`@deepseek-ai/dsh-client-ui-settings-mcp` 通过路径操作编辑该命名空间，因为服务器列表是条目字典而非扁平字段集合。环境变量与请求头的值是机密：设置服务不会在任何响应里返回它们，因此该页只能写入，读不回。

## Alternatives considered

**让默认提示词页编辑每个预设自己的人设。** 预设的人设属于其组合，预设页已经以只读方式展示组合。编辑某一个预设的人设会让其余预设仍用部署的文本，于是"默认提示词"因预设而异——与"默认"相反。

**保留各预设的 persona 行，并给部署人设换一个段落名。** 提示词注册表就会为预设会话渲染两个人设段落，其中一个为空，而部署人设的 `complete` 开关还得压过预设自己的开关——没有提示词阅读者会预期这样的规则。

**给 MCP 页单独的 Host 服务与自定持久化格式。** 设置域已经提供存储、脱敏、版本与热重载，字典键也能通过路径操作增删。为一个列表再复制一套机制并不划算。

**把 MCP 服务器限定到会话。** 会话级的服务器列表需要每个会话一个客户端，并让每个会话拥有不同的工具集合，这没有部署会需要。

## Consequences

设置外壳新增三个页面。技能页只读。默认提示词页改变部署中每个未自带人设的会话的提示词。MCP 页改变部署连接哪些服务器；连不上的服务器保留其监督器的重连循环，失败出现在部署日志里。

用户能看到两处限制。自带人设的预设仍然压过部署人设，而该页编辑的是部署的那一份。MCP 页无法列出已存的环境变量或请求头，因为部署不会返回它们。

## Testing

- [system-prompt.spec.ts](../../../../packages/core/system-prompt/tests/system-prompt.spec.ts) 固定易失重注册、身份行开关与完整人设。
- [session-skills.host.spec.ts](../../../../packages/api/session-controller/tests/session-skills.host.spec.ts) 固定技能目录的会话视图与预设视图。
- [mcp-servers.spec.ts](../../../../packages/mcp/mcp-servers/tests/mcp-servers.spec.ts) 固定命名空间与运行中客户端的对齐。
- [apply.client.spec.ts](../../../../packages/client/ui-settings-prompt/tests/apply.client.spec.ts)、[section.client.spec.tsx](../../../../packages/client/ui-settings-prompt/tests/section.client.spec.tsx)，以及 [ui-settings-skills](../../../../packages/client/ui-settings-skills/tests) 与 [ui-settings-mcp](../../../../packages/client/ui-settings-mcp/tests) 下的同名文件固定各页的注册与渲染行为。
