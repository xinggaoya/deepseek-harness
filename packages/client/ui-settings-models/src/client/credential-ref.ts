/**
 * The credential reference grammar this page sends to the Host.
 *
 * The Host's credential seam refuses a whole batch of references when one of
 * them is outside its grammar, so the page checks the names it would send.
 * The pattern mirrors that seam's own rule — a POSIX identifier, which may not
 * begin with a digit — and the page keeps its own copy because the seam's
 * module is Host-side and a browser plugin may not import it.
 */

/** The names a credential reference may take: a POSIX identifier. */
const CREDENTIAL_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Whether a name could address a credential at all.
 *
 * A name outside the grammar has no reference to miss: the Host refuses the
 * request that carries it, which would cost every other row in the same batch
 * its credential state.
 * @param value - candidate reference name.
 * @returns true when the credential seam would accept the name.
 */
export function isCredentialRefName(value: string): boolean {
  return CREDENTIAL_REF_PATTERN.test(value)
}
