export function firstOf<T>(maybeArray: T | T[]): T | undefined {
  return Array.isArray(maybeArray) ? maybeArray.at(0) : maybeArray;
}
