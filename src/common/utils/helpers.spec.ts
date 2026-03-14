import { mergeMetadata } from './helpers';

describe('mergeMetadata', () => {
  it('returns existing metadata when incoming is undefined', () => {
    const existing = { foo: 'bar', baz: 42 };
    expect(mergeMetadata(existing, undefined)).toEqual({ foo: 'bar', baz: 42 });
  });

  it('returns empty object when both are empty/undefined', () => {
    expect(mergeMetadata(undefined, undefined)).toEqual({});
    expect(mergeMetadata(null, undefined)).toEqual({});
    expect(mergeMetadata({}, undefined)).toEqual({});
  });

  it('merges incoming keys into existing', () => {
    const existing = { a: 1, b: 2 };
    const incoming = { b: 3, c: 4 };
    expect(mergeMetadata(existing, incoming)).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('strips keys set to null', () => {
    const existing = { a: 1, b: 2, c: 3 };
    const incoming = { b: null, d: 'new' };
    expect(mergeMetadata(existing, incoming)).toEqual({ a: 1, c: 3, d: 'new' });
  });

  it('strips keys that are null in incoming even if not in existing', () => {
    const existing = { a: 1 };
    const incoming = { b: null };
    expect(mergeMetadata(existing, incoming)).toEqual({ a: 1 });
  });

  it('handles non-object existing gracefully', () => {
    expect(mergeMetadata('not-an-object', { a: 1 })).toEqual({ a: 1 });
    expect(mergeMetadata(42, { a: 1 })).toEqual({ a: 1 });
  });

  it('does not mutate the original existing metadata', () => {
    const existing = { a: 1, b: 2 };
    mergeMetadata(existing, { a: null });
    expect(existing).toEqual({ a: 1, b: 2 });
  });
});
