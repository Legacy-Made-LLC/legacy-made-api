/**
 * Group array items by a key.
 *
 * @example
 * const files = [{ entryId: 'a', name: 'f1' }, { entryId: 'a', name: 'f2' }, { entryId: 'b', name: 'f3' }];
 * groupBy(files, 'entryId');
 * // Returns: { a: [{...}, {...}], b: [{...}] }
 */
export function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce(
    (acc, item) => {
      const k = String(item[key]);
      (acc[k] = acc[k] || []).push(item);
      return acc;
    },
    {} as Record<string, T[]>,
  );
}
