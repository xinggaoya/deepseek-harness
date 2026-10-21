---
description: "The Default prompt settings section on the dsh web client: the deployment persona the system prompt registry owns."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-prompt

English | [中文](README.zh.md)

## Summary

Open **Settings** in the sidebar and select **Default prompt** to change the persona every session of this deployment starts from. The page edits the deployment persona, the trailing persona section, whether the fixed Harness identity line stays, and whether the persona is the complete system prompt. Edits are staged and written on save.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The **Default prompt** section writes the `system-prompt` namespace the prompt registry owns. **Default prompt** is the persona prefix every session starts from; **Trailing prompt** is the persona suffix written after the tool guidance. **Keep the Harness identity line** decides whether the fixed opener stays, and **Use my prompt as the complete system prompt** decides whether the persona replaces every other section. Nothing is written until **Save**; an overridden field carries an **Overridden** badge with **Reset to default** beside it, and a preset that declares its own persona keeps that one instead of the deployment's.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host half is an empty `apply`, present only so the package holds a Loader row the client module system serves the browser half for. The browser half binds the `system-prompt` namespace through `ctx.configForms.get`, keeps the staged form in `PromptCardController` over the shared `SettingsFormModel` of `ui-primitives`, and registers `PromptSection` into the settings shell's `settings.section` slot through `ctx.configForms.whileServed` — the page exists only while the Host serves that namespace. The page's copy lives in this package's `settings.prompt` dictionary.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-settings](../ui-settings/README.md) — the settings scope and the served-namespace watch the page rides.
- [ui-primitives](../ui-primitives/README.md) — the settings form model and the text-area field the page renders.
- [system-prompt](../../core/system-prompt/README.md) — the registry that owns the persona sections this page edits.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the deployment persona the page edits; the system prompt registry renders that persona into every request.

#### KV Cache effect

None by itself; the page writes configuration. A changed persona changes the leading prompt section, so a provider that caches by prefix re-reads the prompt from its first token.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **A preset's own persona wins** — a preset that declares a `persona` row shadows the deployment persona for its sessions, complete flag included; the page edits the deployment persona only.
- **The composed sections are not editable here** — the tool guidance and the context snapshots belong to the plugins that own them.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
