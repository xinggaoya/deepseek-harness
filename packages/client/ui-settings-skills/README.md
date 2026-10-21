---
description: "The Skills settings section on the dsh web client: the skill catalog the current project offers."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-skills

English | [中文](README.zh.md)

## Summary

Open **Settings** in the sidebar and select **Skills** to see every skill the current project offers: the name, the routing description, where the skill was discovered, and whether the model or the user may invoke it. The list is read-only; a filter narrows it by name or description.

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

The **Skills** section lists the catalog the Host reports for the project the main view works in. Each row carries the skill's kebab-case name, its description, a source label (project, user, bundled, runtime, or other), a **Model-invokable** and **User-invokable** tag for its invocation policy, and the `SKILL.md` path when a filesystem provider supplied one. Typing in the filter narrows the list by name or description; a filter that matches nothing says so.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host half is an empty `apply`, present only so the package holds a Loader row the client module system serves the browser half for. The browser half registers `SkillsSection` into the settings shell's `settings.section` slot and reads the catalog over the Host's `skills` Remote namespace, which answers either a Session's composer view or a project view. `SkillsSectionController` keeps the catalog and the filter text in one snapshot store, and the section derives the visible rows from that snapshot. The page's copy lives in this package's `settings.skills` dictionary.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-settings](../ui-settings/README.md) — the settings domain base the section registers into.
- [ui-settings-general](../ui-settings-general/README.md) — the settings shell that renders the section navigation.
- [session-controller](../../api/session-controller/README.md) — the Host owner of the `skills` Remote namespace.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side settings surface that registers no model surface.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The catalog is read-only** — a skill's invocation policy belongs to the provider that contributed it, so this page lists the policy instead of editing it.
- **One project's view** — the section shows the catalog of the project the main view works in, or the Host's default working directory when no session is open.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
