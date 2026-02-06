import { groupBy } from './array';

describe('groupBy', () => {
  it('should group items by a string key', () => {
    const items = [
      { id: '1', category: 'a' },
      { id: '2', category: 'b' },
      { id: '3', category: 'a' },
    ];

    const result = groupBy(items, 'category');

    expect(result).toEqual({
      a: [
        { id: '1', category: 'a' },
        { id: '3', category: 'a' },
      ],
      b: [{ id: '2', category: 'b' }],
    });
  });

  it('should return empty object for empty array', () => {
    const result = groupBy([], 'key');
    expect(result).toEqual({});
  });

  it('should handle single item', () => {
    const items = [{ id: '1', type: 'test' }];
    const result = groupBy(items, 'type');
    expect(result).toEqual({ test: [{ id: '1', type: 'test' }] });
  });

  it('should convert non-string keys to strings', () => {
    const items = [
      { id: '1', count: 1 },
      { id: '2', count: 2 },
      { id: '3', count: 1 },
    ];

    const result = groupBy(items, 'count');

    expect(result).toEqual({
      '1': [
        { id: '1', count: 1 },
        { id: '3', count: 1 },
      ],
      '2': [{ id: '2', count: 2 }],
    });
  });

  it('should handle null key values by converting to "null" string', () => {
    const items = [
      { id: '1', parentId: 'a' },
      { id: '2', parentId: null },
      { id: '3', parentId: 'a' },
    ];

    const result = groupBy(items, 'parentId');

    expect(result).toEqual({
      a: [
        { id: '1', parentId: 'a' },
        { id: '3', parentId: 'a' },
      ],
      null: [{ id: '2', parentId: null }],
    });
  });
});
