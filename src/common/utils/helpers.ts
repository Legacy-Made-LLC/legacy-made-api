export function firstOf<T>(maybeArray: T | T[]): T | undefined {
  return Array.isArray(maybeArray) ? maybeArray.at(0) : maybeArray;
}

/**
 * Shallow-merge metadata, stripping keys set to `null` (RFC 7396 semantics).
 * Returns the existing metadata unchanged if no incoming metadata is provided.
 */
export function mergeMetadata(
  existing: unknown,
  incoming: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object'
      ? (existing as Record<string, unknown>)
      : {};

  if (!incoming) return base;

  const merged = { ...base, ...incoming };

  for (const key of Object.keys(merged)) {
    if (merged[key] === null) {
      delete merged[key];
    }
  }

  return merged;
}
