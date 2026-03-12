import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CacheService } from './cache.service';

describe('CacheService', () => {
  let service: CacheService;
  const store = new Map<string, unknown>();

  const mockCacheManager = {
    get: jest.fn(async (key: string) => store.get(key)),
    set: jest.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };

  beforeEach(async () => {
    store.clear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('get/set', () => {
    it('should store and retrieve a value', async () => {
      await service.set('key1', 'value1');
      const result = await service.get('key1');
      expect(result).toBe('value1');
    });

    it('should return undefined for missing keys', async () => {
      const result = await service.get('missing');
      expect(result).toBeUndefined();
    });
  });

  describe('del', () => {
    it('should delete a cached value', async () => {
      await service.set('key1', 'value1');
      await service.del('key1');
      const result = await service.get('key1');
      expect(result).toBeUndefined();
    });
  });

  describe('getOrSet', () => {
    it('should return cached value without calling factory', async () => {
      await service.set('key1', 'cached');
      const factory = jest.fn().mockResolvedValue('fresh');

      const result = await service.getOrSet('key1', factory);

      expect(result).toBe('cached');
      expect(factory).not.toHaveBeenCalled();
    });

    it('should call factory and cache result when key is missing', async () => {
      const factory = jest.fn().mockResolvedValue('fresh');

      const result = await service.getOrSet('key1', factory);

      expect(result).toBe('fresh');
      expect(factory).toHaveBeenCalledTimes(1);
      expect(await service.get('key1')).toBe('fresh');
    });

    it('should coalesce concurrent requests for the same key', async () => {
      let resolveFactory!: (value: string) => void;
      const factoryPromise = new Promise<string>((resolve) => {
        resolveFactory = resolve;
      });
      const factory = jest.fn(() => factoryPromise);

      const p1 = service.getOrSet('key1', factory);
      // Yield to let the first getOrSet register the in-flight promise
      await new Promise((r) => setImmediate(r));
      const p2 = service.getOrSet('key1', factory);

      resolveFactory('result');

      const [r1, r2] = await Promise.all([p1, p2]);

      expect(r1).toBe('result');
      expect(r2).toBe('result');
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('should clean up in-flight tracking after factory error', async () => {
      const failFactory = jest
        .fn()
        .mockRejectedValue(new Error('factory failed'));
      const successFactory = jest.fn().mockResolvedValue('success');

      await expect(service.getOrSet('key1', failFactory)).rejects.toThrow(
        'factory failed',
      );

      // Subsequent call should invoke factory again, not hang on the failed promise
      const result = await service.getOrSet('key1', successFactory);
      expect(result).toBe('success');
    });
  });
});
