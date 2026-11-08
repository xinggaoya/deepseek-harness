/**
 * Keep test suites from reading the live models.dev catalog.
 *
 * The base bundle mounts the catalog service, which reads one document from a
 * third-party host. A suite that boots that bundle would otherwise depend on
 * what the host holds that day: the Models page would list a different set of
 * providers per run, and a run whose host is unreachable would wait out the
 * request timeout before it could answer. The switch keeps the row unmounted
 * in every suite and in the processes they spawn, so a recorded expectation
 * describes the installed pi-ai catalog instead.
 *
 * The in-process guard refuses the catalog endpoints outright, so a suite that
 * mounts the service directly fails at once rather than reaching the network.
 * @module
 */

/** The endpoints the models.dev catalog is read from. */
export const CATALOG_ENDPOINTS: ReadonlySet<string> = new Set([
  'https://models.moncn.cn/api.json',
  'https://models.dev/api.json',
])

/** The switch the base bundle's catalog row reads to stay unmounted. */
process.env.DSH_MODELS_DEV_CATALOG_DISABLED = '1'

const ambientCatalogFetch = globalThis.fetch
globalThis.fetch = (input, init) => {
  const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input
  if (typeof url === 'string' && CATALOG_ENDPOINTS.has(url)) {
    return Promise.reject(new TypeError(`test suites do not reach ${url}; answer it with a fetch stub`))
  }
  return ambientCatalogFetch(input, init)
}
