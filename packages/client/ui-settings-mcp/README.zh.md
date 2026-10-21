---
description: "dsh Web 客户端设置页上的 MCP 服务器页：本部署连接的服务器。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-mcp

[English](README.md) | 中文

## 概述

在侧栏打开**设置**并选择 **MCP 服务器**，即可修改本部署连接的 Model Context Protocol 服务器。该页可编辑每个服务器的名称、传输方式、命令或端点、工作目录、环境变量、请求头，以及是否连接该服务器。编辑先暂存，保存时写入。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

**MCP 服务器**一节写入 MCP 服务器管理器所属的 `mcp-servers` 命名空间。一张卡片对应一个服务器：**名称**是部署存储它所用的键，**传输方式**选择本地进程或远程端点，下面的字段随该传输方式变化。**添加服务器**追加一张新卡片；**移除**把该服务器从命名空间里去掉。点击**保存**之前不会写入任何内容。

已存的环境变量或请求头不会回传到浏览器，因此该页只显示本次会话中用户输入的条目；用同名再写一次即替换已存的值。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

宿主半侧是一个空的 `apply`，只为让本包占一条 Loader 行，客户端模块系统据此送出浏览器半侧。浏览器半侧通过 `ctx.configForms.get` 绑定 `mcp-servers` 命名空间，在 `McpCardController` 里把编辑中的服务器保存为草稿，并通过 `ctx.configForms.whileServed` 把 `McpSection` 注册进设置外壳的 `settings.section` slot——页面只在 Host 服务该命名空间期间存在。保存时把草稿转换为路径操作并交给该命名空间的表单。页面文案在本包的 `settings.mcp` 字典里。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [ui-settings](../ui-settings/README.zh.md)——本页依赖的设置 scope 与"命名空间被服务期间"的监视。
- [mcp-servers](../../mcp/mcp-servers/README.zh.md)——本页所编辑命名空间的管理器。

-----

<a id="model-experience"></a>
## 模型体验

间接影响模型体验：通过该页写入的服务器配置；这些服务器贡献的工具 schema 由 mcp 客户端拥有。

#### KV 缓存影响

本身没有；该页只写配置。新增服务器会向请求中加入工具 schema，从而改变提供方发送的内容。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **已存机密始终不可见**——部署不会返回已存的环境变量或请求头，因此该页无法列出或移除它们，只能按名称写入。
- **不显示实时连接状态**——该页负责配置服务器，是否已连接要看部署日志。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
