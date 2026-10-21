---
description: "dsh Web 客户端设置页上的技能页：当前项目可用的技能目录。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-skills

[English](README.md) | 中文

## 概述

在侧栏打开**设置**并选择**技能**，即可看到当前项目提供的全部技能：名称、路由描述、技能的发现来源，以及模型或用户是否可以调用它。该列表只读；筛选框可按名称或描述缩小范围。

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

**技能**一节列出 Host 为主视图所在项目报告的目录。每一行给出技能的 kebab-case 名称、描述、来源标签（项目、用户、内置、运行时或其他）、表示调用策略的**模型可调用**与**用户可调用**标签，以及文件系统提供方给出的 `SKILL.md` 路径。在筛选框输入内容会按名称或描述过滤列表；没有匹配项时会明确说明。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

宿主半侧是一个空的 `apply`，只为让本包占一条 Loader 行，客户端模块系统据此送出浏览器半侧。浏览器半侧把 `SkillsSection` 注册进设置外壳的 `settings.section` slot，并通过 Host 的 `skills` Remote 命名空间读取目录——该命名空间既回答某个 Session 的输入框视图，也回答项目视图。`SkillsSectionController` 在一个快照 store 里维护目录与筛选文本，页面从该快照派生出可见行。页面文案在本包的 `settings.skills` 字典里。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [ui-settings](../ui-settings/README.zh.md)——本页注册进去的设置域基础包。
- [ui-settings-general](../ui-settings-general/README.zh.md)——渲染设置分区导航的外壳。
- [session-controller](../../api/session-controller/README.zh.md)——`skills` Remote 命名空间的宿主所有者。

-----

<a id="model-experience"></a>
## 模型体验

无，本包是浏览器侧的技能目录视图；每个技能提供方拥有全部模型面。

#### KV 缓存影响

无；本包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **目录只读**——技能的调用策略属于提供它的提供方，因此本页只展示该策略而不修改它。
- **只呈现一个项目的视图**——本页展示主视图所在项目的目录；没有打开会话时，Host 使用其默认工作目录。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
