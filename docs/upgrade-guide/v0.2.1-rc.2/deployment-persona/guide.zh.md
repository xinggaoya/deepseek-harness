---
kind: upgrade-guide
description: "Web 随附的 Agent 预设不再声明 persona 行；部署人设决定每个预设会话的起始人设。"
---

# 更新覆盖过预设人设的部署

[English](guide.md) | 中文

## 变更

Web 随附的 `standard`、`cordis`、`ptc` Agent 预设不再声明 `persona` 行。会话的起始人设现在由部署人设决定——即 `system-prompt` 插件 Loader 条目的 `personaPrefix`——并可在 Web 设置页的**默认提示词**中编辑。渲染出的人设文本没有变化：部署仍然以 `You are a coding agent powered by the {{model}} model.` 开头，除非部署另有声明。`minimal` 预设保留自己的人设，它在自己的会话里继续遮蔽部署人设。

`system-prompt` 插件还接受新的 `personaComplete` 字段。为 true 时，部署人设取代其余全部提示词段落，包括 Harness 身份行。

## 迁移

1. 覆盖过预设 `persona` 行的 profile 补丁不再匹配任何已有声明，应用时会失败。把那段文本移到部署的 `system-prompt` 条目，或在补丁所覆盖的预设里重新加回 `persona` 行。
2. 通过预设自身组合修改人设的部署，只有在该预设仍声明该行时才保持原行为；当人设必须属于某个预设时，请把该行加回该预设。
3. 从未覆盖过预设人设的部署无需改动：部署人设产生与此前相同的提示词文本。
