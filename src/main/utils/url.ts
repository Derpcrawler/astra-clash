// Subscription headers (profile-web-page-url, support-url) are untrusted. Only http(s) links may be
// stored or opened, so a file: or custom app link from a subscription never reaches the OS.
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false

  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}
