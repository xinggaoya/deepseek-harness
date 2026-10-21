---
kind: upgrade-guide
description: "The shipped Web agent presets no longer declare a persona row; the deployment persona owns the persona every preset session starts from."
---

# Update deployments that overrode a preset persona

English | [中文](guide.zh.md)

## Change

The `standard`, `cordis`, and `ptc` agent presets shipped with the Web bundle no longer declare a `persona` row. The persona a session starts from is now the deployment persona — the `personaPrefix` of the `system-prompt` plugin's Loader entry — which the Web settings page **Default prompt** edits. The rendered persona text is unchanged: the deployment still starts with `You are a coding agent powered by the {{model}} model.` unless the deployment says otherwise. The `minimal` preset keeps its own persona, which continues to shadow the deployment persona for its sessions.

The `system-prompt` plugin also accepts a new `personaComplete` field. When it is true, the deployment persona replaces every other prompt section, including the Harness identity line.

## Migration

1. A profile patch that overrode a preset's `persona` row no longer matches an existing declaration and fails to apply. Move that text to the deployment's `system-prompt` entry, or re-add a `persona` row to the preset the patch overrides.
2. A deployment that changed the persona through a preset's own composition keeps its behavior only while that preset still declares the row; add the row back to the preset when the persona must stay specific to it.
3. No change is needed for a deployment that never overrode a preset persona: the deployment persona produces the same prompt text as before.
