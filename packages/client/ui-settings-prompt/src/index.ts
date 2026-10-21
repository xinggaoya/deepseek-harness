/**
 * Default prompt settings section, node half. The empty apply exists so the
 * plugin appears in the host cordis.yml / Loader; the browser half owns the
 * section through exports["./client"], discovered from the package.json
 * dsh.client declaration. The `system-prompt` namespace the page edits is
 * registered by the system prompt registry, so this package registers no
 * namespace of its own.
 */

/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply(): void {}
