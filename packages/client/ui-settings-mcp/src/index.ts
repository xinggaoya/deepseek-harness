/**
 * MCP servers settings section, node half. The empty apply exists so the
 * plugin appears in the host cordis.yml / Loader; the browser half owns the
 * section through exports["./client"], discovered from the package.json
 * dsh.client declaration. The `mcp-servers` namespace the page edits is
 * registered by the MCP servers manager, so this package registers no
 * namespace of its own.
 */

/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply(): void {}
