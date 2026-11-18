/** Hides order request tracking tokens in URLs before they are logged. */
export function redactUrl(url: string | undefined): string | undefined {
  return url?.replace(/(\/order-requests\/track\/)[^/?#]+/, '$1[redacted]');
}
