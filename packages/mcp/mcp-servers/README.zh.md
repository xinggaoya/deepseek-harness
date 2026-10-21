---
description: "部署自有的 MCP 服务器：settings 命名空间管理本部署连接的 mcp-client 实例。"
kind: "package-reference"
---

# @deepseek-ai/dsh-mcp-servers

[English](README.md) | 中文

## 概述

`mcp-servers` 设置命名空间保存本部署连接的 MCP 服务器，每个服务器一个条目，以作为工具命名空间前缀的服务器名称为键。本包的管理器把运行中的 `mcp-client` 实例与该命名空间对齐：新增或变更的条目启动一个客户端，移除或停用的条目停掉它的客户端，每个服务器的实时状态则报告给任何询问方。

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

把 `@deepseek-ai/dsh-mcp-servers` 作为 Loader 条目挂载，在其 `servers` 字段里写明服务器，或者留空让用户在 Web 设置里配置。每个条目声明一种传输方式：

```yaml
- id: mcp-servers
  name: '@deepseek-ai/dsh-mcp-servers'
  config:
    servers:
      filesystem:
        transport: stdio
        command: npx
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/srv/data']
      remote:
        transport: streamable-http
        url: https://example.test/mcp
        headers:
          Authorization: 'Bearer …'
```

stdio 条目接受 `command`、`args`、`env`、`cwd`；streamable-http 条目接受 `url` 与 `headers`。`env` 与 `headers` 是机密：设置服务不会在任何响应里返回它们，因此配置界面只能写入、读不回。`enabled: false` 保留配置但保持断开。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

`McpServers` 是注册在服务键 `mcpServers` 下的服务。它的 `Config` 声明一个易失的 `servers` 字典——这正是该命名空间能在设置界面里编辑的原因；Loader 原地提交变更后的字典并以 `loader/volatile-update` 通告，管理器收到该通告后重新对齐。每个服务器作为独立 `mcp-client` fiber 运行在管理器的 fiber 之下，因此释放管理器会停掉每个客户端并注销其工具。配置变更的服务器会被重启；命名空间移除或停用的服务器会被停掉。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [mcp-client](../mcp-client/README.zh.md)——本包为每个服务器拥有一个实例的连接监督器。
- [settings](../../settings/settings/README.zh.md)——本包写入的命名空间。

-----

<a id="model-experience"></a>
## 模型体验

间接影响模型体验：通过管理器拥有的客户端实例；这些服务器贡献的工具 schema 由 mcp 客户端拥有。

#### KV 缓存影响

本身没有；本包只写配置并建立连接。新增服务器会向请求中加入工具，从而改变提供方发送的工具 schema。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **配置界面读不到已存机密**——`env` 与 `headers` 的值不会回传给客户端，因此列出它们的界面只能写入。
- **一个部署一个服务器名**——`mcp-client` 按作用域保留服务器名，两个条目不能同名。
- **实时连接状态不发布**——连不上的服务器会在部署日志里报告失败。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

管理器以 `failOnStartupError: false` 启动每个客户端，因此宕机的服务器保留其监督器的重连循环，部署保持可用；失败以服务器状态的形式报告。

</details>
