---
description: "dsh Web 客户端设置页上的默认提示词页：系统提示词注册表所属的部署人设。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-prompt

[English](README.md) | 中文

## 概述

在侧栏打开**设置**并选择**默认提示词**，即可修改本部署每个会话的起始人设。该页可编辑部署人设、附加人设段落、Harness 身份行是否保留，以及人设是否作为完整系统提示词。编辑先暂存，保存时写入。

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

**默认提示词**一节写入提示词注册表所属的 `system-prompt` 命名空间。**默认提示词**是每个会话的起始人设前缀；**附加提示词**是写在工具指引之后的人设后缀。**保留 Harness 身份行**决定固定的开头是否留下，**用我的提示词作为完整系统提示词**决定人设是否取代其余全部段落。点击**保存**之前不会写入任何内容；被覆盖的字段带**已覆盖**标签，旁边是**恢复默认**；自带人设的预设仍使用它自己的人设，而不是部署级的。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

宿主半侧是一个空的 `apply`，只为让本包占一条 Loader 行，客户端模块系统据此送出浏览器半侧。浏览器半侧通过 `ctx.configForms.get` 绑定 `system-prompt` 命名空间，用 `ui-primitives` 的共享 `SettingsFormModel` 在 `PromptCardController` 里维护暂存表单，并通过 `ctx.configForms.whileServed` 把 `PromptSection` 注册进设置外壳的 `settings.section` slot——页面只在 Host 服务该命名空间期间存在。页面文案在本包的 `settings.prompt` 字典里。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [ui-settings](../ui-settings/README.zh.md)——本页依赖的设置 scope 与"命名空间被服务期间"的监视。
- [ui-primitives](../ui-primitives/README.zh.md)——本页渲染的设置表单模型与多行字段。
- [system-prompt](../../core/system-prompt/README.zh.md)——拥有人设段落的提示词注册表。

-----

<a id="model-experience"></a>
## 模型体验

间接影响模型体验：通过该页编辑的部署人设；系统提示词注册表把这段人设渲染进每次请求。

#### KV 缓存影响

本身没有；该页只写配置。人设变化会改变首个提示词段落，因此按前缀缓存的提供方会从首个 token 起重新读取提示词。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **预设自带的人设优先**——声明了 `persona` 行的预会在自己的会话里遮蔽部署人设（完整提示词开关一并被遮蔽）；本页只编辑部署人设。
- **其余段落不在此处编辑**——工具指引与上下文快照属于各自插件。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
