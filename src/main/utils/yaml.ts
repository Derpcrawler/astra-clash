import yaml, { isPair, isScalar } from 'yaml'

// REALITY short-id is hex, so a digits-only value such as 0123 or 12345678 would be read as a
// number and lose leading zeros or precision, which breaks the node. Every short-id under a
// reality-opts key keeps its source text as a string, in block and flow style alike and in any
// file (profiles, providers, overrides). Taken from Sparkle 369884f.
export function parseYaml<T = unknown>(content: string): T {
  const document = yaml.parseDocument(content, {
    merge: true
  })

  if (document.errors.length > 0) {
    throw document.errors[0]
  }

  yaml.visit(document, {
    Pair(_key, pair, path) {
      if (!isRealityShortId(pair, path)) return

      const value = pair.value
      if (!isScalar(value)) return

      // Leave null, explicit tags and values that are already strings alone.
      if (value.value === null || typeof value.value === 'string' || value.tag) return
      if (value.source === undefined) return

      value.value = value.source
      value.tag = 'tag:yaml.org,2002:str'
    }
  })

  return (document.toJS() || {}) as T
}

export function stringifyYaml(data: unknown): string {
  return yaml.stringify(data)
}

function isRealityShortId(pair: unknown, path: readonly unknown[]): boolean {
  if (!isPair(pair) || !isScalar(pair.key) || pair.key.value !== 'short-id') return false

  return path.some(
    (node) => isPair(node) && isScalar(node.key) && node.key.value === 'reality-opts'
  )
}
